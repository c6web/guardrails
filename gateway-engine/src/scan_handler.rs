//! Detect-only threat scanning endpoint.
//!
//! `POST /v1/scan` — runs the exact same scanning pipeline used by every proxy
//! endpoint (T1 keyword/regex + semantic + LLM classifier via
//! `agents::orchestrator::scan_pipeline`, plus optional T2 intent analysis via
//! `agents::classification::t2_analyzer::run_t2_analysis`) but never forwards
//! to an upstream LLM. Always returns an explicit `allow`/`block` verdict with
//! a reason and the `request_id`, so a calling application can check arbitrary
//! text — RAG chunks, agent intermediate steps, tool arguments — before it
//! ever reaches a model.
//!
//! Reuses the same ACL/rate-limit/auth preamble as the other non-forwarding
//! diagnostic endpoints (`provider_test_handler::prepare`) rather than
//! duplicating it.

use axum::{
    extract::{ConnectInfo, Request as AxumRequest, State},
    http::StatusCode,
    response::Response,
};
use serde_json::json;
use std::net::SocketAddr;
use std::time::Instant;

use crate::pipeline_types::{AppError, LayerResult};
use crate::request_handler::preamble::{extract_prompt, prepare, Prepared};
use crate::tools::log_writer::LogEntry;
use crate::request_handler::helpers::trace_json;
use crate::tools::json_response::json_response;

/// Handle `POST /v1/scan` — run the full scan pipeline against arbitrary text
/// and return the verdict instead of forwarding to a provider.
pub async fn handle_scan_request(
    state: State<crate::GatewayState>,
    req: AxumRequest,
    connect_info: Option<ConnectInfo<SocketAddr>>,
) -> Result<Response, AppError> {
    let prep = match prepare(&state, req, connect_info, "scn", false, None).await {
        Ok(p) => p,
        Err(resp) => return Ok(resp),
    };
    let Prepared { req_json, auth, request_id, method, path, source_ip, headers, .. } = prep;

    let client       = &state.client;
    let log_writer   = &state.log_writer;
    let policy_store = &state.policy_store;

    let user_agent = headers.get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let prompt = extract_prompt(&req_json);
    if prompt.is_empty() {
        log_writer.log_blocked(
            &request_id, &auth.app_id, &auth.app_name, "scan", &method, &path, &source_ip,
            &auth.api_key_prefix, 400,
            "Request must include a non-empty \"input\" / \"prompt\" or \"messages\"",
            None, None,
            user_agent.as_deref(),
        );
        return Ok(json_response(StatusCode::BAD_REQUEST,
            r#"{"error":"Request must include a non-empty \"input\", \"prompt\", or \"messages\""}"#));
    }

    let start = Instant::now();

    // ── Same T1 pipeline every proxy endpoint runs — no duplication ──────────
    let t1_summary = crate::agents::orchestrator::scan_pipeline(
        client, &prompt, &auth.app_id, policy_store,
        &request_id, &source_ip, log_writer,
        state.scan_fail_closed,
        None, None, false, None,
        auth.classifier_threshold, auth.classifier_prompt.as_deref(),
    ).await;

    // ── Same T2 intent analysis, gated by the app's enable_t2 flag ───────────
    let scan_summary = if auth.enable_t2 && t1_summary.final_decision != "block" {
        crate::agents::classification::t2_analyzer::run_t2_analysis(
            client, &prompt, policy_store, &request_id, t1_summary, log_writer,
        ).await
    } else {
        t1_summary
    };

    let elapsed = start.elapsed().as_millis() as i64;

    let t2_flagged    = scan_summary.t2_result.as_ref().map(|r| r.is_attack).unwrap_or(false);
    let t2_confidence = scan_summary.t2_result.as_ref().map(|r| r.confidence);
    let t2_reason     = scan_summary.t2_result.as_ref().map(|r| r.reason.clone());

    // final_decision is always "allow" | "block" — exactly the verdict an
    // SDK's scan() call needs, independent of forwarding/app_mode concerns.
    let verdict = scan_summary.final_decision.clone();

    let (detector, confidence, hit_reason, framework_id): (Option<String>, Option<f32>, Option<String>, Option<String>) =
        match &scan_summary.hit {
            Some(LayerResult::Hit { detector, confidence, reason, framework_id, .. }) => (
                Some(detector.clone()),
                *confidence,
                reason.clone(),
                if framework_id.is_empty() { None } else { Some(framework_id.clone()) },
            ),
            _ => (None, None, None, None),
        };

    let reason = if scan_summary.blocked_stage.as_deref() == Some("t2_intent") {
        t2_reason.clone().or_else(|| hit_reason.clone())
    } else {
        hit_reason.clone()
    }.unwrap_or_else(|| {
        if verdict == "block" {
            "Blocked by firewall policy".to_string()
        } else {
            "No threats detected".to_string()
        }
    });

    let pipeline_trace_json = trace_json(&scan_summary);
    let trace_value: serde_json::Value = pipeline_trace_json.as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or(serde_json::Value::Null);

    tracing::warn!("[scan] {} app=\"{}\" verdict={} stage={:?} elapsed={}ms",
        request_id, auth.app_name, verdict, scan_summary.blocked_stage, elapsed);

    let log_prompt = crate::agents::redaction::redact_option(&Some(prompt.clone()), policy_store);
    let threat_knowledge_matches_json: Option<String> = if scan_summary.semantic_matches.is_empty() {
        None
    } else {
        serde_json::to_string(&scan_summary.semantic_matches).ok()
    };
    let classification_reason = scan_summary.classifier_result.as_ref().map(|r| r.reason.as_str());

    log_writer.log_entry(LogEntry {
        request_id: request_id.clone(),
        app_id: auth.app_id.clone(),
        app_name: auth.app_name.clone(),
        model: "scan".to_string(),
        method: method.clone(),
        path: path.clone(),
        source_ip: source_ip.clone(),
        app_api_key: auth.api_key_prefix.clone(),
        duration_ms: elapsed,
        status_code: 200,
        flagged: verdict == "block",
        detector: detector.clone(),
        confidence,
        action: Some("scanned".to_string()),
        threat_title: Some(reason.clone()),
        framework_id: framework_id.clone(),
        user_prompt: log_prompt,
        threat_knowledge_matches: threat_knowledge_matches_json,
        semantic_threshold: Some(scan_summary.emb_threshold),
        false_positive_candidate: scan_summary.false_positive_candidates,
        pipeline_trace: pipeline_trace_json.clone(),
        final_decision: Some(verdict.clone()),
        blocked_stage: scan_summary.blocked_stage.clone(),
        classification_reason: classification_reason.map(|s| s.to_string()),
        t2_flagged,
        t2_confidence,
        t2_reason,
        user_agent: user_agent.clone(),
        ..Default::default()
    });

    let body = json!({
        "object": "firewall.scan",
        "request_id": request_id,
        "verdict": verdict,
        "final_decision": scan_summary.final_decision,
        "blocked_stage": scan_summary.blocked_stage,
        "detector": detector,
        "framework_id": framework_id,
        "confidence": confidence,
        "reason": reason,
        "semantic_matches": scan_summary.semantic_matches,
        "trace": trace_value,
        "duration_ms": elapsed,
    });

    Ok(json_response(StatusCode::OK, &body.to_string()))
}
