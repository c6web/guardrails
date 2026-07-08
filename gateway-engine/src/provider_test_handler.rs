//! Provider diagnostic endpoints (admin / developer "is it working?" tests).
//!
//!   `POST /v1/test/upstream`       — forward a chat request straight to the
//!       app's configured upstream provider chain and return the raw reply.
//!   `POST /v1/test/classification` — run a prompt through the configured
//!       classifier provider and return its verdict.
//!
//! Both require a valid gateway API key (same as `/v1/embeddings`) and perform
//! **no security scanning** — the goal is to verify the provider responds and
//! parses correctly. Input and output are recorded in the AI activity log
//! (`ai_request_logs`) for auditing.

use axum::{
    extract::{ConnectInfo, Request as AxumRequest, State},
    http::StatusCode,
    response::Response,
};
use serde_json::json;
use std::net::SocketAddr;
use std::time::Instant;

use crate::agents::classification::classify;
use crate::agents::forwarding::forward_with_fallback;
use crate::tools::json_response::json_response;
use crate::pipeline_types::{AppError, ForwardArgs};
use crate::tools::log_writer::LogEntry;
use crate::request_handler::preamble::{prepare, Prepared, extract_prompt};

// ── Upstream test ─────────────────────────────────────────────────────────────

/// Handle `POST /v1/test/upstream` — forward straight to the app's upstream
/// provider chain (no scanning). Reuses `forward_with_fallback`, which records
/// the prompt and the upstream reply in `ai_request_logs`.
pub async fn handle_upstream_test(
    state: State<crate::GatewayState>,
    req: AxumRequest,
    connect_info: Option<ConnectInfo<SocketAddr>>,
) -> Result<Response, AppError> {
    let prep = match prepare(&state, req, connect_info, "tup", false, None).await {
        Ok(p) => p,
        Err(resp) => return Ok(resp),
    };
    let Prepared { req_json, auth, request_id, method, path, source_ip, headers, .. } = prep;

    let client       = &state.client;
    let log_writer   = &state.log_writer;
    let policy_store = &state.policy_store;

    // Resolve the app's provider chain (primary → backups).
    let provider_chain = auth.resolve_provider_chain(policy_store);

    if provider_chain.is_empty() {
        tracing::warn!("[test] 503 NO_PROVIDER app=\"{}\" ip={} (upstream test)", auth.app_name, source_ip);
        log_writer.log_blocked(
            &request_id, &auth.app_id, &auth.app_name, "upstream-test", &method, &path, &source_ip,
            &auth.api_key_prefix, 503,
            "No upstream provider configured for this app",
            None, None, None,
        );
        return Ok(json_response(StatusCode::SERVICE_UNAVAILABLE,
            r#"{"error":"No upstream provider configured for this app"}"#));
    }

    // Provider-configured model is authoritative (matches the live forwarding path);
    // fall back to the client's model, then "unknown" for labeling only.
    let model = provider_chain[0].model.as_deref()
        .or_else(|| req_json.get("model").and_then(|v| v.as_str()))
        .unwrap_or("unknown")
        .to_string();
    let aware = crate::content::extraction::extract_prompt_aware(&req_json);
    let user_prompt = if aware.user_text.is_empty() { None } else { Some(aware.user_text) };

    tracing::warn!("[test] {} UPSTREAM_TEST app=\"{}\" providers={}", request_id, auth.app_name, provider_chain.len());

    forward_with_fallback(
        ForwardArgs {
            client,
            log_writer,
            request_id: &request_id,
            app_id: &auth.app_id,
            api_key_prefix: &auth.api_key_prefix,
            app_name: &auth.app_name,
            model: &model,
            method: &method,
            path: &path,
            source_ip: &source_ip,
            user_prompt: &user_prompt,
            req_body: req_json,
            providers: &provider_chain,
            start_time: Instant::now(),
            flagged: false,
            detector: None,
            confidence: None,
            threat_title: None,
            excerpt: None,
            action: Some("upstream-test".to_string()),
            threat_framework_id: None,
            classifier_id: None,
            classifier_name: None,
            policy_store,
            is_anthropic: false,
            pipeline_trace: None,
            final_decision: None,
            blocked_stage: None,
            classification_reason: None,
            t2_flagged: false,
            t2_confidence: None,
            t2_reason: None,
            provider_meter: None,
            input_redaction_summary: None,
            raw_body: None,
            path_override: None,
            client_headers: &headers,
            user_agent: None,
            raw_input_payload: None,
            cache_store: None,
            cache_request_hash: None,
            prompt_text: "",
            multi_turn_cache_params: None,
            cache_ttl_seconds: auth.cache_ttl_seconds,
            app_enable_content_quality_scan: false,
            app_content_quality_mode: None,
            app_content_quality_threshold: None,
        },
    ).await
}

// ── Classification test ─────────────────────────────────────────────────────

/// Handle `POST /v1/test/classification` — run a prompt through the configured
/// classifier provider (no scanning) and return its verdict. Input and the
/// classification outcome are recorded in `ai_request_logs`.
pub async fn handle_classification_test(
    state: State<crate::GatewayState>,
    req: AxumRequest,
    connect_info: Option<ConnectInfo<SocketAddr>>,
) -> Result<Response, AppError> {
    let prep = match prepare(&state, req, connect_info, "tcl", false, None).await {
        Ok(p) => p,
        Err(resp) => return Ok(resp),
    };
    let Prepared { req_json, auth, request_id, method, path, source_ip, .. } = prep;

    let client       = &state.client;
    let log_writer   = &state.log_writer;
    let policy_store = &state.policy_store;

    let prompt = extract_prompt(&req_json);
    let prompt_opt = Some(prompt.clone());
    if prompt.is_empty() {
        log_writer.log_blocked(
            &request_id, &auth.app_id, &auth.app_name, "classifier", &method, &path, &source_ip,
            &auth.api_key_prefix, 400,
            "Request must include a non-empty \"input\" / \"prompt\" or \"messages\"",
            None, None, None,
        );
        return Ok(json_response(StatusCode::BAD_REQUEST,
            r#"{"error":"Request must include a non-empty \"input\", \"prompt\", or \"messages\""}"#));
    }

    // Snapshot the configured classifier provider + settings.
    let provider     = policy_store.classifier_provider.read().unwrap_or_else(|e| e.into_inner()).clone();
    // Per-app override (connected_apps.classifier_threshold / classifier_prompt);
    // null on the app falls back to the global classifier config.
    let threshold    = auth.classifier_threshold
        .unwrap_or_else(|| *policy_store.classifier_threshold.read().unwrap_or_else(|e| e.into_inner()));
    let system_prompt = auth.classifier_prompt.clone()
        .unwrap_or_else(|| policy_store.classifier_system_prompt.read().unwrap_or_else(|e| e.into_inner()).clone());

    let (prov_id, prov_name, model) = match &provider {
        Some(p) => (Some(p.id.clone()), Some(p.name.clone()), p.model.clone().unwrap_or_else(|| "unknown".to_string())),
        None => (None, None, "none".to_string()),
    };

    if provider.is_none() {
            // G5: redact sensitive fields (prompt) for logging.
            let log_prompt = crate::agents::redaction::redact_option(&prompt_opt, policy_store);
            tracing::warn!("[test] 503 NO_CLASSIFIER app=\"{}\" ip={}", auth.app_name, source_ip);
            log_writer.log_blocked(
                &request_id, &auth.app_id, &auth.app_name, "classifier", &method, &path, &source_ip,
                &auth.api_key_prefix, 503,
                "No classifier provider configured on this gateway",
                log_prompt.as_deref(),
                None, None,
            );
        return Ok(json_response(StatusCode::SERVICE_UNAVAILABLE,
            r#"{"error":"No classifier provider configured on this gateway"}"#));
    }

    let start = Instant::now();
    let result = classify(client, &prompt, provider.as_ref(), threshold, &system_prompt, log_writer, None, policy_store).await;
    let elapsed = start.elapsed().as_millis() as i64;

    match result {
        Ok(r) => {
            let verdict = if r.is_attack { "FLAGGED" } else { "SAFE" };
            let response = json!({
                "object":     "classification.test",
                "provider":   prov_name,
                "model":      model,
                "threshold":  threshold,
                "result": {
                    "verdict":    verdict,
                    "is_attack":  r.is_attack,
                    "framework_id":   r.framework_id,
                    "confidence": r.confidence,
                    "reason":     r.reason,
                },
                "duration_ms": elapsed,
            });
            let resp_str = response.to_string();

            tracing::warn!("[test] {} CLASSIFIER_TEST app=\"{}\" verdict={} framework_id={} confidence={:.2} elapsed={}ms",
                request_id, auth.app_name, verdict, r.framework_id, r.confidence, elapsed);

            // G5: redact sensitive fields (prompt) for logging.
            let log_prompt = crate::agents::redaction::redact_option(&prompt_opt, policy_store);
            let lw_action = Some("classification-test".to_string());
            let lw_detector = if r.framework_id.is_empty() { None } else { Some(r.framework_id.clone()) };
            let lw_framework_id = if r.framework_id.is_empty() { None } else { Some(r.framework_id.clone()) };
            let lw_threat_title = if r.reason.is_empty() { None } else { Some(r.reason.clone()) };
            log_writer.log_entry(LogEntry {
                request_id: request_id.clone(),
                app_id: auth.app_id.clone(),
                app_name: auth.app_name.clone(),
                model: model.clone(),
                method: method.clone(),
                path: path.clone(),
                source_ip: source_ip.clone(),
                app_api_key: auth.api_key_prefix.clone(),
                duration_ms: elapsed,
                status_code: 200,
                flagged: r.is_attack,
                detector: lw_detector,
                confidence: Some(r.confidence),
                action: lw_action,
                threat_title: lw_threat_title,
                framework_id: lw_framework_id,
                user_prompt: log_prompt,
                response_body: Some(resp_str.clone()),
                classifier_provider_id: prov_id.clone(),
                classifier_provider_name: prov_name.clone(),
                ..Default::default()
            });

            Ok(json_response(StatusCode::OK, &resp_str))
        }
        Err(e) => {
            tracing::warn!("[test] {} CLASSIFIER_TEST_FAILED app=\"{}\" error={}", request_id, auth.app_name, e);
            // G5: redact sensitive fields (prompt) for logging.
            let log_prompt = crate::agents::redaction::redact_option(&prompt_opt, policy_store);
            log_writer.log_entry(LogEntry {
                request_id: request_id.clone(),
                app_id: auth.app_id.clone(),
                app_name: auth.app_name.clone(),
                model: model.clone(),
                method: method.clone(),
                path: path.clone(),
                source_ip: source_ip.clone(),
                app_api_key: auth.api_key_prefix.clone(),
                duration_ms: elapsed,
                status_code: 502,
                action: Some("failed".to_string()),
                threat_title: Some(format!("Classifier test failed: {}", e)),
                user_prompt: log_prompt,
                response_body: Some(String::new()),
                classifier_provider_id: prov_id.clone(),
                classifier_provider_name: prov_name.clone(),
                ..Default::default()
            });
            Ok(json_response(
                StatusCode::BAD_GATEWAY,
                &format!(r#"{{"error":"Classifier provider test failed","detail":"{}"}}"#,
                    e.replace('"', "'")),
            ))
        }
    }
}
