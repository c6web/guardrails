use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use chrono::{DateTime, Utc};
use subtle::ConstantTimeEq;

// ── Cached app record (loaded from DB, keyed by key_hash) ────────────────────

pub(crate) struct CachedApp {
    pub app_id:              String,
    pub api_key_prefix:      String,
    pub app_name:            String,
    pub app_mode:            String,
    pub primary_provider_id: Option<String>,
    pub backup1_provider_id: Option<String>,
    pub backup2_provider_id: Option<String>,
    // null = use global default from classifier_config
    pub classifier_threshold:  Option<f32>,
    pub classifier_prompt:     Option<String>,
    pub max_tokens:            Option<i32>,
    pub max_payload_size:      Option<i64>,
    pub enable_t2:             bool,
    pub enable_knowledge_dev:  bool,
    pub enable_content_quality_scan:    bool,
    // null = use global default (content_quality_judge_prompts.threshold / a hardcoded mode default)
    pub content_quality_scan_mode:      Option<String>,
    pub content_quality_scan_threshold: Option<f32>,
    // Usage quota (by successful upstream requests)
    pub quota_mode:            String,        // "unlimited" | "fixed" | "monthly"
    pub quota_limit:           Option<i64>,
    pub quota_warning_limit:   Option<i64>,
    pub quota_enforcement:     String,        // "hard" | "soft"
    pub quota_reset_day:       Option<i32>,
    pub quota_period_start:    Option<DateTime<Utc>>,
    /// App creation time — fixed-mode quota fallback baseline when no manual reset
    /// has happened, so it matches the console's quotaPeriodStart() logic.
    pub app_created_at:             DateTime<Utc>,
    pub enable_response_cache:      bool,
    pub cache_ttl_seconds:          Option<i32>,
    pub multi_turn_semantic_enabled: bool,
}

pub type ApiKeyCache = Arc<RwLock<HashMap<String, CachedApp>>>;

// ── Admin key cache: Vec of (key_hash, key_prefix) pairs ─────────────────────

pub type AdminKeyCache = Arc<RwLock<Vec<(String, String)>>>;

// ── Per-gateway control key cache ────────────────────────────────────────────

pub type GatewayKeyCache = Arc<RwLock<Vec<crate::policy::gateway_keys::GatewayKeyRow>>>;

// ── Auth result returned to the request handler ───────────────────────────────

impl AuthResult {
    /// Resolve the provider chain (primary → backup1 → backup2) from the policy store.
    pub fn resolve_provider_chain(&self, policy_store: &crate::policy::DetectorStore) -> Vec<crate::policy::ProviderConfig> {
        [self.primary_provider_id.as_deref(),
         self.backup1_provider_id.as_deref(),
         self.backup2_provider_id.as_deref()]
        .iter()
        .filter_map(|id_opt| *id_opt)
        .filter_map(|id| policy_store.resolve_provider(id))
        .collect()
    }
}

pub(crate) struct AuthResult {
    pub app_id:              String,
    pub api_key_prefix:      String,
    pub app_name:            String,
    pub app_mode:            String,
    pub primary_provider_id: Option<String>,
    pub backup1_provider_id: Option<String>,
    pub backup2_provider_id: Option<String>,
    pub classifier_threshold:  Option<f32>,
    pub classifier_prompt:     Option<String>,
    pub max_tokens:            Option<i32>,
    pub max_payload_size:      Option<i64>,
    pub enable_t2:             bool,
    pub enable_knowledge_dev:  bool,
    pub enable_content_quality_scan:    bool,
    pub content_quality_scan_mode:      Option<String>,
    pub content_quality_scan_threshold: Option<f32>,
    pub quota_mode:            String,
    pub quota_limit:           Option<i64>,
    pub quota_warning_limit:   Option<i64>,
    pub quota_enforcement:     String,
    pub quota_reset_day:       Option<i32>,
    pub quota_period_start:    Option<DateTime<Utc>>,
    pub app_created_at:             DateTime<Utc>,
    pub enable_response_cache:      bool,
    pub cache_ttl_seconds:          Option<i32>,
    pub multi_turn_semantic_enabled: bool,
}

pub(crate) enum AuthError {
    MissingKey,
    InvalidKey,
}

// ── Auth service — pure in-memory lookup, no DB per request ──────────────────

#[derive(Clone)]
pub(crate) struct AuthService {
    cache: ApiKeyCache,
}

impl AuthService {
    pub fn new(cache: ApiKeyCache) -> Self {
        Self { cache }
    }

