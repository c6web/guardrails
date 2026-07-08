//! Per-AI-provider usage meter tracker (enforcement layer).
//!
//! The durable meter lives in `provider_usage_daily` written by the backend rollup job.
//! Each gateway instance keeps an in-memory snapshot + local delta:
//!
//!   effective_used = month_snapshot + local_delta
//!
//! - `check()` → `MeterDecision` before calling a provider.
//! - `increment()` bumps `local_delta` after a successful call.
//! - `spawn_reconcile()` re-reads `provider_usage_daily` every 30s and applies
//!   snapshot-then-subtract to avoid losing increments during the read.
//!
//! Enforcement is intentionally approximate across N gateway instances (each has its own
//! local_delta). This is acceptable for budget governance; it is not financial billing.
//! All errors fail open — a meter-infra failure never blocks traffic.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

use chrono::{DateTime, Datelike, TimeZone, Utc};
use sqlx::PgPool;
use tokio::time::{interval, Duration};

#[derive(Clone, Debug)]
pub(crate) struct ProviderMeterConfig {
    pub metric:      String,          // "requests" | "tokens" | "cost"
    pub limit:       f64,
    pub warning:     Option<f64>,
    pub enforcement: String,          // "hard" | "soft"
    pub reset_day:   u32,             // 1..=28
    pub price_in:    f64,             // USD per 1M input tokens
    pub price_out:   f64,             // USD per 1M output tokens
    pub period_start_override: Option<DateTime<Utc>>,
}

#[derive(Debug)]
struct ProviderMeterState {
    snapshot:     f64,            // last reconciled month total (per metric)
    local_delta:  f64,            // this-instance un-reconciled increments (per metric)
    period_start: DateTime<Utc>,
    period_end:   DateTime<Utc>,
    seeded:       bool,
    config:       ProviderMeterConfig,
}

impl ProviderMeterState {
    fn used(&self) -> f64 { self.snapshot + self.local_delta }
}

pub(crate) enum MeterDecision {
    Allowed { used: f64, limit: f64, warning: bool },
    Exceeded { used: f64, limit: f64, enforcement: String, period_end: DateTime<Utc> },
}

#[derive(Clone)]
pub(crate) struct ProviderMeter {
    providers: Arc<RwLock<HashMap<String, Arc<Mutex<ProviderMeterState>>>>>,
    log_pool:  Arc<PgPool>,
}

impl ProviderMeter {
    pub fn new(log_pool: Arc<PgPool>) -> Self {
        ProviderMeter { providers: Arc::new(RwLock::new(HashMap::new())), log_pool }
    }

    fn compute_period(cfg: &ProviderMeterConfig, now: DateTime<Utc>) -> (DateTime<Utc>, DateTime<Utc>) {
        let day = cfg.reset_day.clamp(1, 28);
        let boundary_this = Utc
            .with_ymd_and_hms(now.year(), now.month(), day, 0, 0, 0)
            .single()
            .unwrap_or(now);
        let start = if now >= boundary_this {
            boundary_this
        } else {
            let (mut y, mut m) = (now.year(), now.month());
            if m == 1 { y -= 1; m = 12; } else { m -= 1; }
            Utc.with_ymd_and_hms(y, m, day, 0, 0, 0).single().unwrap_or(boundary_this)
        };
        let (mut ey, mut em) = (start.year(), start.month());
        if em == 12 { ey += 1; em = 1; } else { em += 1; }
        let end = Utc.with_ymd_and_hms(ey, em, day, 0, 0, 0).single().unwrap_or(start);
        let start = match cfg.period_start_override {
            Some(o) if o > start && o < end => o,
            _ => start,
        };
        (start, end)
    }

    async fn read_month_usage(&self, provider_id: &str, metric: &str, since: DateTime<Utc>) -> f64 {
        let query = match metric {
            "tokens" => {
                sqlx::query_scalar::<_, i64>(
                    "SELECT coalesce(sum(tokens_in + tokens_out), 0) FROM provider_usage_daily
                     WHERE provider_id = $1 AND day >= $2::date"
                )
                .bind(provider_id)
                .bind(since.format("%Y-%m-%d").to_string())
                .fetch_one(self.log_pool.as_ref())
                .await
                .unwrap_or_else(|e| { tracing::warn!("[provider_meter] read failed for {}: {}", provider_id, e); 0 })
            }
            "cost" => {
                // Cost is tokens * pricing; read raw tokens, caller will multiply pricing
                // We return tokens_in and tokens_out separately via a different approach.
                // For simplicity, return 0 here and let check() re-compute from the snapshot
                // (see the "cost" path in check() below which uses stored token counts).
                0
            }
            _ => {
                // requests (default)
                sqlx::query_scalar::<_, i64>(
                    "SELECT coalesce(sum(requests), 0) FROM provider_usage_daily
                     WHERE provider_id = $1 AND day >= $2::date"
                )
                .bind(provider_id)
                .bind(since.format("%Y-%m-%d").to_string())
                .fetch_one(self.log_pool.as_ref())
                .await
                .unwrap_or_else(|e| { tracing::warn!("[provider_meter] read failed for {}: {}", provider_id, e); 0 })
            }
        };
        query as f64
    }

