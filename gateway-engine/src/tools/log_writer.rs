use sqlx::{postgres::PgPoolOptions, QueryBuilder};
use std::collections::HashMap;
use std::sync::{Arc, OnceLock, RwLock};
use tokio::sync::mpsc;
use serde_json::Value as JsonValue;

const QUEUE_CAPACITY: usize = 10_000;
const BATCH_SIZE:     usize = 50;

pub struct ProviderCallLogEntry {
    pub request_id:       Option<String>,
    pub call_type:        String,
    pub source:           String,
    pub app_id:           Option<String>,
    pub app_name:         Option<String>,
    pub provider_id:      Option<String>,
    pub provider_name:    Option<String>,
    pub vendor:           Option<String>,
    pub model:            Option<String>,
    pub endpoint:         Option<String>,
    pub request_payload:  Option<String>, // serialized JSON
    pub response_payload: Option<String>, // serialized JSON
    pub tokens_in:        Option<i32>,
    pub tokens_out:       Option<i32>,
    pub tokens_total:     Option<i32>,
    pub duration_ms:      i64,
    pub status_code:      Option<i16>,
    pub success:          bool,
    pub error_message:    Option<String>,
    pub triggered_by:     Option<String>,
}

pub(crate) struct ToolAuditEntry {
    pub request_id:      String,
    pub app_id:          String,
    pub app_name:        String,
    pub tool_name:       String,
    pub invocation_count: i32,
    pub approved:        bool,
    pub violation_flag:  bool,
}

pub struct ReloadLogEntry {
    pub triggered_by:      String,
    pub key_prefix:        String,
    pub source_ip:         String,
    pub result:            String,
    pub error_message:     Option<String>,
    pub duration_ms:       i64,
    pub gateway_instance_id: Option<String>,
}

pub struct EmbeddingLogEntry {
    pub request_id:    Option<String>,
    pub provider_id:   String,
    pub provider_name: String,
    pub model:         Option<String>,
    pub input_chars:   i32,
    pub input_text:    Option<String>,
    pub dimensions:    Option<i32>,
    pub success:       bool,
    pub error_message: Option<String>,
    pub duration_ms:   i64,
    pub source:        String,
}

#[derive(Default)]
pub(crate) struct LogEntry {
    pub request_id:    String,
    pub app_id:        String,
    pub app_name:      String,
    pub model:         String,
    pub method:        String,
    pub path:          String,
    pub source_ip:     String,
    pub app_api_key:   String,
    pub tokens_in:     i32,
    pub tokens_out:    i32,
    pub duration_ms:   i64,
    pub status_code:   i16,
    pub flagged:       bool,
    pub detector:      Option<String>,
    pub confidence:    Option<f32>,
    pub action:        Option<String>,
    pub threat_title:  Option<String>,
    pub excerpt:       Option<String>,
    pub framework_id:  Option<String>,
    pub user_prompt:            Option<String>,
    pub response_body:          Option<String>,
    pub upstream_provider_id:    Option<String>,
    pub upstream_provider_name:  Option<String>,
    pub classifier_provider_id:      Option<String>,
    pub classifier_provider_name:    Option<String>,
    pub output_scan_flagged:         bool,
    pub output_scan_framework_id:    Option<String>,
    pub output_scan_confidence:      Option<f32>,
    pub output_scan_detector:        Option<String>,
    pub threat_knowledge_matches:    Option<String>, // serialized JSON array of SemanticMatch
    pub semantic_threshold:          Option<f32>,     // threshold used for embedding search
    pub false_positive_candidate:    bool,            // semantic matched but classifier said safe
    pub pipeline_trace:              Option<String>,  // serialized JSON pipeline trace
    pub final_decision:              Option<String>,  // "allow" | "block" | "bypassed"
    pub blocked_stage:               Option<String>,  // "keyword_regex" | "semantic_llm" | "t2_intent"
    pub classification_reason:       Option<String>,  // LLM classifier's textual explanation
    pub t2_flagged:                  bool,            // T2 intent analysis flagged the prompt
    pub t2_confidence:               Option<f32>,     // T2 classifier confidence
    pub t2_reason:                   Option<String>,  // T2 classifier reason text
    pub request_mutations:           Option<String>,  // serialized JSON array of MutationEntry
    pub redaction_summary:           Option<String>,  // serialized JSON redaction summary (detectors, field counts)
    pub user_agent:                  Option<String>,  // User-Agent header from the request
    pub raw_input_payload:           Option<String>,  // raw client request body JSON (encrypted at rest)
    pub raw_output_payload:          Option<String>,  // raw upstream response body JSON (encrypted at rest)
    pub gateway_instance_id:         Option<String>,  // gateway instance that processed this request
    pub cache_hit:                   bool,            // request was served from the response cache
    pub cache_tier:                  Option<String>,  // "l1" | "l2_exact" | "l2_semantic" | "l2_multi_turn_semantic"
    pub content_quality_scanned:        bool,            // content quality scan ran for this request
    pub content_quality_groundedness:   Option<f32>,     // TruLens-style groundedness score
    pub content_quality_relevance:      Option<f32>,     // TruLens-style answer relevance score
    pub content_quality_hallucination:  Option<f32>,     // derived hallucination score (1 - groundedness)
    pub content_quality_flagged:        bool,            // scan result crossed the app's threshold
    pub content_quality_action:         Option<String>,  // "blocked" | "redacted" | "flagged" | "monitored" | None
    pub content_quality_reason:         Option<String>,  // judge's textual explanation
}