    /// Synchronous — just a HashMap read-lock lookup.
    pub fn authenticate(&self, headers: &axum::http::HeaderMap) -> Result<AuthResult, AuthError> {
        let api_key = headers
            .get("Authorization")
            .and_then(|h| h.to_str().ok())
            .and_then(|h| h.strip_prefix("Bearer "))
            .ok_or(AuthError::MissingKey)?;

        // App keys are prefixed with ak_ — strip before hashing
        let hex_part = api_key.strip_prefix("ak_").unwrap_or(api_key);
        let hash     = sha256(hex_part);

        let cache = self.cache.read().unwrap_or_else(|e| e.into_inner());
        match cache.get(&hash) {
            Some(app) => {
                tracing::debug!(
                    "[auth] cache hit app='{}' mode='{}' primary={:?} b1={:?} b2={:?} threshold={:?}",
                    app.app_name, app.app_mode,
                    app.primary_provider_id, app.backup1_provider_id, app.backup2_provider_id,
                    app.classifier_threshold,
                );
                Ok(AuthResult {
                    app_id:               app.app_id.clone(),
                    api_key_prefix:       app.api_key_prefix.clone(),
                    app_name:             app.app_name.clone(),
                    app_mode:             app.app_mode.clone(),
                    primary_provider_id:  app.primary_provider_id.clone(),
                    backup1_provider_id:  app.backup1_provider_id.clone(),
                    backup2_provider_id:  app.backup2_provider_id.clone(),
                    classifier_threshold: app.classifier_threshold,
                    classifier_prompt:    app.classifier_prompt.clone(),
                    max_tokens:           app.max_tokens,
                    max_payload_size:     app.max_payload_size,
                    enable_t2:            app.enable_t2,
                    enable_knowledge_dev: app.enable_knowledge_dev,
                    enable_content_quality_scan:    app.enable_content_quality_scan,
                    content_quality_scan_mode:      app.content_quality_scan_mode.clone(),
                    content_quality_scan_threshold: app.content_quality_scan_threshold,
                    quota_mode:           app.quota_mode.clone(),
                    quota_limit:          app.quota_limit,
                    quota_warning_limit:  app.quota_warning_limit,
                    quota_enforcement:    app.quota_enforcement.clone(),
                    quota_reset_day:      app.quota_reset_day,
                    quota_period_start:       app.quota_period_start,
                    app_created_at:           app.app_created_at,
                    enable_response_cache:    app.enable_response_cache,
                    cache_ttl_seconds:        app.cache_ttl_seconds,
                    multi_turn_semantic_enabled: app.multi_turn_semantic_enabled,
                })
            }
            None => {
                tracing::info!("[auth] cache miss for key hash: {}...", &hash[..std::cmp::min(hash.len(), 12)]);
                Err(AuthError::InvalidKey)
            }
        }
    }
}

/// Check an admin API key against the admin key cache.
/// Admin keys are the full raw token — no prefix stripping.
/// Returns the key_prefix for logging on success, or None on failure.
pub fn check_admin_key(headers: &axum::http::HeaderMap, cache: &AdminKeyCache) -> Option<String> {
    let token = headers
        .get("Authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))?;

    let hash = sha256(token);
    let cache = cache.read().unwrap_or_else(|e| e.into_inner());
    let hash_bytes = hash.as_bytes();

    let mut matched = None;
    for (key_hash, prefix) in cache.iter() {
        let stored_bytes = key_hash.as_bytes();
        if stored_bytes.len() == hash_bytes.len()
            && stored_bytes.ct_eq(hash_bytes).into()
        {
            matched = Some(prefix.clone());
        }
    }
    matched
}

/// Check a per-gateway control key against the gateway key cache.
/// Applies the validity rule: active always valid; superseded valid only within grace period.
/// Returns the key_prefix for logging on success, or None on failure.
pub fn check_gateway_key(headers: &axum::http::HeaderMap, cache: &GatewayKeyCache) -> Option<String> {
    let token = headers
        .get("Authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))?;

    let hash = sha256(token);
    let cache = cache.read().unwrap_or_else(|e| e.into_inner());
    let now = chrono::Utc::now();
    let hash_bytes = hash.as_bytes();

    let mut matched = None;
    for row in cache.iter() {
        let stored_bytes = row.key_hash.as_bytes();
        let hash_match = stored_bytes.len() == hash_bytes.len()
            && stored_bytes.ct_eq(hash_bytes).into();
        if hash_match {
            let valid = match row.status.as_str() {
                "active" => true,
                "superseded" => row.grace_expires_at.map(|exp| exp > now).unwrap_or(false),
                _ => false,
            };
            if valid {
                matched = Some(row.key_prefix.clone());
            }
        }
    }
    matched
}

pub fn sha256(str: &str) -> String {
    use sha2::{Digest, Sha256};
    let hash = Sha256::digest(str);
    format!("{:x}", hash)
}
