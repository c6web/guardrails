//! Per-app usage quota tracker (by number of successful upstream requests).
//!
//! The authoritative count is the global `COUNT(*)` over `ai_request_logs`, which every
//! gateway instance writes to. Each instance keeps an in-memory snapshot of that global
//! count plus its own un-reconciled local increments, so the fleet stays consistent without
//! a shared store:
//!
//!   effective_used = global_snapshot + local_delta
//!
//! - `check()` is called before forwarding; it seeds/rolls the period and returns a decision.
//! - `increment()` bumps `local_delta` only at real upstream-success sites in the forwarder.
//! - `spawn_reconcile()` periodically re-counts from the logs DB and resets `local_delta`.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

use chrono::{DateTime, Datelike, TimeZone, Utc};
use sqlx::PgPool;
use tokio::time::{interval, Duration};

/// Per-app quota configuration, sourced from the app's cached settings.
#[derive(Clone)]
pub(crate) struct QuotaConfig {
    pub mode:        String,        // "fixed" | "monthly" (callers skip "unlimited")
    pub limit:       i64,
    pub warning:     Option<i64>,
    pub enforcement: String,        // "hard" | "soft"
    pub reset_day:   Option<u32>,   // 1..=28 for monthly
    pub period_start_override: Option<DateTime<Utc>>,
    /// App creation time — fixed-mode baseline when there's no manual reset.
    /// Must match the console's quotaPeriodStart() so gateway and console agree.
    pub app_created_at: DateTime<Utc>,
}

struct AppQuota {
    global_snapshot: i64,
    local_delta:     i64,
    period_start:    DateTime<Utc>,
    period_end:      Option<DateTime<Utc>>,
    seeded:          bool,
    config:          QuotaConfig,
}

impl AppQuota {
    fn used(&self) -> i64 {
        self.global_snapshot + self.local_delta
    }
}

pub(crate) enum QuotaDecision {
    /// Under the hard limit. `warning` is true once the warning threshold is reached.
    Allowed { used: i64, limit: i64, warning: bool },
    /// At/over the hard limit. Caller blocks (429) when `enforcement == "hard"`.
    Exceeded { used: i64, limit: i64, enforcement: String, period_end: Option<DateTime<Utc>> },
}

#[derive(Clone)]
pub(crate) struct QuotaTracker {
    apps:     Arc<RwLock<HashMap<String, Arc<Mutex<AppQuota>>>>>,
    log_pool: Arc<PgPool>,
}

impl QuotaTracker {
    pub fn new(log_pool: Arc<PgPool>) -> Self {
        QuotaTracker { apps: Arc::new(RwLock::new(HashMap::new())), log_pool }
    }

    /// Compute the current counting window [start, end) for a config.
    /// `end` is `None` for fixed (lifetime) quotas.
    fn compute_period(cfg: &QuotaConfig, now: DateTime<Utc>) -> (DateTime<Utc>, Option<DateTime<Utc>>) {
        if cfg.mode == "monthly" {
            let day = cfg.reset_day.unwrap_or(1).clamp(1, 28);
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
            // A mid-period manual reset re-baselines the start but keeps the same boundary end.
            let start = match cfg.period_start_override {
                Some(o) if o > start && o < end => o,
                _ => start,
            };
            (start, Some(end))
        } else {
            // fixed: count since the manual-reset baseline, or since app creation —
            // must match the console's quotaPeriodStart() fallback (appQuota.ts).
            let start = cfg.period_start_override.unwrap_or(cfg.app_created_at);
            (start, None)
        }
    }