#[derive(Clone)]
pub(crate) struct LogWriter {
    tx:         mpsc::Sender<LogEntry>,
    emb_tx:     mpsc::Sender<EmbeddingLogEntry>,
    pcl_tx:     mpsc::Sender<ProviderCallLogEntry>,
    ta_tx:      mpsc::Sender<ToolAuditEntry>,
    rl_tx:      mpsc::Sender<ReloadLogEntry>,
    pub pool:   Arc<sqlx::PgPool>,
    quota_tracker: Option<crate::tools::quota_tracker::QuotaTracker>,
    /// Encryption secret for sensitive log fields (PLATFORM_KEY_SECRET).
    /// None = encryption disabled; fields stored as plaintext.
    log_secret: Option<Arc<String>>,
    /// data-db (ai_gateway_data) pool, used to keep connected_apps' request/blocked
    /// counters updated. Set after construction via with_data_pool() since the
    /// data-db pool isn't created until after LogWriter::from_env() runs.
    data_pool: Arc<RwLock<Option<Arc<sqlx::PgPool>>>>,
    /// Gateway instance identifier, set from GATEWAY_INSTANCE_ID env var.
    gateway_instance_id: Option<String>,
}

/// Encrypt `value` with AES-256-GCM if a secret is configured.
/// Returns `Some(encrypted)` on success.
/// Returns `None` when `value` is `None`.
/// Returns `Some("[encryption_disabled]")` when the secret is unset (logs a one-time warning).
fn maybe_encrypt(value: Option<String>, secret: &Option<Arc<String>>) -> Option<String> {
    static WARNED: OnceLock<()> = OnceLock::new();
    match (value, secret) {
        (Some(text), Some(s)) => {
            match crate::crypto::encrypt(&text, "log-field", s.as_str()) {
                Ok(enc) => Some(enc),
                Err(e) => {
                    tracing::warn!("[log_writer] encryption failed for sensitive field: {}", e);
                    Some("[encryption_failed]".to_string())
                }
            }
        }
        (Some(_), None) => {
            WARNED.get_or_init(|| {
                tracing::warn!("[log_writer] PLATFORM_KEY_SECRET not set — sensitive fields will be stored as \"[encryption_disabled]\"");
            });
            Some("[encryption_disabled]".to_string())
        }
        (None, _) => None,
    }
}

  impl LogWriter {
    /// Synchronous — no DB connection at call time.
    /// Uses connect_lazy so gateway starts even if log DB is unreachable.
    pub fn from_env() -> Self {
        let host     = std::env::var("LOG_PG_HOST").expect("LOG_PG_HOST env var must be set");
        let port: u16 = std::env::var("LOG_PG_PORT").ok().and_then(|v| v.parse().ok()).unwrap_or(5432);
        let user     = std::env::var("LOG_PG_USER").expect("LOG_PG_USER env var must be set");
        let password = std::env::var("LOG_PG_PASSWORD").expect("LOG_PG_PASSWORD env var must be set");
        let db       = std::env::var("LOG_PG_DB").unwrap_or_else(|_| "ai_gateway_logs".to_string());

        let log_secret = match std::env::var("PLATFORM_KEY_SECRET") {
            Ok(s) if !s.is_empty() => {
                tracing::info!("[log_writer] sensitive log fields will be encrypted at rest");
                Some(Arc::new(s))
            }
            _ => {
                tracing::warn!("[log_writer] PLATFORM_KEY_SECRET not set — sensitive log fields (user_prompt, response_body, etc.) will be stored as \"[encryption_disabled]\"");
                None
            }
        };

        let url = format!("postgres://{}:{}@{}:{}/{}", user, password, host, port, db);

        // connect_lazy — no actual TCP connection until first query.
        // Gateway starts regardless of log DB availability.
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect_lazy(&url)
            .expect("Invalid log DB URL");

        let pool = Arc::new(pool);
        let (tx, rx)           = mpsc::channel::<LogEntry>(QUEUE_CAPACITY);
        let (emb_tx, emb_rx)   = mpsc::channel::<EmbeddingLogEntry>(QUEUE_CAPACITY);
        let (pcl_tx, pcl_rx)   = mpsc::channel::<ProviderCallLogEntry>(QUEUE_CAPACITY);
        let (ta_tx, ta_rx)     = mpsc::channel::<ToolAuditEntry>(QUEUE_CAPACITY);
        let (rl_tx, rl_rx)     = mpsc::channel::<ReloadLogEntry>(QUEUE_CAPACITY);
        let data_pool: Arc<RwLock<Option<Arc<sqlx::PgPool>>>> = Arc::new(RwLock::new(None));

        tokio::spawn(drain_loop(rx, pool.clone(), data_pool.clone()));
        tokio::spawn(drain_embedding_loop(emb_rx, pool.clone()));
        tokio::spawn(drain_provider_call_loop(pcl_rx, pool.clone()));
        tokio::spawn(drain_tool_audit_loop(ta_rx, pool.clone()));
        tokio::spawn(drain_reload_log_loop(rl_rx, pool.clone()));

        let gateway_instance_id = std::env::var("GATEWAY_INSTANCE_ID").ok();
        if let Some(ref id) = gateway_instance_id {
            tracing::info!("[log_writer] gateway_instance_id=\"{}\"", id);
        } else {
            tracing::warn!("[log_writer] GATEWAY_INSTANCE_ID not set — log entries will not identify the source gateway");
        }

        tracing::info!("[log_writer] async log queue ready (capacity {})", QUEUE_CAPACITY);
        LogWriter { tx, emb_tx, pcl_tx, ta_tx, rl_tx, pool, quota_tracker: None, log_secret, data_pool, gateway_instance_id }
    }

    /// Attach a quota tracker so successful upstream forwards can be counted.
    pub fn with_quota_tracker(mut self, tracker: crate::tools::quota_tracker::QuotaTracker) -> Self {
        self.quota_tracker = Some(tracker);
        self
    }

    /// Attach the data-db pool so connected_apps' total_requests/blocked_count
    /// counters get kept up to date as requests are logged.
    pub fn with_data_pool(self, pool: Arc<sqlx::PgPool>) -> Self {
        *self.data_pool.write().unwrap_or_else(|e| e.into_inner()) = Some(pool);
        self
    }

    /// Count one successful upstream request toward the app's quota (local delta).
    /// Call only at real upstream-success sites (status 2xx forwarded to a provider).
    pub fn note_successful_request(&self, app_id: &str) {
        if let Some(t) = &self.quota_tracker {
            t.increment(app_id);
        }
    }

    /// Write a tool audit log entry to the tool_audit_log table (logs DB).
    /// Fire-and-forget via bounded channel — never spawns an unbounded task.
    pub fn log_tool_audit(&self, entry: ToolAuditEntry) {
        if self.ta_tx.try_send(entry).is_err() {
            tracing::warn!("[log_writer] tool-audit queue full — entry dropped");
        }
    }

    /// Accepts a pre-built LogEntry struct.
    /// Convenient for call sites that want to use struct-literal syntax with defaults.
    pub fn log_entry(&self, mut entry: LogEntry) {
        entry.user_prompt = maybe_encrypt(entry.user_prompt, &self.log_secret);
        entry.response_body = maybe_encrypt(entry.response_body, &self.log_secret);
        entry.raw_input_payload = maybe_encrypt(entry.raw_input_payload, &self.log_secret);
        entry.raw_output_payload = maybe_encrypt(entry.raw_output_payload, &self.log_secret);
        entry.gateway_instance_id = self.gateway_instance_id.clone();

        if self.tx.try_send(entry).is_err() {
            tracing::warn!("[log_writer] queue full — log entry dropped for request");
        }
    }

    /// Log a blocked request with minimal fields. All other fields get defaults.
    pub fn log_blocked(
        &self,
        request_id: &str,
        app_id: &str,
        app_name: &str,
        model: &str,
        method: &str,
        path: &str,
        source_ip: &str,
        app_api_key: &str,
        status_code: i16,
        threat_title: &str,
        user_prompt: Option<&str>,
        raw_input_payload: Option<&str>,
        user_agent: Option<&str>,
    ) {
        self.log_entry(LogEntry {
            request_id: request_id.to_string(),
            app_id: app_id.to_string(),
            app_name: app_name.to_string(),
            model: model.to_string(),
            method: method.to_string(),
            path: path.to_string(),
            source_ip: source_ip.to_string(),
            app_api_key: app_api_key.to_string(),
            status_code,
            action: Some("blocked".to_string()),
            threat_title: Some(threat_title.to_string()),
            user_prompt: user_prompt.map(|s| s.to_string()),
            raw_input_payload: raw_input_payload.map(|s| s.to_string()),
            user_agent: user_agent.map(|s| s.to_string()),
            ..Default::default()
        });
    }

    /// Log a request that failed with an error (not blocked, just errored).
    pub fn log_error(
        &self,
        request_id: &str,
        app_id: &str,
        app_name: &str,
        model: &str,
        method: &str,
        path: &str,
        source_ip: &str,
        app_api_key: &str,
        status_code: i16,
        error_msg: &str,
        user_prompt: Option<&str>,
        raw_input_payload: Option<&str>,
        user_agent: Option<&str>,
    ) {
        self.log_entry(LogEntry {
            request_id: request_id.to_string(),
            app_id: app_id.to_string(),
            app_name: app_name.to_string(),
            model: model.to_string(),
            method: method.to_string(),
            path: path.to_string(),
            source_ip: source_ip.to_string(),
            app_api_key: app_api_key.to_string(),
            status_code,
            action: Some("failed".to_string()),
            threat_title: Some(error_msg.to_string()),
            user_prompt: user_prompt.map(|s| s.to_string()),
            raw_input_payload: raw_input_payload.map(|s| s.to_string()),
            user_agent: user_agent.map(|s| s.to_string()),
            ..Default::default()
        });
    }

    /// Best-effort UPDATE to set content quality scores on an existing row.
    /// Called from the async scan task after the judge completes.
    /// 2-attempt retry: if 0 rows on attempt 1, sleep 2s and retry.
    /// `warn!` on final 0-rows or error (non-fatal — fail-open).
    pub fn update_content_quality_results(
        &self,
        request_id: String,
        groundedness: Option<f32>,
        relevance: Option<f32>,
        hallucination: Option<f32>,
        flagged: bool,
        action: Option<String>,
        reason: Option<String>,
        pipeline_trace: Option<String>,
    ) {
        let pool = self.pool.clone();
        tokio::spawn(async move {
            for attempt in 0..2 {
                let result = sqlx::query(
                    "UPDATE ai_request_logs \
                     SET content_quality_scanned = TRUE, \
                         content_quality_groundedness = $2, \
                         content_quality_relevance = $3, \
                         content_quality_hallucination = $4, \
                         content_quality_flagged = $5, \
                         content_quality_action = $6, \
                         content_quality_reason = $7, \
                         pipeline_trace = COALESCE($8::jsonb, pipeline_trace) \
                     WHERE request_id = $1"
                )
                .bind(&request_id)
                .bind(groundedness)
                .bind(relevance)
                .bind(hallucination)
                .bind(flagged)
                .bind(&action)
                .bind(&reason)
                .bind(pipeline_trace.as_deref().and_then(|s| serde_json::from_str::<JsonValue>(s).ok()))
                .execute(&*pool)
                .await;

                match result {
                    Ok(r) if r.rows_affected() > 0 => return,
                    Ok(_) if attempt == 0 => {
                        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                        continue;
                    }
                    Ok(_) => {
                        tracing::warn!(
                            "[log_writer] update_content_quality_results: no row found for {} (final)", request_id
                        );
                        return;
                    }
                    Err(e) => {
                        tracing::warn!(
                            "[log_writer] update_content_quality_results failed for {}: {}", request_id, e
                        );
                        return;
                    }
                }
            }
        });
    }

    #[allow(clippy::too_many_arguments)]
    pub fn log_embedding(
        &self,
        request_id:    Option<&str>,
        provider_id:   &str,
        provider_name: &str,
        model:         Option<&str>,
        input_chars:   i32,
        input_text:    Option<&str>,
        dimensions:    Option<i32>,
        success:       bool,
        error_message: Option<&str>,
        duration_ms:   i64,
        source:        &str,
    ) {
        let entry = EmbeddingLogEntry {
            request_id:    request_id.map(str::to_string),
            provider_id:   provider_id.to_string(),
            provider_name: provider_name.to_string(),
            model:         model.map(str::to_string),
            input_chars,
            input_text:    maybe_encrypt(input_text.map(str::to_string), &self.log_secret),
            dimensions,
            success,
            error_message: error_message.map(str::to_string),
            duration_ms,
            source:        source.to_string(),
        };
        if self.emb_tx.try_send(entry).is_err() {
            tracing::warn!("[log_writer] embedding queue full — entry dropped");
        }
    }

    /// Log an upstream LLM provider call with common fields pre-filled.
    /// A thin convenience wrapper around `log_provider_call` that handles
    /// JSON serialization of request/response payloads and extracts provider metadata.
    pub fn log_upstream_call(
        &self,
        request_id: &str,
        app_id: &str,
        app_name: &str,
        provider: &crate::policy::ProviderConfig,
        endpoint: &str,
        model: &str,
        req_json: &serde_json::Value,
        resp_json: &serde_json::Value,
        tokens_in: Option<i32>,
        tokens_out: Option<i32>,
        duration_ms: i64,
        status_code: i16,
        success: bool,
        error_message: Option<&str>,
    ) {
        let req_payload = serde_json::to_string(req_json).ok();
        let resp_payload = serde_json::to_string(resp_json).ok();
        self.log_provider_call(
            Some(request_id),
            "upstream",
            "pipeline",
            Some(app_id),
            Some(app_name),
            Some(provider.id.as_str()),
            Some(provider.name.as_str()),
            Some(provider.vendor.as_str()),
            Some(model),
            Some(endpoint),
            req_payload,
            resp_payload,
            tokens_in,
            tokens_out,
            duration_ms,
            Some(status_code),
            success,
            error_message,
        );
    }

    /// Fire-and-forget provider call log. Never blocks; drops on queue full.
    #[allow(clippy::too_many_arguments)]
    pub fn log_provider_call(
        &self,
        request_id:       Option<&str>,
        call_type:        &str,
        source:           &str,
        app_id:           Option<&str>,
        app_name:         Option<&str>,
        provider_id:      Option<&str>,
        provider_name:    Option<&str>,
        vendor:           Option<&str>,
        model:            Option<&str>,
        endpoint:         Option<&str>,
        request_payload:  Option<String>,
        response_payload: Option<String>,
        tokens_in:        Option<i32>,
        tokens_out:       Option<i32>,
        duration_ms:      i64,
        status_code:      Option<i16>,
        success:          bool,
        error_message:    Option<&str>,
    ) {
        let tokens_total = match (tokens_in, tokens_out) {
            (Some(a), Some(b)) => Some(a + b),
            _ => None,
        };
        let entry = ProviderCallLogEntry {
            request_id:       request_id.map(str::to_string),
            call_type:        call_type.to_string(),
            source:           source.to_string(),
            app_id:           app_id.map(str::to_string),
            app_name:         app_name.map(str::to_string),
            provider_id:      provider_id.map(str::to_string),
            provider_name:    provider_name.map(str::to_string),
            vendor:           vendor.map(str::to_string),
            model:            model.map(str::to_string),
            endpoint:         endpoint.map(str::to_string),
            request_payload:  maybe_encrypt(request_payload, &self.log_secret),
            response_payload: maybe_encrypt(response_payload, &self.log_secret),
            tokens_in,
            tokens_out,
            tokens_total,
            duration_ms,
            status_code,
            success,
            error_message:    error_message.map(str::to_string),
            triggered_by:     None,
        };
        if self.pcl_tx.try_send(entry).is_err() {
            tracing::warn!("[log_writer] provider-call queue full — entry dropped");
        }
    }

    /// Fire-and-forget reload log via bounded channel — never spawns an unbounded task.
    pub fn log_reload(
        &self,
        triggered_by: &str,
        key_prefix: &str,
        source_ip: &str,
        result: &str,
        error_message: Option<&str>,
        duration_ms: i64,
    ) {
        let entry = ReloadLogEntry {
            triggered_by:         triggered_by.to_string(),
            key_prefix:           key_prefix.to_string(),
            source_ip:            source_ip.to_string(),
            result:               result.to_string(),
            error_message:        error_message.map(str::to_string),
            duration_ms,
            gateway_instance_id: self.gateway_instance_id.clone(),
        };
        if self.rl_tx.try_send(entry).is_err() {
            tracing::warn!("[log_writer] reload-log queue full — entry dropped");
        }
    }
}