    async fn read_month_cost(&self, provider_id: &str, since: DateTime<Utc>, price_in: f64, price_out: f64) -> f64 {
        let result = sqlx::query_as::<_, (i64, i64)>(
            "SELECT coalesce(sum(tokens_in), 0), coalesce(sum(tokens_out), 0)
             FROM provider_usage_daily WHERE provider_id = $1 AND day >= $2::date"
        )
        .bind(provider_id)
        .bind(since.format("%Y-%m-%d").to_string())
        .fetch_one(self.log_pool.as_ref())
        .await;
        match result {
            Ok((tin, tout)) => (tin as f64 / 1_000_000.0) * price_in + (tout as f64 / 1_000_000.0) * price_out,
            Err(e) => { tracing::warn!("[provider_meter] cost read failed for {}: {}", provider_id, e); 0.0 }
        }
    }

    fn get_or_insert(&self, provider_id: &str, cfg: &ProviderMeterConfig, now: DateTime<Utc>) -> Arc<Mutex<ProviderMeterState>> {
        if let Some(e) = self.providers.read().unwrap_or_else(|e| e.into_inner()).get(provider_id) {
            return e.clone();
        }
        let (start, end) = Self::compute_period(cfg, now);
        let entry = Arc::new(Mutex::new(ProviderMeterState {
            snapshot:     0.0,
            local_delta:  0.0,
            period_start: start,
            period_end:   end,
            seeded:       false,
            config:       cfg.clone(),
        }));
        self.providers.write().unwrap_or_else(|e| e.into_inner())
            .entry(provider_id.to_string())
            .or_insert_with(|| entry.clone())
            .clone()
    }

    pub async fn check(&self, provider_id: &str, cfg: &ProviderMeterConfig) -> MeterDecision {
        let now = Utc::now();
        let entry = self.get_or_insert(provider_id, cfg, now);

        let need_seed = {
            let mut s = entry.lock().unwrap();
            s.config = cfg.clone();
            let rolled = now >= s.period_end;
            if rolled {
                let (start, end) = Self::compute_period(cfg, now);
                s.period_start = start;
                s.period_end   = end;
                s.snapshot     = 0.0;
                s.local_delta  = 0.0;
                s.seeded       = false;
            }
            !s.seeded
        };

        if need_seed {
            let since = entry.lock().unwrap().period_start;
            let snapshot = if cfg.metric == "cost" {
                self.read_month_cost(provider_id, since, cfg.price_in, cfg.price_out).await
            } else {
                self.read_month_usage(provider_id, &cfg.metric, since).await
            };
            let mut s = entry.lock().unwrap();
            s.snapshot    = snapshot;
            s.local_delta = 0.0;
            s.seeded      = true;
        }

        let s = entry.lock().unwrap();
        let used   = s.used();
        let period_end = s.period_end;
        drop(s);

        if used >= cfg.limit {
            MeterDecision::Exceeded { used, limit: cfg.limit, enforcement: cfg.enforcement.clone(), period_end }
        } else {
            let warning = cfg.warning.map(|w| used >= w).unwrap_or(false);
            MeterDecision::Allowed { used, limit: cfg.limit, warning }
        }
    }

    pub fn increment(&self, provider_id: &str, tokens_in: i32, tokens_out: i32) {
        let entry = match self.providers.read().unwrap_or_else(|e| e.into_inner()).get(provider_id).cloned() {
            Some(e) => e,
            None    => return,
        };
        let mut s = entry.lock().unwrap();
        let delta = match s.config.metric.as_str() {
            "tokens" => (tokens_in + tokens_out) as f64,
            "cost"   => (tokens_in  as f64 / 1_000_000.0) * s.config.price_in
                      + (tokens_out as f64 / 1_000_000.0) * s.config.price_out,
            _        => 1.0, // requests
        };
        s.local_delta += delta;
    }

    pub fn spawn_reconcile(self) {
        tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(30));
            ticker.tick().await;
            loop {
                ticker.tick().await;
                let ids: Vec<String> = { self.providers.read().unwrap_or_else(|e| e.into_inner()).keys().cloned().collect() };
                for id in ids {
                    let (since, captured_delta, metric, price_in, price_out) = {
                        let entry = self.providers.read().unwrap_or_else(|e| e.into_inner()).get(&id).cloned();
                        let Some(entry) = entry else { continue };
                        let now = Utc::now();
                        let mut s = entry.lock().unwrap();
                        if now >= s.period_end {
                            let (start, end) = Self::compute_period(&s.config, now);
                            s.period_start = start;
                            s.period_end   = end;
                        }
                        let captured = s.local_delta;
                        (s.period_start, captured, s.config.metric.clone(), s.config.price_in, s.config.price_out)
                    };

                    let snapshot = if metric == "cost" {
                        self.read_month_cost(&id, since, price_in, price_out).await
                    } else {
                        self.read_month_usage(&id, &metric, since).await
                    };

                    if let Some(entry) = self.providers.read().unwrap_or_else(|e| e.into_inner()).get(&id).cloned() {
                        let mut s = entry.lock().unwrap();
                        s.snapshot    = snapshot;
                        // Subtract captured delta to keep increments that arrived during the read
                        s.local_delta = (s.local_delta - captured_delta).max(0.0);
                        s.seeded = true;
                    }
                }
            }
        });
    }
}
