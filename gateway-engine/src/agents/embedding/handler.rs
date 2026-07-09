//! Authenticated text-embedding endpoint (`POST /v1/embeddings`).
//!
//! Lets a registered app present its gateway API key and generate text
//! embeddings through the configured embedding provider chain (with the same
//! primary → backup fallback used by the internal semantic scan). Every call is
//! audited: an app-level row in `ai_request_logs` plus a provider-level row in
//! `embedding_logs`, tied together by a shared `request_id`.
//!
//! Request/response are OpenAI-compatible so existing embedding clients can be
//! pointed at the gateway unchanged:
//!   `{ "input": "text" | ["t1", "t2"], "model": "..." }`
//!   → `{ "object": "list", "data": [{ "object": "embedding", "index": 0,
//!        "embedding": [..] }], "model": "..", "usage": {..} }`

use axum::{
    extract::{ConnectInfo, Request as AxumRequest, State},
    http::StatusCode,
    response::Response,
};
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::time::Instant;

use crate::tools::auth::AuthError;
use crate::agents::embedding::client::{generate_embedding, EmbeddingProviderConfig};
use crate::tools::token_estimator::estimate_token_count;
use crate::tools::acl_check::{is_ip_blocked, resolve_source_ip};
use crate::tools::json_response::json_response;
use crate::pipeline_types::AppError;
use crate::tools::log_writer::LogEntry;
use crate::tools::rate_limiter::RateLimitResult;

const SOURCE: &str = "api";