// ── Background drain loop ─────────────────────────────────────────────────────

async fn drain_loop(
    mut rx: mpsc::Receiver<LogEntry>,
    pool: Arc<sqlx::PgPool>,
    data_pool: Arc<RwLock<Option<Arc<sqlx::PgPool>>>>,
) {
    loop {
        // Wait for at least one entry (yields until something arrives)
        let first = match rx.recv().await {
            Some(e) => e,
            None    => break, // channel closed
        };

        // Drain all immediately available entries up to BATCH_SIZE
        let mut batch = Vec::with_capacity(BATCH_SIZE);
        batch.push(first);
        while batch.len() < BATCH_SIZE {
            match rx.try_recv() {
                Ok(e)  => batch.push(e),
                Err(_) => break,
            }
        }

        let n = batch.len();
        if let Err(e) = insert_batch(&pool, &batch).await {
            tracing::warn!("[log_writer] batch insert failed ({} entries dropped): {}", n, e);
            continue;
        }

        if let Some(dp) = data_pool.read().unwrap_or_else(|e| e.into_inner()).clone() {
            let deltas = aggregate_app_deltas(&batch);
            tokio::spawn(async move {
                update_app_counters(&dp, &deltas).await;
            });
        }
    }
}

/// Aggregate (total_delta, blocked_delta) per app_id for a batch of log entries.
fn aggregate_app_deltas(batch: &[LogEntry]) -> HashMap<String, (i64, i64)> {
    let mut deltas: HashMap<String, (i64, i64)> = HashMap::new();
    for e in batch {
        let entry = deltas.entry(e.app_id.clone()).or_insert((0, 0));
        entry.0 += 1;
        if e.flagged {
            entry.1 += 1;
        }
    }
    deltas
}