    async fn count_success(&self, app_id: &str, since: DateTime<Utc>) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar::<_, i64>(
            r#"SELECT COUNT(*) FROM ai_request_logs
               WHERE app_id = $1
                 AND status_code BETWEEN 200 AND 299
                 AND upstream_provider_id IS NOT NULL
                 AND created_at >= $2"#,
        )
        .bind(app_id)
        .bind(since)
        .fetch_one(self.log_pool.as_ref())
        .await
    }

    fn get_or_insert(&self, app_id: &str, cfg: &QuotaConfig, now: DateTime<Utc>) -> Arc<Mutex<AppQuota>> {
        if let Some(e) = self.apps.read().unwrap_or_else(|e| e.into_inner()).get(app_id) {
            return e.clone();
        }
        let (start, end) = Self::compute_period(cfg, now);
        let entry = Arc::new(Mutex::new(AppQuota {
            global_snapshot: 0,
            local_delta:     0,
            period_start:    start,
            period_end:      end,
            seeded:          false,
            config:          cfg.clone(),
        }));
        self.apps.write().unwrap_or_else(|e| e.into_inner())
            .entry(app_id.to_string())
            .or_insert_with(|| entry.clone())
            .clone()
    }

    /// Check quota before forwarding. Seeds the snapshot from the logs DB on first sight
    /// or after a period rollover; otherwise it is a cheap in-memory comparison.
    pub async fn check(&self, app_id: &str, cfg: &QuotaConfig) -> QuotaDecision {
        let now = Utc::now();
        let entry = self.get_or_insert(app_id, cfg, now);

        let need_seed = {
            let mut q = entry.lock().unwrap();
            q.config = cfg.clone();
            let rolled = q.period_end.map(|end| now >= end).unwrap_or(false);
            if rolled {
                let (start, end) = Self::compute_period(cfg, now);
                q.period_start = start;
                q.period_end   = end;
                q.global_snapshot = 0;
                q.local_delta     = 0;
                q.seeded = false;
            }
            !q.seeded
        };

        if need_seed {
            let since = entry.lock().unwrap().period_start;
            let count = self.count_success(app_id, since).await;
            match count {
                Ok(c) => {
                    let mut q = entry.lock().unwrap();
                    q.global_snapshot = c;
                    q.local_delta = 0;
                    q.seeded = true;
                }
                Err(e) => {
                    tracing::warn!("[quota] count query failed for app {}: {} — treating quota as exceeded", app_id, e);
                    let mut q = entry.lock().unwrap();
                    q.global_snapshot = q.config.limit;
                    q.local_delta = 0;
                    q.seeded = true;
                }
            }
        }

        let q = entry.lock().unwrap();
        let used = q.used();
        if used >= cfg.limit {
            QuotaDecision::Exceeded {
                used, limit: cfg.limit,
                enforcement: cfg.enforcement.clone(),
                period_end:  q.period_end,
            }
        } else {
            let warning = cfg.warning.map(|w| used >= w).unwrap_or(false);
            QuotaDecision::Allowed { used, limit: cfg.limit, warning }
        }
    }

    /// Count one successful upstream request for this app (local delta only).
    /// No-op for apps without an active quota (no entry seeded by `check`).
    pub fn increment(&self, app_id: &str) {
        if let Some(entry) = self.apps.read().unwrap_or_else(|e| e.into_inner()).get(app_id) {
            entry.lock().unwrap().local_delta += 1;
        }
    }

    /// Periodically re-count every tracked app from the logs DB so all instances converge.
    pub fn spawn_reconcile(self) {
        tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(30));
            ticker.tick().await;
            loop {
                ticker.tick().await;
                let ids: Vec<String> = { self.apps.read().unwrap_or_else(|e| e.into_inner()).keys().cloned().collect() };
                for id in ids {
                    let since = {
                        let entry = self.apps.read().unwrap_or_else(|e| e.into_inner()).get(&id).cloned();
                        let Some(entry) = entry else { continue };
                        let now = Utc::now();
                        let mut q = entry.lock().unwrap();
                        if q.period_end.map(|end| now >= end).unwrap_or(false) {
                            let (start, end) = Self::compute_period(&q.config, now);
                            q.period_start = start;
                            q.period_end   = end;
                        }
                        q.period_start
                    };
                    let count = self.count_success(&id, since).await;
                    let Ok(count) = count else {
                        tracing::warn!("[quota] reconcile count failed for app {}: {} — skipping reconcile", id, count.unwrap_err());
                        continue;
                    };
                    if let Some(entry) = self.apps.read().unwrap_or_else(|e| e.into_inner()).get(&id) {
                        let mut q = entry.lock().unwrap();
                        q.global_snapshot = count;
                        q.local_delta = 0;
                        q.seeded = true;
                    }
                }
            }
        });
    }
}