/// Handle `POST /v1/embeddings`.
pub async fn handle_embedding_request(
    state: State<crate::GatewayState>,
    req: AxumRequest,
    connect_info: Option<ConnectInfo<SocketAddr>>,
) -> Result<Response, AppError> {
    let client       = &state.client;
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

    let request_id = format!("emb_{}", rand::random::<u64>());

    let (parts, body) = req.into_parts();
    let method  = parts.method.to_string();
    let path    = parts.uri.path().to_string();
    let headers = parts.headers;
    let user_agent = headers.get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    // Layer 0 — Network ACL (before auth)
    {
        let mode    = policy_store.acl_mode.read().unwrap_or_else(|e| e.into_inner()).clone();
        let entries = policy_store.acl_entries.read().unwrap_or_else(|e| e.into_inner()).clone();
        if is_ip_blocked(&source_ip, &mode, &entries) {
            tracing::warn!("[acl] 403 BLOCKED ip={} mode={} (embeddings)", source_ip, mode);
            log_writer.log_blocked(
                &request_id, "unknown", "", "embedding", &method, &path, &source_ip,
                "N/A", 403,
                "Access denied by network ACL",
                None, None,
                user_agent.as_deref(),
            );
            return Ok(json_response(
                StatusCode::FORBIDDEN,
                r#"{"error":"Access denied by network ACL"}"#,
            ));
        }
    }

    // Pre-auth rate limit — per source IP, before body read
    if let RateLimitResult::Limited { retry_after_secs } = state.preauth_rate_limiter.check(&source_ip) {
        if let Some(m) = crate::tools::telemetry::METRICS.get() {
            m.preauth_ratelimit_hits_total.inc();
        }
        tracing::warn!("[preauth_rate] 429 RATE_LIMITED ip={} retry_after={}s (embeddings)", source_ip, retry_after_secs);
            log_writer.log_blocked(
                &request_id, "unknown", "", "embedding", &method, &path, &source_ip,
                "N/A", 429,
                &format!("Rate limit exceeded (retry after {}s)", retry_after_secs),
                None, None,
                user_agent.as_deref(),
            );
        let mut resp = json_response(
            StatusCode::TOO_MANY_REQUESTS,
            &format!(r#"{{"error":"Too many requests","retry_after":{}}}"#, retry_after_secs),
        );
        resp.headers_mut().insert("retry-after", retry_after_secs.to_string().parse().unwrap());
        return Ok(resp);
    }

    let body_bytes = match axum::body::to_bytes(body, state.body_limit_bytes).await {
        Ok(b) => b,
        Err(e) => {
            let msg = format!("Body extract failed: {}", e);
            tracing::warn!("[embed] {} BODY_EXTRACT_FAIL ip={} error={}", request_id, source_ip, e);
            log_writer.log_blocked(
                &request_id, "unknown", "", "embedding", &method, &path, &source_ip,
                "N/A", 500,
                &msg,
                None, None,
                user_agent.as_deref(),
            );
            return Ok(json_response(StatusCode::INTERNAL_SERVER_ERROR, &format!(r#"{{"error":"{}"}}"#, msg)));
        }
    };

    let raw_input_str = String::from_utf8_lossy(&body_bytes).to_string();

    let req_json: Value = match serde_json::from_slice(&body_bytes) {
        Ok(v) => v,
        Err(e) => {
            let msg = format!("Invalid JSON: {}", e);
            tracing::warn!("[embed] {} INVALID_JSON ip={} error={}", request_id, source_ip, e);
            log_writer.log_blocked(
                &request_id, "unknown", "", "embedding", &method, &path, &source_ip,
                "N/A", 400,
                &msg,
                None, None,
                user_agent.as_deref(),
            );
            return Ok(json_response(StatusCode::BAD_REQUEST, &format!(r#"{{"error":"{}"}}"#, msg)));
        }
    };

    // Auth — in-memory cache lookup
    let auth = match state.auth_service.authenticate(&headers) {
        Ok(a) => a,
        Err(AuthError::MissingKey) => {
            tracing::warn!("[auth] 401 MISSING_KEY ip={} path={} (embeddings)", source_ip, path);
            log_writer.log_blocked(
                &request_id, "unknown", "", "embedding", &method, &path, &source_ip,
                "N/A", 401,
                "API key required. Provide Authorization: Bearer <key>",
                None, None,
                user_agent.as_deref(),
            );
            return Ok(json_response(StatusCode::UNAUTHORIZED,
                r#"{"error":"API key required. Provide Authorization: Bearer <key>"}"#));
        }
        Err(AuthError::InvalidKey) => {
            tracing::warn!("[auth] 401 INVALID_KEY ip={} path={} (embeddings)", source_ip, path);
            log_writer.log_blocked(
                &request_id, "unknown", "", "embedding", &method, &path, &source_ip,
                "N/A", 401,
                "Invalid or inactive API key",
                None, None,
                user_agent.as_deref(),
            );
            return Ok(json_response(StatusCode::UNAUTHORIZED,
                r#"{"error":"Invalid or inactive API key"}"#));
        }
    };

    let app_id         = auth.app_id;
    let api_key_prefix = auth.api_key_prefix;
    let app_name       = auth.app_name;

    // Rate limit — per-app
    if let RateLimitResult::Limited { retry_after_secs } = state.rate_limiter.check(&app_name) {
        if let Some(m) = crate::tools::telemetry::METRICS.get() {
            m.ratelimit_hits_total.with_label_values(&[&app_name]).inc();
        }
        tracing::warn!("[rate] 429 RATE_LIMITED app=\"{}\" ip={} (embeddings)", app_name, source_ip);
          log_writer.log_blocked(
                &request_id, &app_id, &app_name, "embedding", &method, &path, &source_ip,
                &api_key_prefix, 429,
                &format!("Rate limit exceeded (retry after {}s)", retry_after_secs),
                None, None,
                user_agent.as_deref(),
            );
        let mut resp = json_response(
            StatusCode::TOO_MANY_REQUESTS,
            &format!(r#"{{"error":"Rate limit exceeded","retry_after":{}}}"#, retry_after_secs),
        );
        resp.headers_mut().insert("retry-after", retry_after_secs.to_string().parse().unwrap());
        return Ok(resp);
    }

    // Parse the OpenAI-style `input` (string or array of strings).
    let inputs = extract_inputs(&req_json);
    let requested_model = req_json.get("model").and_then(|v| v.as_str());
    let start_time = Instant::now();

    if inputs.is_empty() {
         log_writer.log_blocked(
                &request_id, &app_id, &app_name, requested_model.unwrap_or("embedding"),
                &method, &path, &source_ip, &api_key_prefix, 400,
                "Request must include a non-empty \"input\" (string or array of strings)",
                None, None,
                user_agent.as_deref(),
            );
        return Ok(json_response(StatusCode::BAD_REQUEST,
            r#"{"error":"Request must include a non-empty \"input\" (string or array of strings)"}"#));
    }

    // Snapshot the configured embedding provider chain (primary → backups).
    let providers: Vec<EmbeddingProviderConfig> =
        policy_store.embedding_providers.read().unwrap_or_else(|e| e.into_inner()).clone();

    if providers.is_empty() {
        tracing::warn!("[embed] 503 NO_PROVIDER app=\"{}\" ip={}", app_name, source_ip);
         log_writer.log_blocked(
                &request_id, &app_id, &app_name, requested_model.unwrap_or("embedding"),
                &method, &path, &source_ip, &api_key_prefix, 503,
                "No embedding provider configured",
                None, None,
                user_agent.as_deref(),
            );
        return Ok(json_response(StatusCode::SERVICE_UNAVAILABLE,
            r#"{"error":"No embedding provider configured on this gateway"}"#));
    }

    // The model/provider we attribute the request to (primary slot).
    let primary = &providers[0];
    let report_model = requested_model
        .or(primary.model.as_deref())
        .unwrap_or("embedding");
    let total_chars: i32 = inputs.iter().map(|s| s.len() as i32).sum();
    let total_tokens: i32 = inputs.iter().map(|s| estimate_token_count(s) as i32).sum();
    // Input text captured for auditing — single item verbatim, batch items indexed.
    let audit_input: String = if inputs.len() == 1 {
        inputs[0].clone()
    } else {
        inputs.iter().enumerate()
            .map(|(i, s)| format!("[{}] {}", i, s))
            .collect::<Vec<_>>()
            .join("\n")
    };

    // G5: redact sensitive fields (audit_input) for logging.
    let audit_input_opt = Some(audit_input.clone());
    let log_audit_input = crate::agents::redaction::redact_option(&audit_input_opt, policy_store, &app_id);

    // Generate an embedding per input item.
    let mut data = Vec::with_capacity(inputs.len());
    for (index, text) in inputs.iter().enumerate() {
        match generate_embedding(client, &providers, text).await {
            Ok(vec) => {
                data.push(json!({
                    "object": "embedding",
                    "index": index,
                    "embedding": vec,
                }));
            }
            Err(e) => {
                let elapsed = start_time.elapsed().as_millis() as i64;
                tracing::warn!("[embed] {} FAILED app=\"{}\" item={} error={}", request_id, app_name, index, e);
                log_writer.log_embedding(
                    Some(&request_id), &primary.id, &primary.name, Some(report_model),
                    total_chars, log_audit_input.as_deref(), primary.dimensions, false, Some(&e), elapsed, SOURCE,
                );
        log_writer.log_error(
                        &request_id, &app_id, &app_name, report_model, &method, &path, &source_ip,
                        &api_key_prefix, 502,
                        &format!("Embedding generation failed: {}", e),
                        log_audit_input.as_deref(),
                        Some(&raw_input_str),
                        user_agent.as_deref(),
                    );
                return Ok(json_response(
                    StatusCode::BAD_GATEWAY,
                    &format!(r#"{{"error":"Embedding generation failed","detail":"{}"}}"#,
                        e.replace('"', "'")),
                ));
            }
        }
    }

    let elapsed = start_time.elapsed().as_millis() as i64;
    let dimensions = data.first()
        .and_then(|d| d.get("embedding"))
        .and_then(|e| e.as_array())
        .map(|a| a.len() as i32);

    // Audit: provider-level metrics + app-level activity row (shared request_id).
    log_writer.log_embedding(
        Some(&request_id), &primary.id, &primary.name, Some(report_model),
        total_chars, log_audit_input.as_deref(), dimensions, true, None, elapsed, SOURCE,
    );
    log_writer.log_entry(LogEntry {
        request_id: request_id.clone(),
        app_id: app_id.clone(),
        app_name: app_name.clone(),
        model: report_model.to_string(),
        method: method.clone(),
        path: path.clone(),
        source_ip: source_ip.clone(),
        app_api_key: api_key_prefix.clone(),
        tokens_in: total_tokens,
        duration_ms: elapsed,
        status_code: 200,
        action: Some("embedding".to_string()),
        user_prompt: log_audit_input,
        upstream_provider_id: Some(primary.id.clone()),
        upstream_provider_name: Some(primary.name.clone()),
        user_agent: user_agent.clone(),
        raw_input_payload: Some(raw_input_str.clone()),
        ..Default::default()
    });

    tracing::info!("[embed] {} OK app=\"{}\" items={} dims={:?} elapsed={}ms",
        request_id, app_name, inputs.len(), dimensions, elapsed);

    let response = json!({
        "object": "list",
        "data": data,
        "model": report_model,
        "usage": { "prompt_tokens": total_tokens, "total_tokens": total_tokens },
    });

    Ok(json_response(StatusCode::OK, &response.to_string()))
}

/// Extract the OpenAI `input` field as a list of strings (string or array),
/// falling back to the canonical `extract_request_text` for broader format support.
fn extract_inputs(req_json: &Value) -> Vec<String> {
    // Primary: OpenAI-style `input` field with per-item semantics
    if let Some(input) = req_json.get("input") {
        if let Some(s) = input.as_str()
            && !s.is_empty() {
                return vec![s.to_string()];
        }
        if let Some(arr) = input.as_array() {
            let v: Vec<String> = arr
                .iter()
                .filter_map(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .collect();
            if !v.is_empty() {
                return v;
            }
        }
    }
    // Fallback: canonical extraction handles `prompt`, `messages`, etc.
    crate::content::extraction::extract_request_text(req_json)
        .map(|t| vec![t])
        .unwrap_or_default()
}