/// Best-effort counter update — these are approximate, high-level reference
/// figures shown on the Connected Apps page, not correctness-critical. Failures
/// (including app_id values like "unknown" that aren't valid UUIDs, e.g. for
/// 404/passthrough paths that never resolved to a known app) are logged and
/// dropped rather than retried.
async fn update_app_counters(data_pool: &sqlx::PgPool, deltas: &HashMap<String, (i64, i64)>) {
    for (app_id, (total_delta, blocked_delta)) in deltas {
        let result = sqlx::query(
            "UPDATE connected_apps SET total_requests = total_requests + $1, blocked_count = blocked_count + $2, updated_at = now() WHERE id = $3::uuid"
        )
        .bind(total_delta)
        .bind(blocked_delta)
        .bind(app_id)
        .execute(data_pool)
        .await;

        if let Err(e) = result {
            tracing::warn!("[log_writer] connected_apps counter update failed for app {}: {}", app_id, e);
        }
    }
}

async fn insert_batch(pool: &sqlx::PgPool, batch: &[LogEntry]) -> Result<(), sqlx::Error> {
    let now = chrono::Utc::now();

    let mut qb = QueryBuilder::new(
       "INSERT INTO ai_request_logs (
            request_id, app_id, app_name, model, method, path,
            source_ip, app_api_key, tokens_in, tokens_out,
            duration_ms, status_code, flagged, detector,
            confidence, action, threat_title, excerpt, framework_id, user_prompt,
            response_body, upstream_provider_id, upstream_provider_name,
            classifier_provider_id, classifier_provider_name,
            output_scan_flagged, output_scan_framework_id, output_scan_confidence,
            output_scan_detector, threat_knowledge_matches, semantic_threshold, false_positive_candidate,
            pipeline_trace, final_decision, blocked_stage, classification_reason,
            t2_flagged, t2_confidence, t2_reason,
            request_mutations, redaction_summary, user_agent,
            raw_input_payload, raw_output_payload,
            gateway_instance_id,
            cache_hit, cache_tier,
            content_quality_scanned, content_quality_groundedness, content_quality_relevance,
            content_quality_hallucination, content_quality_flagged, content_quality_action,
            content_quality_reason,
            created_at
        ) "
    );

    qb.push_values(batch, |mut b, e| {
        b.push_bind(&e.request_id)
         .push_bind(&e.app_id)
         .push_bind(&e.app_name)
         .push_bind(&e.model)
         .push_bind(&e.method)
         .push_bind(&e.path)
         .push_bind(&e.source_ip)
         .push_bind(&e.app_api_key)
         .push_bind(e.tokens_in)
         .push_bind(e.tokens_out)
         .push_bind(e.duration_ms)
         .push_bind(e.status_code)
         .push_bind(e.flagged)
         .push_bind(&e.detector)
         .push_bind(e.confidence)
         .push_bind(&e.action)
     .push_bind(&e.threat_title)
           .push_bind(&e.excerpt)
           .push_bind(&e.framework_id)
           .push_bind(&e.user_prompt)
          .push_bind(&e.response_body)
          .push_bind(&e.upstream_provider_id)
          .push_bind(&e.upstream_provider_name)
          .push_bind(&e.classifier_provider_id)
          .push_bind(&e.classifier_provider_name)
         .push_bind(e.output_scan_flagged)
           .push_bind(&e.output_scan_framework_id)
           .push_bind(e.output_scan_confidence)
          .push_bind(&e.output_scan_detector)
          .push_bind(e.threat_knowledge_matches.as_deref().and_then(|s| serde_json::from_str::<JsonValue>(s).ok()))
          .push_bind(e.semantic_threshold)
          .push_bind(e.false_positive_candidate)
          .push_bind(e.pipeline_trace.as_deref().and_then(|s| serde_json::from_str::<JsonValue>(s).ok()))
          .push_bind(&e.final_decision)
          .push_bind(&e.blocked_stage)
          .push_bind(&e.classification_reason)
          .push_bind(e.t2_flagged)
          .push_bind(e.t2_confidence)
          .push_bind(&e.t2_reason)
          .push_bind(&e.request_mutations)
           .push_bind(&e.redaction_summary)
            .push_bind(&e.user_agent)
            .push_bind(&e.raw_input_payload)
            .push_bind(&e.raw_output_payload)
            .push_bind(&e.gateway_instance_id)
            .push_bind(e.cache_hit)
            .push_bind(&e.cache_tier)
            .push_bind(e.content_quality_scanned)
            .push_bind(e.content_quality_groundedness)
            .push_bind(e.content_quality_relevance)
            .push_bind(e.content_quality_hallucination)
            .push_bind(e.content_quality_flagged)
            .push_bind(&e.content_quality_action)
            .push_bind(&e.content_quality_reason)
            .push_bind(now);
    });

    qb.build().execute(pool).await?;
    Ok(())
}

