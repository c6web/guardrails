//! Shared request preamble — ACL, rate limiting, auth, quota, provider chain,
//! content extraction, and policy checks that every proxied request endpoint
//! runs before forwarding or scanning.
//!
//! `prepare()` handles the common prelude (ACL → preauth-rate-limit → auth →
//! body-read → JSON-parse → per-app-rate-limit → quota → provider-chain →
//! content-extraction → payload-size → prefill-injection).
//!
//! Callers destructure the returned `Prepared` to get all variables needed for
//! the remaining handler-specific logic (token-limit check, tool-guard, scanning,
//! enforcement/forward dispatch, etc.).

use axum::{
    body::Bytes,
    extract::{ConnectInfo, Request as AxumRequest},
    http::{HeaderMap, StatusCode},
    response::Response,
};
use serde_json::Value;
use std::net::SocketAddr;

use crate::policy::ProviderConfig;
use crate::tools::auth::{AuthError, AuthResult};
use crate::tools::acl_check::resolve_source_ip;
use crate::tools::json_response::json_response;
use crate::tools::log_writer::LogEntry;
use crate::tools::rate_limiter::RateLimitResult;
use crate::request_handler::helpers::build_firewall_error;

/// Everything a handler needs after the shared preamble succeeds.
pub(crate) struct Prepared {
    // ── Common fields (original) ────────────────────────────────────────────
    pub(crate) req_json:   Value,
    pub(crate) auth:       AuthResult,
    pub(crate) request_id: String,
    pub(crate) method:     String,
    pub(crate) path:       String,
    pub(crate) source_ip:  String,
    pub(crate) headers:    HeaderMap,

    // ── Extended fields ────────────────────────────────────────────────────
    pub(crate) body_bytes:              axum::body::Bytes,
    pub(crate) user_agent:              Option<String>,
    pub(crate) is_streaming:            bool,
    pub(crate) is_anthropic:            bool,
    pub(crate) is_multipart:            bool,
    pub(crate) raw_forward_body:        Option<(axum::body::Bytes, Option<String>)>,
    pub(crate) provider_chain:          Vec<ProviderConfig>,
    pub(crate) model:                   String,
    pub(crate) prompt_text:             String,
    pub(crate) user_prompt:             Option<String>,
    pub(crate) app_id:                  String,
    pub(crate) api_key_prefix:          String,
    pub(crate) app_name:                String,
    pub(crate) app_mode:                String,
    pub(crate) app_enable_t2:           bool,
    pub(crate) app_enable_knowledge_dev: bool,
    pub(crate) app_enable_content_quality_scan: bool,
    pub(crate) app_content_quality_mode:        Option<String>,
    pub(crate) app_content_quality_threshold:   Option<f32>,
}

