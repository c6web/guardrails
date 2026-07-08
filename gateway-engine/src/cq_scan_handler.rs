//! Content quality scan endpoint.
//!
//! `POST /v1/cq_scan` — runs the content quality evaluation pipeline against
//! the supplied `input` + `response` pair and returns groundedness, relevance,
//! hallucination scores plus an `allow`/`flag`/`block` verdict, without ever
//! forwarding to an upstream LLM.
//!
//! Reuses the same ACL/rate-limit/auth preamble as `/v1/scan`
//! (`prepare` in `request_handler::preamble`).

use axum::{
    extract::{ConnectInfo, Request as AxumRequest, State},
    http::StatusCode,
    response::Response,
};
use reqwest::Client;
use serde_json::json;
use std::net::SocketAddr;
use std::time::Instant;

use crate::agents::content_quality::client::run_content_quality_scan;
use crate::pipeline_types::AppError;
use crate::policy::DetectorStore;
use crate::request_handler::preamble::{prepare, Prepared};
use crate::tools::log_writer::{LogEntry, LogWriter};
use crate::tools::json_response::json_response;

pub async fn handle_cq_scan_request(
    state: State<crate::GatewayState>,
    req: AxumRequest,
    connect_info: Option<ConnectInfo<SocketAddr>>,
) -> Result<Response, AppError> {
    let prep = match prepare(&state, req, connect_info, "cqs", false, None).await {
        Ok(p) => p,
        Err(resp) => return Ok(resp),
    };
    let Prepared {
        req_json, auth, request_id, method, path, source_ip, headers,
        app_enable_content_quality_scan,
        app_content_quality_mode,
        app_content_quality_threshold,
        ..
    } = prep;

    let client       = &state.client;
    let log_writer   = &state.log_writer;
    let policy_store = &state.policy_store;

    let user_agent = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    // ── Extract required fields ────────────────────────────────────────────
    let input = req_json
        .get("input")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let response = req_json
        .get("response")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if input.is_empty() || response.is_empty() {
        log_writer.log_entry(LogEntry {
            request_id: request_id.clone(),
            app_id: auth.app_id.clone(),
            app_name: auth.app_name.clone(),
            model: "cq_scan".to_string(),
            method: method.clone(),
            path: path.clone(),
            source_ip: source_ip.clone(),
            app_api_key: auth.api_key_prefix.clone(),
            status_code: 400,
            flagged: false,
            action: Some("failed".to_string()),
            threat_title: Some(
                "Both \"input\" and \"response\" fields are required and must be non-empty"
                    .to_string(),
            ),
            user_prompt: Some(input.to_string()),
            user_agent: user_agent.clone(),
            ..Default::default()
        });
        return Ok(json_response(
            StatusCode::BAD_REQUEST,
            r#"{"error":"Both \"input\" and \"response\" fields are required and must be non-empty"}"#,
        ));
    }

    // ── Gate: content quality scan must be enabled for this app ─────────────
    if !app_enable_content_quality_scan {
        log_writer.log_entry(LogEntry {
            request_id: request_id.clone(),
            app_id: auth.app_id.clone(),
            app_name: auth.app_name.clone(),
            model: "cq_scan".to_string(),
            method: method.clone(),
            path: path.clone(),
            source_ip: source_ip.clone(),
            app_api_key: auth.api_key_prefix.clone(),
            status_code: 403,
            flagged: false,
            action: Some("blocked".to_string()),
            threat_title: Some(
                "Content quality scanning is not enabled for this app".to_string(),
            ),
            user_prompt: Some(input.to_string()),
            user_agent: user_agent.clone(),
            ..Default::default()
        });
        return Ok(json_response(
            StatusCode::FORBIDDEN,
            r#"{"error":"Content quality scanning is not enabled for this app"}"#,
        ));
    }

    let start = Instant::now();

    // ── Run content quality scan ───────────────────────────────────────────
    let outcome = crate::agents::forwarding::content_quality_stage::run_inline(
        client,
        policy_store,
        &request_id,
        &auth.app_id,
        &auth.app_name,
        input,
        response,
        log_writer,
        app_content_quality_mode.as_deref(),
        app_content_quality_threshold,
    )
    .await;

    let elapsed = start.elapsed().as_millis() as i64;

    // ── Derive verdict & action from outcome ───────────────────────────────
    let (verdict, resp_action): (&str, Option<&str>) = if !outcome.scanned {
        // Fail-open: scan error → allow with null scores
        ("allow", None)
    } else if outcome.blocked {
        ("block", Some("blocked"))
    } else if outcome.redact_message.is_some() {
        ("block", Some("redacted"))
    } else if outcome.flagged {
        ("flag", outcome.action.as_deref())
    } else {
        ("allow", None)
    };

    let scores = outcome.scores.as_ref().map(|s| {
        (
            s.first().copied(),
            s.get(1).copied(),
            s.get(2).copied(),
        )
    });

    let reason = outcome.reason.clone().or_else(|| {
        if !outcome.scanned {
            Some("Content quality scan skipped (provider unavailable or timeout)".to_string())
        } else if verdict == "allow" {
            Some("Content quality checks passed".to_string())
        } else {
            None
        }
    });

    // ── Log ────────────────────────────────────────────────────────────────
    log_writer.log_entry(LogEntry {
        request_id: request_id.clone(),
        app_id: auth.app_id.clone(),
        app_name: auth.app_name.clone(),
        model: "cq_scan".to_string(),
        method: method.clone(),
        path: path.clone(),
        source_ip: source_ip.clone(),
        app_api_key: auth.api_key_prefix.clone(),
        duration_ms: elapsed,
        status_code: 200,
        flagged: outcome.flagged,
        action: outcome.action.clone(),
        user_prompt: Some(input.to_string()),
        user_agent: user_agent.clone(),
        content_quality_scanned: outcome.scanned,
        content_quality_groundedness: scores.and_then(|(g, _, _)| g),
        content_quality_relevance: scores.and_then(|(_, r, _)| r),
        content_quality_hallucination: scores.and_then(|(_, _, h)| h),
        content_quality_flagged: outcome.flagged,
        content_quality_action: outcome.action.clone(),
        content_quality_reason: reason.clone(),
        ..Default::default()
    });

    let body = json!({
        "object": "firewall.cq_scan",
        "request_id": request_id,
        "groundedness": scores.map(|(g, _, _)| g),
        "relevance": scores.map(|(_, r, _)| r),
        "hallucination": scores.map(|(_, _, h)| h),
        "verdict": verdict,
        "action": resp_action,
        "reason": reason,
        "duration_ms": elapsed,
    });

    Ok(json_response(StatusCode::OK, &body.to_string()))
}

/// Evaluate content quality as a control endpoint (no app context).
/// Wraps `run_content_quality_scan` with placeholder app fields and
/// returns the scores as a flat tuple so callers (e.g. `main.rs`
/// handler) don't need to import the full `ContentQualityScores` type.
///
/// Shared by both:
/// - `/v1/cq_scan` (indirectly, via `content_quality_stage::run_inline`)
/// - `/content-quality/evaluate-test` (directly)
pub async fn evaluate_for_control(
    client: &Client,
    policy_store: &DetectorStore,
    log_writer: &LogWriter,
    request_id: &str,
    context: &str,
    response: &str,
) -> (Option<f32>, Option<f32>, Option<f32>, Option<String>) {
    match run_content_quality_scan(
        client, policy_store, request_id,
        "__control__", "__control__",
        context, response, log_writer,
    ).await {
        Some(s) => (s.groundedness, s.relevance, s.hallucination, s.reason),
        None => (None, None, None, None),
    }
}