// ── Embedding log drain ───────────────────────────────────────────────────────

async fn drain_embedding_loop(mut rx: mpsc::Receiver<EmbeddingLogEntry>, pool: Arc<sqlx::PgPool>) {
    loop {
        let first = match rx.recv().await {
            Some(e) => e,
            None    => break,
        };
        let mut batch = Vec::with_capacity(BATCH_SIZE);
        batch.push(first);
        while batch.len() < BATCH_SIZE {
            match rx.try_recv() {
                Ok(e)  => batch.push(e),
                Err(_) => break,
            }
        }
        let n = batch.len();
        if let Err(e) = insert_embedding_batch(&pool, &batch).await {
            tracing::warn!("[log_writer] embedding batch insert failed ({} entries dropped): {}", n, e);
        }
    }
}

// ── Provider call log drain ───────────────────────────────────────────────────

async fn drain_provider_call_loop(mut rx: mpsc::Receiver<ProviderCallLogEntry>, pool: Arc<sqlx::PgPool>) {
    loop {
        let first = match rx.recv().await {
            Some(e) => e,
            None    => break,
        };
        let mut batch = Vec::with_capacity(BATCH_SIZE);
        batch.push(first);
        while batch.len() < BATCH_SIZE {
            match rx.try_recv() {
                Ok(e)  => batch.push(e),
                Err(_) => break,
            }
        }
        let n = batch.len();
        if let Err(e) = insert_provider_call_batch(&pool, &batch).await {
            tracing::warn!("[log_writer] provider-call batch insert failed ({} entries dropped): {}", n, e);
        }
    }
}