/// Run the shared preamble. On any rejection, returns the early `Response` in
/// `Err` (already logged to `ai_request_logs`).
///
/// Pipeline:
///   1. Network ACL
///   2. Pre-auth rate limit (per source IP)
///   3. Auth (in-memory API key cache) — before body read to prevent unauthenticated
///      resource exhaustion (body can be up to 32 MB)
///   4. Body read (bounded by `state.body_limit_bytes`)
///   5. JSON parse (with multipart / anthropic translation special-cases)
///   6. Per-app rate limit
///   7. Usage quota check
///   8. Provider chain resolution + no-provider check
///   9. Model extraction
///  10. Payload size check
///  11. Content extraction (role-aware + tools + tool-calls)
///  12. Assistant prefill injection detection
///
/// Note on ordering: pre-refactor, `request_handler/handler.rs` and
/// `responses_handler.rs` ran payload-size/prefill/token-limit in two different
/// orders. Token-limit is still checked per-handler immediately after `prepare()`
/// returns; payload-size and prefill below intentionally standardize on a single
/// shared order (payload-size, then prefill) for both endpoints. A request that
/// trips more than one of these independent checks may now get a different
/// HTTP status than before the refactor for whichever handler's order changed.
pub(crate) async fn prepare(
    state:        &crate::GatewayState,
    req:          AxumRequest,
    connect_info: Option<ConnectInfo<SocketAddr>>,
    id_prefix:    &str,
    is_anthropic: bool,
    // When `Some`, skip body read + JSON parse and use the provided values directly.
    // Used by `/v1/completions` which translates the body to chat format first.
    pre_parsed:   Option<(Bytes, Value)>,
) -> Result<Prepared, Response> {
    let log_writer   = &state.log_writer;
    let policy_store = &state.policy_store;

    let xff_header = req.headers().get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let source_ip = resolve_source_ip(
        connect_info.map(|ci| ci.0),
        xff_header.as_deref(),
        state.trusted_proxy_depth,
        &state.trusted_proxy_ips,
    );

    let request_id = format!("{}_{}", id_prefix, rand::random::<u64>());

    let (parts, body) = req.into_parts();
    let method  = parts.method.to_string();
    let path    = parts.uri.path().to_string();
    let headers = parts.headers;
    let user_agent = headers.get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    // ── Layer 0 — Network ACL ──────────────────────────────────────────────
    {
        let mode    = policy_store.acl_mode.read().unwrap_or_else(|e| e.into_inner()).clone();
        let entries = policy_store.acl_entries.read().unwrap_or_else(|e| e.into_inner()).clone();
        if crate::tools::acl_check::is_ip_blocked(&source_ip, &mode, &entries) {
            tracing::warn!("[acl] 403 BLOCKED ip={} mode={} ({})", source_ip, mode, path);
            log_writer.log_blocked(
                &request_id,
                "acl", "", "unknown", &method, &path, &source_ip,
                "N/A", 403,
                "Access denied by network ACL",
                None, None,
                user_agent.as_deref(),
            );
            return Err(build_firewall_error(
                "Access denied by network ACL", &request_id, is_anthropic, StatusCode::FORBIDDEN,
            ));
        }
    }

    // ── Pre-auth rate limit (per source IP, before body read) ──────────────
    if let RateLimitResult::Limited { retry_after_secs } =
        state.preauth_rate_limiter.check(&source_ip)
    {
        if let Some(m) = crate::tools::telemetry::METRICS.get() {
            m.preauth_ratelimit_hits_total.inc();
        }
        tracing::warn!(
            "[preauth_rate] 429 RATE_LIMITED ip={} retry_after={}s ({})",
            source_ip, retry_after_secs, path,
        );
        let mut resp = json_response(
            StatusCode::TOO_MANY_REQUESTS,
            &format!(r#"{{"error":"Too many requests","retry_after":{}}}"#, retry_after_secs),
        );
        resp.headers_mut()
            .insert("retry-after", retry_after_secs.to_string().parse().unwrap());
        return Err(resp);
    }

    // ── Auth (in-memory API key cache, before body read) ───────────────────
    // Authentication only needs the `Authorization` header — no body parsing
    // required.  Running auth *before* reading the full request body prevents
    // an unauthenticated attacker from forcing 32 MB allocations + JSON
    // parsing per request (resource-exhaustion vector).
    let auth = match state.auth_service.authenticate(&headers) {
        Ok(a) => a,
        Err(AuthError::MissingKey) => {
            tracing::warn!(
                "[auth] 401 MISSING_KEY ip={} method={} path={}", source_ip, method, path,
            );
            log_writer.log_blocked(
                &request_id, "unknown", "", "unknown", &method, &path, &source_ip,
                "N/A", 401,
                "API key required. Provide Authorization: Bearer <key>",
                None, None,
                user_agent.as_deref(),
            );
            return Err(json_response(
                StatusCode::UNAUTHORIZED,
                r#"{"error":"API key required. Provide Authorization: Bearer <key>"}"#,
            ));
        }
        Err(AuthError::InvalidKey) => {
            tracing::warn!(
                "[auth] 401 INVALID_KEY ip={} method={} path={}", source_ip, method, path,
            );
            log_writer.log_blocked(
                &request_id, "unknown", "", "unknown", &method, &path, &source_ip,
                "N/A", 401,
                "Invalid or inactive API key",
                None, None,
                user_agent.as_deref(),
            );
            return Err(json_response(
                StatusCode::UNAUTHORIZED,
                r#"{"error":"Invalid or inactive API key"}"#,
            ));
        }
    };

    let app_id                = auth.app_id.clone();
    let api_key_prefix        = auth.api_key_prefix.clone();
    let app_name              = auth.app_name.clone();
    let app_mode              = auth.app_mode.clone();
    let app_enable_t2         = auth.enable_t2;
    let app_enable_knowledge_dev = auth.enable_knowledge_dev;
    let app_enable_content_quality_scan = auth.enable_content_quality_scan;
    let app_content_quality_mode        = auth.content_quality_scan_mode.clone();
    let app_content_quality_threshold   = auth.content_quality_scan_threshold;

    // ── Multipart detection (from headers, before body read) ───────────────
    let multipart_ct: Option<String> = headers.get("content-type")
        .and_then(|v| v.to_str().ok())
        .filter(|ct| ct.contains("multipart/form-data"))
        .map(|ct| ct.to_string());
    let is_multipart = multipart_ct.is_some();
    let is_anthropic_detected = is_anthropic || path.contains("/v1/messages");

    // ── Body read + JSON parse (skip when pre_parsed is provided) ──────────
    let (body_bytes, req_json): (Bytes, Value) = if let Some((bb, jv)) = pre_parsed {
        (bb, jv)
    } else {
        let bb = match axum::body::to_bytes(body, state.body_limit_bytes).await {
            Ok(b) => b,
            Err(e) => {
                return Err(json_response(
                    StatusCode::BAD_REQUEST,
                    &format!(r#"{{"error":"Body extract failed: {}"}}"#, e),
                ));
            }
        };

        let jv: Value = if is_multipart {
            let body_str = String::from_utf8_lossy(&bb);
            let scan_text = crate::content::translation::extract_multipart_text(&body_str);
            tracing::info!(
                "[multipart] {} multipart request detected, extracted {} bytes of text",
                request_id, scan_text.len(),
            );
            serde_json::json!({"prompt": &scan_text})
        } else if is_anthropic_detected {
            let anthropic_raw: Value = serde_json::from_slice(&bb)
                .map_err(|_| json_response(StatusCode::BAD_REQUEST, r#"{"error":"Invalid JSON"}"#))?;
            crate::adapters::llm::anthropic::translate_anthropic_to_openai(anthropic_raw)
        } else {
            serde_json::from_slice(&bb)
                .map_err(|_| json_response(StatusCode::BAD_REQUEST, r#"{"error":"Invalid JSON"}"#))?
        };

        (bb, jv)
    };

    let raw_forward_body: Option<(Bytes, Option<String>)> =
        Some((body_bytes.clone(), multipart_ct));

    let is_streaming = req_json
        .get("stream")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    // ── Per-app rate limit ─────────────────────────────────────────────────
    match state.rate_limiter.check(&app_id) {
        RateLimitResult::Allowed { remaining } => {
            if remaining < 10 {
                tracing::info!(
                    "[rate]    app=\"{}\" ip={} remaining={} requests in window",
                    app_name, source_ip, remaining,
                );
            }
        }
        RateLimitResult::Limited { retry_after_secs } => {
            if let Some(m) = crate::tools::telemetry::METRICS.get() {
                m.ratelimit_hits_total.with_label_values(&[app_id.as_str()]).inc();
            }
            tracing::warn!(
                "[rate]    429 RATE_LIMITED app=\"{}\" ip={} retry_after={}s",
                app_name, source_ip, retry_after_secs,
            );
            let early_model = req_json
                .get("model")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            log_writer.log_blocked(
                &request_id, &app_id, &app_name, early_model, &method, &path, &source_ip,
                &api_key_prefix, 429,
                &format!("Rate limit exceeded (retry after {}s)", retry_after_secs),
                None,
                Some(String::from_utf8_lossy(&body_bytes).as_ref()),
                user_agent.as_deref(),
            );
            let mut resp = json_response(
                StatusCode::TOO_MANY_REQUESTS,
                &format!(r#"{{"error":"Rate limit exceeded","retry_after":{}}}"#, retry_after_secs),
            );
            resp.headers_mut()
                .insert("retry-after", retry_after_secs.to_string().parse().unwrap());
            return Err(resp);
        }
    }

    // ── Usage quota — per-app cap on successful upstream requests ──────────
    if auth.quota_mode != "unlimited"
        && let Some(limit) = auth.quota_limit
    {
        let qcfg = crate::tools::quota_tracker::QuotaConfig {
            mode:                  auth.quota_mode.clone(),
            limit,
            warning:               auth.quota_warning_limit,
            enforcement:           auth.quota_enforcement.clone(),
            reset_day:             auth.quota_reset_day.map(|d| d as u32),
            period_start_override: auth.quota_period_start,
            app_created_at:        auth.app_created_at,
        };
        match state.quota_tracker.check(&app_id, &qcfg).await {
            crate::tools::quota_tracker::QuotaDecision::Exceeded {
                used, limit, enforcement, period_end,
            } if enforcement == "hard" => {
                tracing::warn!(
                    "[quota]   429 QUOTA_EXCEEDED app=\"{}\" used={}/{}",
                    app_name, used, limit,
                );
                let early_model = req_json
                    .get("model")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                let reset_msg = period_end
                    .map(|e| format!(" Resets at {}.", e.to_rfc3339()))
                    .unwrap_or_default();
                let msg = format!(
                    "Usage quota exceeded ({}/{} successful requests).{}",
                    used, limit, reset_msg,
                );
                log_writer.log_entry(LogEntry {
                    request_id: request_id.clone(),
                    app_id: app_id.clone(),
                    app_name: app_name.clone(),
                    model: early_model.to_string(),
                    method: method.clone(),
                    path: path.clone(),
                    source_ip: source_ip.clone(),
                    app_api_key: api_key_prefix.clone(),
                    status_code: 429,
                    detector: Some("quota_exceeded".to_string()),
                    action: Some("blocked".to_string()),
                    threat_title: Some(msg.clone()),
                    final_decision: Some("block".to_string()),
                    raw_input_payload: Some(String::from_utf8_lossy(&body_bytes).to_string()),
                    user_agent: user_agent.clone(),
                    ..Default::default()
                });
                let mut resp = build_firewall_error(
                    &msg, &request_id, is_anthropic_detected, StatusCode::TOO_MANY_REQUESTS,
                );
                if let Some(e) = period_end {
                    let secs = (e - chrono::Utc::now()).num_seconds().max(1);
                    if let Ok(hv) = secs.to_string().parse() {
                        resp.headers_mut().insert("retry-after", hv);
                    }
                }
                return Err(resp);
            }
            crate::tools::quota_tracker::QuotaDecision::Exceeded { used, limit, .. } => {
                tracing::warn!(
                    "[quota]   OVER_LIMIT (soft) app=\"{}\" used={}/{} — allowing",
                    app_name, used, limit,
                );
            }
            crate::tools::quota_tracker::QuotaDecision::Allowed {
                used, limit, warning, ..
            } => {
                if warning {
                    tracing::warn!(
                        "[quota]   WARNING app=\"{}\" used={}/{}",
                        app_name, used, limit,
                    );
                }
            }
        }
    }

    // ── Provider chain resolution (primary → backup1 → backup2) ───────────
    let provider_chain = auth.resolve_provider_chain(policy_store);

    if provider_chain.is_empty() {
        tracing::warn!(
            "[route] 503 NO_PROVIDER app=\"{}\" ip={}", app_name, source_ip,
        );
        let early_model = req_json
            .get("model")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");
        log_writer.log_blocked(
            &request_id, &app_id, &app_name, early_model, &method, &path, &source_ip,
            &api_key_prefix, 503,
            "No upstream provider configured for this app",
            None,
            Some(String::from_utf8_lossy(&body_bytes).as_ref()),
            user_agent.as_deref(),
        );
        return Err(json_response(
            StatusCode::SERVICE_UNAVAILABLE,
            r#"{"error":"No upstream provider configured for this app"}"#,
        ));
    }

    // ── Model extraction ──────────────────────────────────────────────────
    let model: String = provider_chain[0]
        .model
        .as_deref()
        .or_else(|| req_json.get("model").and_then(|v| v.as_str()))
        .unwrap_or("unknown")
        .to_string();

    // ── Payload size check ────────────────────────────────────────────────
    if let Some(max_payload_size) = auth.max_payload_size {
        let body_len = body_bytes.len() as i64;
        if body_len > max_payload_size {
            tracing::warn!(
                "[payload] {} EXCEEDS_MAX_PAYLOAD_SIZE app=\"{}\" size={} max={}",
                request_id, app_name, body_len, max_payload_size,
            );
            log_writer.log_blocked(
                &request_id, &app_id, &app_name, &model, &method, &path, &source_ip,
                &api_key_prefix, 413,
                &format!(
                    "Input payload size ({} bytes) exceeds maximum allowed ({})",
                    body_len, max_payload_size,
                ),
                None,
                Some(String::from_utf8_lossy(&body_bytes).as_ref()),
                user_agent.as_deref(),
            );
            return Err(build_firewall_error(
                &format!(
                    "Input payload size ({} bytes) exceeds maximum allowed ({})",
                    body_len, max_payload_size,
                ),
                &request_id,
                is_anthropic_detected,
                StatusCode::PAYLOAD_TOO_LARGE,
            ));
        }
    }

    // ── Content extraction (role-aware prompt + tools + tool-calls) ────────
    // Runs before the prefill check below so the (redacted) user prompt can be
    // captured in that block's audit log entry, matching pre-refactor behavior.
    //
    // The Responses API (`/v1/responses`) uses `input`/`instructions` instead of
    // `messages`, so it needs its own extractor — `extract_prompt_aware` would
    // otherwise see no `messages` and return an empty prompt, silently disabling
    // scanning/classification for that endpoint.
    let (mut prompt_text, user_prompt): (String, Option<String>) = if path.contains("/v1/responses") {
        crate::content::extraction::extract_responses_text(&req_json)
    } else {
        let aware = crate::content::extraction::extract_prompt_aware(&req_json);
        let prompt_text_parts: Vec<&str> = [
            &aware.system_text,
            &aware.user_text,
            &aware.assistant_text,
            &aware.other_text,
        ]
        .iter()
        .filter(|s| !s.is_empty())
        .map(|s| s.as_str())
        .collect();
        let prompt_text = prompt_text_parts.join("\n\n");
        let user_prompt = if aware.user_text.is_empty() { None } else { Some(aware.user_text) };
        (prompt_text, user_prompt)
    };

    let tools_text = crate::content::extraction::extract_tools(&req_json);
    let tool_calls_text = crate::content::extraction::extract_tool_calls(&req_json);
    if !tools_text.is_empty() {
        tracing::info!("[tools]   {} found tool definitions in request", request_id);
        prompt_text.push_str("\n\n");
        prompt_text.push_str(&tools_text);
    }
    if !tool_calls_text.is_empty() {
        tracing::info!("[tools]   {} found tool calls in request", request_id);
        prompt_text.push_str("\n\n");
        prompt_text.push_str(&tool_calls_text);
    }

    // ── Assistant prefill injection detection ──────────────────────────────
    let prefill_result = crate::content::extraction::detect_assistant_prefill(&req_json);
    if prefill_result.detected {
        tracing::warn!("[prefill] {} BLOCKED: {}", request_id, prefill_result.reason);
        let log_user_prompt = crate::agents::redaction::redact_option(&user_prompt, policy_store);
        log_writer.log_entry(LogEntry {
            request_id: request_id.clone(),
            app_id: app_id.clone(),
            app_name: app_name.clone(),
            model: model.clone(),
            method: method.clone(),
            path: path.clone(),
            source_ip: source_ip.clone(),
            app_api_key: api_key_prefix.clone(),
            status_code: 403,
            flagged: true,
            detector: Some("prefill-injection".to_string()),
            action: Some("blocked".to_string()),
            threat_title: Some(format!(
                "Assistant prefill injection detected: {}", prefill_result.reason,
            )),
            user_prompt: log_user_prompt,
            raw_input_payload: Some(String::from_utf8_lossy(&body_bytes).to_string()),
            user_agent: user_agent.clone(),
            ..Default::default()
        });
        return Err(build_firewall_error(
            &format!("Assistant prefill injection detected: {}", prefill_result.reason),
            &request_id,
            is_anthropic_detected,
            StatusCode::FORBIDDEN,
        ));
    }

    Ok(Prepared {
        req_json,
        auth,
        request_id,
        method,
        path,
        source_ip,
        headers,
        body_bytes,
        user_agent,
        is_streaming,
        is_anthropic: is_anthropic_detected,
        is_multipart,
        raw_forward_body,
        provider_chain,
        model,
        prompt_text,
        user_prompt,
        app_id,
        api_key_prefix,
        app_name,
        app_mode,
        app_enable_t2,
        app_enable_knowledge_dev,
        app_enable_content_quality_scan,
        app_content_quality_mode,
        app_content_quality_threshold,
    })
}

/// Extract a prompt string from a flexible test payload: `input` / `prompt` /
/// `text` (string) or the message roles of an OpenAI-style `messages` array.
/// `pub(crate)` so downstream handlers (e.g. `scan_handler`) can reuse the
/// same flexible extraction.
pub(crate) fn extract_prompt(req_json: &Value) -> String {
    for key in ["input", "prompt", "text"] {
        if let Some(s) = req_json.get(key).and_then(|v| v.as_str())
            && !s.is_empty()
        {
            return s.to_string();
        }
    }
    let aware = crate::content::extraction::extract_prompt_aware(req_json);
    [
        aware.system_text,
        aware.user_text,
        aware.assistant_text,
        aware.other_text,
    ]
    .into_iter()
    .filter(|s| !s.is_empty())
    .collect::<Vec<_>>()
    .join("\n\n")
}