async fn insert_provider_call_batch(pool: &sqlx::PgPool, batch: &[ProviderCallLogEntry]) -> Result<(), sqlx::Error> {
    let now = chrono::Utc::now();
    let mut qb = QueryBuilder::new(
        "INSERT INTO ai_provider_call_logs (
            request_id, call_type, source,
            app_id, app_name,
            provider_id, provider_name, vendor, model, endpoint,
            request_payload, response_payload,
            tokens_in, tokens_out, tokens_total,
            duration_ms, status_code, success, error_message, triggered_by,
            created_at
        ) "
    );
    qb.push_values(batch, |mut b, e| {
        b.push_bind(&e.request_id)
         .push_bind(&e.call_type)
         .push_bind(&e.source)
         .push_bind(&e.app_id)
         .push_bind(&e.app_name)
         .push_bind(&e.provider_id)
         .push_bind(&e.provider_name)
         .push_bind(&e.vendor)
         .push_bind(&e.model)
         .push_bind(&e.endpoint)
         .push_bind(&e.request_payload)
         .push_bind(&e.response_payload)
         .push_bind(e.tokens_in)
         .push_bind(e.tokens_out)
         .push_bind(e.tokens_total)
         .push_bind(e.duration_ms)
         .push_bind(e.status_code)
         .push_bind(e.success)
         .push_bind(&e.error_message)
         .push_bind(&e.triggered_by)
         .push_bind(now);
    });
    qb.build().execute(pool).await?;
    Ok(())
}

// ── Tool audit log drain ───────────────────────────────────────────────────

async fn drain_tool_audit_loop(mut rx: mpsc::Receiver<ToolAuditEntry>, pool: Arc<sqlx::PgPool>) {
    loop {
        let first = match rx.recv().await {
            Some(e) => e,
            None    => break,
        };
        let mut batch = Vec::with_capacity(BATCH_SIZE);
        batch.push(first);
        while batch.len() < BATCH_SIZE {
            match rx.try_recv() {
                Ok(e)  => batch.push(e),
                Err(_) => break,
            }
        }
        let n = batch.len();
        if let Err(e) = insert_tool_audit_batch(&pool, &batch).await {
            tracing::warn!("[log_writer] tool-audit batch insert failed ({} entries dropped): {}", n, e);
        }
    }
}

async fn insert_tool_audit_batch(pool: &sqlx::PgPool, batch: &[ToolAuditEntry]) -> Result<(), sqlx::Error> {
    let mut qb = QueryBuilder::new(
        "INSERT INTO tool_audit_log (request_id, app_id, app_name, tool_name, invocation_count, approved, violation_flag) "
    );
    qb.push_values(batch, |mut b, e| {
        b.push_bind(&e.request_id)
         .push_bind(&e.app_id)
         .push_bind(&e.app_name)
         .push_bind(&e.tool_name)
         .push_bind(e.invocation_count)
         .push_bind(e.approved)
         .push_bind(e.violation_flag);
    });
    qb.build().execute(pool).await?;
    Ok(())
}

// ── Reload log drain ───────────────────────────────────────────────────────

async fn drain_reload_log_loop(mut rx: mpsc::Receiver<ReloadLogEntry>, pool: Arc<sqlx::PgPool>) {
    loop {
        let first = match rx.recv().await {
            Some(e) => e,
            None    => break,
        };
        let mut batch = Vec::with_capacity(BATCH_SIZE);
        batch.push(first);
        while batch.len() < BATCH_SIZE {
            match rx.try_recv() {
                Ok(e)  => batch.push(e),
                Err(_) => break,
            }
        }
        let n = batch.len();
        if let Err(e) = insert_reload_log_batch(&pool, &batch).await {
            tracing::warn!("[log_writer] reload-log batch insert failed ({} entries dropped): {}", n, e);
        }
    }
}

async fn insert_reload_log_batch(pool: &sqlx::PgPool, batch: &[ReloadLogEntry]) -> Result<(), sqlx::Error> {
    let now = chrono::Utc::now();
    let mut qb = QueryBuilder::new(
        "INSERT INTO reload_logs (triggered_by, key_prefix, gateway_instance_id, source_ip, result, error_message, duration_ms, created_at) "
    );
    qb.push_values(batch, |mut b, e| {
        b.push_bind(&e.triggered_by)
         .push_bind(&e.key_prefix)
         .push_bind(&e.gateway_instance_id)
         .push_bind(&e.source_ip)
         .push_bind(&e.result)
         .push_bind(&e.error_message)
         .push_bind(e.duration_ms)
         .push_bind(now);
    });
    qb.build().execute(pool).await?;
    Ok(())
}

async fn insert_embedding_batch(pool: &sqlx::PgPool, batch: &[EmbeddingLogEntry]) -> Result<(), sqlx::Error> {
    let now = chrono::Utc::now();
    let mut qb = QueryBuilder::new(
        "INSERT INTO embedding_logs (
            request_id, provider_id, provider_name, model,
            input_chars, input_text, dimensions, success, error_message,
            duration_ms, source, created_at
        ) "
    );
    qb.push_values(batch, |mut b, e| {
        b.push_bind(&e.request_id)
         .push_bind(&e.provider_id)
         .push_bind(&e.provider_name)
         .push_bind(&e.model)
         .push_bind(e.input_chars)
         .push_bind(&e.input_text)
         .push_bind(e.dimensions)
         .push_bind(e.success)
         .push_bind(&e.error_message)
         .push_bind(e.duration_ms)
         .push_bind(&e.source)
         .push_bind(now);
    });
    qb.build().execute(pool).await?;
    Ok(())
}
