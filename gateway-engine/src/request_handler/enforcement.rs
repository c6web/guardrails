use axum::{body::Bytes, http::HeaderMap, http::StatusCode, response::Response};
use reqwest::Client;
use serde_json::Value;
use std::time::Instant;

use crate::agents::cache::store::ResponseCacheStore;
use crate::agents::forwarding::forward_or_stream;
use crate::enforcement::rules::{evaluate, EnforcementAction};
use crate::policy::{DetectorStore, ProviderConfig};
use crate::tools::log_writer::{LogEntry, LogWriter};
use crate::tools::provider_meter::ProviderMeter;
use crate::pipeline_types::{AppError, ForwardArgs, MultiTurnCacheParams, ScanSummary};

// ── Forwarding context (bundles params common to all enforcement paths) ────────

pub(crate) struct DispatchCtx<'a> {
    pub client:            &'a Client,
    pub log_writer:        &'a LogWriter,
    pub policy_store:      &'a DetectorStore,
    pub provider_meter:    Option<&'a ProviderMeter>,
    pub request_id:        &'a str,
    pub app_id:            &'a str,
    pub api_key_prefix:    &'a str,
    pub app_name:          &'a str,
    pub model:             &'a str,
    pub method:            &'a str,
    pub path:              &'a str,
    pub source_ip:         &'a str,
    pub user_prompt:       &'a Option<String>,
    pub provider_chain:    &'a [ProviderConfig],
    pub start_time:        Instant,
    pub is_streaming:      bool,
    pub is_anthropic:      bool,
    pub raw_forward_body:  Option<(Bytes, Option<String>)>,
    pub headers:           &'a HeaderMap,
    pub user_agent:        Option<&'a str>,
    pub raw_input_payload: Option<&'a str>,
    /// When set, forward to this upstream path instead of the adapter's default
    /// chat/stream path (e.g. `/responses` for the `/v1/responses` endpoint).
    pub upstream_path_override: Option<&'a str>,

    // ── Response cache fields ────────────────────────────────────────────────
    pub cache_store:              Option<&'a ResponseCacheStore>,
    pub cache_request_hash:       Option<&'a str>,
    pub prompt_text:              &'a str,
    pub multi_turn_cache_params:  Option<MultiTurnCacheParams>,
    pub cache_ttl_seconds:        Option<i32>,

    // ── Content Quality Scanning fields (per-app opt-in) ─────────────────────
    pub app_enable_content_quality_scan: bool,
    pub app_content_quality_mode:        Option<&'a str>,
    pub app_content_quality_threshold:   Option<f32>,
}

// ── Bypass mode forward ────────────────────────────────────────────────────────

pub(crate) async fn handle_bypass(
    ctx: &DispatchCtx<'_>,
    req_json: Value,
) -> Result<Response, AppError> {
    tracing::info!("[bypass]  {} app=\"{}\" forwarding without scan", ctx.request_id, ctx.app_name);
    let bypass_trace = Some(r#"{"final_decision":"bypassed","stages":[{"stage":"bypass","decision":"bypassed","ms":0}]}"#.to_string());
    forward_or_stream(
        ForwardArgs {
            client:                ctx.client,
            log_writer:            ctx.log_writer,
            request_id:            ctx.request_id,
            app_id:                ctx.app_id,
            api_key_prefix:        ctx.api_key_prefix,
            app_name:              ctx.app_name,
            model:                 ctx.model,
            method:                ctx.method,
            path:                  ctx.path,
            source_ip:             ctx.source_ip,
            user_prompt:           ctx.user_prompt,
            req_body:              req_json,
            providers:             ctx.provider_chain,
            start_time:            ctx.start_time,
            flagged:               false,
            detector:              None,
            confidence:            None,
            threat_title:          None,
            excerpt:               None,
            action:                Some("bypassed".to_string()),
            threat_framework_id:   None,
            classifier_id:         None,
            classifier_name:       None,
            policy_store:          ctx.policy_store,
            is_anthropic:          ctx.is_anthropic,
            pipeline_trace:        bypass_trace,
            final_decision:        Some("bypassed".to_string()),
            blocked_stage:         None,
            classification_reason: None,
            t2_flagged:            false,
            t2_confidence:         None,
            t2_reason:             None,
            provider_meter:        ctx.provider_meter,
            input_redaction_summary: None,
            raw_body:              ctx.raw_forward_body.clone(),
            path_override:         ctx.upstream_path_override,
            client_headers:        ctx.headers,
            user_agent:            ctx.user_agent,
            raw_input_payload:     ctx.raw_input_payload,
            cache_store:              None,
            cache_request_hash:       None,
            prompt_text:              ctx.prompt_text,
            multi_turn_cache_params:  None,
            cache_ttl_seconds:        ctx.cache_ttl_seconds,
            app_enable_content_quality_scan: ctx.app_enable_content_quality_scan,
            app_content_quality_mode:        ctx.app_content_quality_mode,
            app_content_quality_threshold:   ctx.app_content_quality_threshold,
        },
        ctx.is_streaming,
    ).await
}

// ── Build a ForwardArgs from DispatchCtx + per-arm overrides ──────────────────

fn build_forward_args<'a>(
    ctx: &'a DispatchCtx<'_>,
    flagged: bool,
    detector: Option<&'a str>,
    confidence: Option<f32>,
    threat_title: Option<&'a str>,
    excerpt: Option<&'a str>,
    action: Option<String>,
    threat_framework_id: Option<&'a str>,
    classifier_id: Option<&'a str>,
    classifier_name: Option<&'a str>,
    pipeline_trace: Option<String>,
    final_decision: Option<String>,
    blocked_stage: Option<String>,
    classification_reason: Option<&'a str>,
    t2_flagged: bool,
    t2_confidence: Option<f32>,
    t2_reason: Option<String>,
    req_body: Value,
    input_redaction_summary: Option<String>,
    raw_body: Option<(Bytes, Option<String>)>,
) -> ForwardArgs<'a> {
    ForwardArgs {
        client:                  ctx.client,
        log_writer:              ctx.log_writer,
        request_id:              ctx.request_id,
        app_id:                  ctx.app_id,
        api_key_prefix:          ctx.api_key_prefix,
        app_name:                ctx.app_name,
        model:                   ctx.model,
        method:                  ctx.method,
        path:                    ctx.path,
        source_ip:               ctx.source_ip,
        user_prompt:             ctx.user_prompt,
        req_body,
        providers:               ctx.provider_chain,
        start_time:              ctx.start_time,
        flagged,
        detector,
        confidence,
        threat_title,
        excerpt,
        action,
        threat_framework_id,
        classifier_id,
        classifier_name,
        policy_store:            ctx.policy_store,
        is_anthropic:            ctx.is_anthropic,
        pipeline_trace,
        final_decision,
        blocked_stage,
        classification_reason,
        t2_flagged,
        t2_confidence,
        t2_reason,
        provider_meter:          ctx.provider_meter,
        input_redaction_summary,
        raw_body,
        path_override:           ctx.upstream_path_override,
        client_headers:          ctx.headers,
        user_agent:              ctx.user_agent,
        raw_input_payload:       ctx.raw_input_payload,
        cache_store:             ctx.cache_store,
        cache_request_hash:      ctx.cache_request_hash,
        prompt_text:             ctx.prompt_text,
        multi_turn_cache_params: ctx.multi_turn_cache_params.clone(),
        cache_ttl_seconds:       ctx.cache_ttl_seconds,
        app_enable_content_quality_scan: ctx.app_enable_content_quality_scan,
        app_content_quality_mode:        ctx.app_content_quality_mode,
        app_content_quality_threshold:   ctx.app_content_quality_threshold,
    }
}

pub(crate) async fn dispatch_enforcement(
    ctx: &DispatchCtx<'_>,
    scan_summary: &ScanSummary,
    pipeline_trace_json: Option<String>,
    classification_reason: Option<String>,
    t2_flagged: bool,
    t2_confidence: Option<f32>,
    t2_reason: Option<String>,
    threat_framework_id: Option<String>,
    classifier_prov_id: Option<String>,
    classifier_prov_name: Option<String>,
    app_mode: &str,
    req_json: Value,
    is_multipart: bool,
) -> Result<Response, AppError> {
    let t2_flagged_val = t2_flagged;
    let t2_confidence_ref = t2_confidence;
    let t2_reason_clone = t2_reason.clone();
    let classification_reason_ref = classification_reason.as_deref();
    let classifier_prov_id_ref = classifier_prov_id.as_deref();
    let classifier_prov_name_ref = classifier_prov_name.as_deref();
    let threat_framework_id_ref = threat_framework_id.as_deref();
    let user_prompt_redacted = ctx.user_prompt.clone();

    match evaluate(scan_summary, app_mode) {
        Some(EnforcementAction::Monitor { detector, confidence, reason, excerpt }) => {
            tracing::warn!(
                "[monitor]  {} THREAT_DETECTED app=\"{}\" detector=\"{}\" — forwarding (monitor mode)",
                ctx.request_id, ctx.app_name, detector
            );
            let fa = build_forward_args(
                ctx, true,
                Some(&detector), confidence, reason.as_deref(), excerpt.as_deref(),
                Some("monitored".to_string()),
                threat_framework_id_ref, classifier_prov_id_ref, classifier_prov_name_ref,
                pipeline_trace_json, Some(scan_summary.final_decision.clone()), scan_summary.blocked_stage.clone(),
                classification_reason_ref,
                t2_flagged_val, t2_confidence_ref, t2_reason_clone,
                req_json, None, ctx.raw_forward_body.clone(),
            );
            forward_or_stream(fa, ctx.is_streaming).await
        }
        Some(EnforcementAction::Block { detector, confidence, reason, excerpt }) => {
            let elapsed = ctx.start_time.elapsed().as_millis();
            let metric_label = if app_mode == "soft" { "200" } else { "403" };
            let action_label = if app_mode == "soft" { "soft" } else { "block" };
            if let Some(m) = crate::tools::telemetry::METRICS.get() {
                m.requests_total.with_label_values(&[ctx.path, ctx.app_id, metric_label, action_label]).inc();
                m.request_duration_ms.with_label_values(&[ctx.path, ctx.app_id]).observe(elapsed as f64);
            }
            let threat_msg = reason.as_deref().unwrap_or("Blocked by firewall policy");
            let hit_framework_id = scan_summary.hit
                .as_ref()
                .and_then(|h| {
                    if let crate::pipeline_types::LayerResult::Hit { framework_id, .. } = h {
                        Some(framework_id.clone())
                    } else {
                        None
                    }
                });
            let log_user_prompt = crate::agents::redaction::redact_option(&user_prompt_redacted, ctx.policy_store);

            if app_mode == "soft" {
                tracing::warn!(
                    "[soft]     {} SOFT_BLOCKED app=\"{}\" detector=\"{}\" framework_id=\"{}\" confidence={} elapsed={}ms",
                    ctx.request_id, ctx.app_name, detector,
                    hit_framework_id.as_deref().unwrap_or("n/a"),
                    confidence.map(|c| format!("{:.2}", c)).as_deref().unwrap_or("n/a"),
                    elapsed
                );

                let refusal = crate::agents::refusal::generate_refusal(
                    ctx.client,
                    ctx.policy_store,
                    ctx.request_id,
                    reason.as_deref(),
                    ctx.user_prompt.as_deref().unwrap_or(""),
                    ctx.log_writer,
                ).await;

                let threat_knowledge_matches_json = if !scan_summary.semantic_matches.is_empty() {
                    serde_json::to_string(&scan_summary.semantic_matches).ok()
                } else {
                    None
                };

                ctx.log_writer.log_entry(LogEntry {
                    request_id: ctx.request_id.to_string(),
                    app_id: ctx.app_id.to_string(),
                    app_name: ctx.app_name.to_string(),
                    model: ctx.model.to_string(),
                    method: ctx.method.to_string(),
                    path: ctx.path.to_string(),
                    source_ip: ctx.source_ip.to_string(),
                    app_api_key: ctx.api_key_prefix.to_string(),
                    duration_ms: elapsed as i64,
                    status_code: 200,
                    flagged: true,
                    detector: Some(detector.clone()),
                    confidence,
                    action: Some("soft_declined".to_string()),
                    threat_title: Some(threat_msg.to_string()),
                    excerpt: excerpt.map(|s| s.to_string()),
                    framework_id: threat_framework_id_ref.map(|s| s.to_string()),
                    user_prompt: log_user_prompt,
                    response_body: Some(refusal.clone()),
                    classifier_provider_id: classifier_prov_id_ref.map(|s| s.to_string()),
                    classifier_provider_name: classifier_prov_name_ref.map(|s| s.to_string()),
                    threat_knowledge_matches: threat_knowledge_matches_json,
                    semantic_threshold: Some(scan_summary.emb_threshold),
                    false_positive_candidate: scan_summary.false_positive_candidates,
                    pipeline_trace: pipeline_trace_json,
                    final_decision: Some("soft_declined".to_string()),
                    blocked_stage: scan_summary.blocked_stage.clone(),
                    classification_reason: classification_reason_ref.map(|s| s.to_string()),
                    t2_flagged: t2_flagged_val,
                    t2_confidence: t2_confidence_ref,
                    t2_reason: t2_reason_clone,
                    user_agent: ctx.user_agent.map(|s| s.to_string()),
                    raw_input_payload: ctx.raw_input_payload.map(|s| s.to_string()),
                    raw_output_payload: Some(refusal.clone()),
                    ..Default::default()
                });

                return Ok(crate::request_handler::helpers::build_soft_decline_response(
                    &refusal, ctx.model, ctx.request_id, ctx.is_anthropic,
                ));
            }

            tracing::warn!(
                "[guard]    {} BLOCKED app=\"{}\" detector=\"{}\" framework_id=\"{}\" confidence={} elapsed={}ms",
                ctx.request_id, ctx.app_name, detector,
                hit_framework_id.as_deref().unwrap_or("n/a"),
                confidence.map(|c| format!("{:.2}", c)).as_deref().unwrap_or("n/a"),
                elapsed
            );

            let threat_knowledge_matches_json = if !scan_summary.semantic_matches.is_empty() {
                serde_json::to_string(&scan_summary.semantic_matches).ok()
            } else {
                None
            };

            ctx.log_writer.log_entry(LogEntry {
                request_id: ctx.request_id.to_string(),
                app_id: ctx.app_id.to_string(),
                app_name: ctx.app_name.to_string(),
                model: ctx.model.to_string(),
                method: ctx.method.to_string(),
                path: ctx.path.to_string(),
                source_ip: ctx.source_ip.to_string(),
                app_api_key: ctx.api_key_prefix.to_string(),
                duration_ms: elapsed as i64,
                status_code: 403,
                flagged: true,
                detector: Some(detector.clone()),
                confidence,
                action: Some("blocked".to_string()),
                threat_title: Some(threat_msg.to_string()),
                excerpt: excerpt.map(|s| s.to_string()),
                framework_id: threat_framework_id_ref.map(|s| s.to_string()),
                user_prompt: log_user_prompt,
                classifier_provider_id: classifier_prov_id_ref.map(|s| s.to_string()),
                classifier_provider_name: classifier_prov_name_ref.map(|s| s.to_string()),
                threat_knowledge_matches: threat_knowledge_matches_json,
                semantic_threshold: Some(scan_summary.emb_threshold),
                false_positive_candidate: scan_summary.false_positive_candidates,
                pipeline_trace: pipeline_trace_json,
                final_decision: Some("block".to_string()),
                blocked_stage: scan_summary.blocked_stage.clone(),
                classification_reason: classification_reason_ref.map(|s| s.to_string()),
                t2_flagged: t2_flagged_val,
                t2_confidence: t2_confidence_ref,
                t2_reason: t2_reason_clone,
                user_agent: ctx.user_agent.map(|s| s.to_string()),
                raw_input_payload: ctx.raw_input_payload.map(|s| s.to_string()),
                ..Default::default()
            });

            Ok(crate::request_handler::helpers::build_firewall_error(
                threat_msg, ctx.request_id, ctx.is_anthropic, StatusCode::FORBIDDEN,
            ))
        }
        Some(EnforcementAction::Flag { detector, confidence, reason, excerpt }) => {
            tracing::warn!(
                "[guard]    {} FLAGGED app=\"{}\" detector=\"{}\" — forwarding (policy=flag)",
                ctx.request_id, ctx.app_name, detector
            );
            let fa = build_forward_args(
                ctx, true,
                Some(&detector), confidence, reason.as_deref(), excerpt.as_deref(),
                Some("flagged".to_string()),
                threat_framework_id_ref, classifier_prov_id_ref, classifier_prov_name_ref,
                pipeline_trace_json, Some(scan_summary.final_decision.clone()), scan_summary.blocked_stage.clone(),
                classification_reason_ref,
                t2_flagged_val, t2_confidence_ref, t2_reason_clone,
                req_json, None, ctx.raw_forward_body.clone(),
            );
            forward_or_stream(fa, ctx.is_streaming).await
        }
        Some(EnforcementAction::Redact { detector, placeholder, confidence, reason }) => {
            if is_multipart {
                let elapsed = ctx.start_time.elapsed().as_millis() as i64;
                tracing::warn!("[redact] {} MULTIPART_REDACT_UNSUPPORTED app=\"{}\" detector=\"{}\"",
                    ctx.request_id, ctx.app_name, detector);
                let log_user_prompt = crate::agents::redaction::redact_option(&user_prompt_redacted, ctx.policy_store);
                ctx.log_writer.log_entry(LogEntry {
                    request_id: ctx.request_id.to_string(),
                    app_id: ctx.app_id.to_string(),
                    app_name: ctx.app_name.to_string(),
                    model: ctx.model.to_string(),
                    method: ctx.method.to_string(),
                    path: ctx.path.to_string(),
                    source_ip: ctx.source_ip.to_string(),
                    app_api_key: ctx.api_key_prefix.to_string(),
                    duration_ms: elapsed,
                    status_code: 400,
                    flagged: true,
                    detector: Some(detector.clone()),
                    confidence,
                    action: Some("blocked".to_string()),
                    threat_title: Some("Multipart request blocked: PII detected in extracted content; multipart data cannot be redacted in-stream".to_string()),
                    framework_id: threat_framework_id_ref.map(|s| s.to_string()),
                    user_prompt: log_user_prompt,
                    classifier_provider_id: classifier_prov_id_ref.map(|s| s.to_string()),
                    classifier_provider_name: classifier_prov_name_ref.map(|s| s.to_string()),
                    pipeline_trace: pipeline_trace_json.clone(),
                    final_decision: Some("block".to_string()),
                    classification_reason: classification_reason_ref.map(|s| s.to_string()),
                    t2_flagged: t2_flagged_val,
                    t2_confidence: t2_confidence_ref,
                    t2_reason: t2_reason_clone,
                    user_agent: ctx.user_agent.map(|s| s.to_string()),
                    raw_input_payload: ctx.raw_input_payload.map(|s| s.to_string()),
                    ..Default::default()
                });
                return Ok(crate::request_handler::helpers::build_firewall_error(
                    "Request blocked: multipart data cannot be redacted. The extracted content matched a PII redaction detector.",
                    ctx.request_id, ctx.is_anthropic, StatusCode::BAD_REQUEST,
                ));
            }
            let mut redacted_req = req_json.clone();
            let all_detectors = {
                let detectors_guard = ctx.policy_store.detectors.read().unwrap_or_else(|e| e.into_inner());
                detectors_guard.clone()
            };
            let app_detector_ids = ctx.policy_store.app_detector_ids.read().unwrap_or_else(|e| e.into_inner()).get(ctx.app_id).cloned();
            let matched: Vec<crate::policy::DetectorConfig> = match app_detector_ids {
                None => all_detectors.into_iter()
                    .filter(|d| d.mode == "redact" && (d.scanning_scope == "input" || d.scanning_scope == "both"))
                    .collect(),
                Some(ids) => all_detectors.into_iter()
                    .filter(|d| d.mode == "redact" && ids.contains(&d.id) && (d.scanning_scope == "input" || d.scanning_scope == "both"))
                    .collect(),
            };
            let redaction_summary: Option<String> = if !matched.is_empty() {
                let (n, summary) = crate::agents::redaction::redact_request_with_summary(&mut redacted_req, &matched);
                if n > 0 {
                    tracing::info!(
                        "[redact]   {} INPUT_REDACTED app=\"{}\" detector=\"{}\" placeholder=\"{}\" fields_modified={}",
                        ctx.request_id, ctx.app_name, detector, placeholder, n
                    );
                }
                summary
            } else {
                None
            };
            let elapsed = ctx.start_time.elapsed().as_millis();
            if let Some(m) = crate::tools::telemetry::METRICS.get() {
                m.requests_total.with_label_values(&[ctx.path, ctx.app_id, "200", "redacted"]).inc();
                m.request_duration_ms.with_label_values(&[ctx.path, ctx.app_id]).observe(elapsed as f64);
                m.decisions_total.with_label_values(&["enforcement", "redact"]).inc();
            }
            let fa = build_forward_args(
                ctx, true,
                Some(&detector), confidence, reason.as_deref(), None::<&str>,
                Some("redacted".to_string()),
                threat_framework_id_ref, classifier_prov_id_ref, classifier_prov_name_ref,
                pipeline_trace_json, Some(scan_summary.final_decision.clone()), scan_summary.blocked_stage.clone(),
                classification_reason_ref,
                t2_flagged_val, t2_confidence_ref, t2_reason_clone,
                redacted_req, redaction_summary, None,
            );
            forward_or_stream(fa, ctx.is_streaming).await
        }
        None => {
            let fa = build_forward_args(
                ctx, false,
                None, None, None, None,
                Some("forwarded".to_string()),
                None, classifier_prov_id_ref, classifier_prov_name_ref,
                pipeline_trace_json, Some(scan_summary.final_decision.clone()), scan_summary.blocked_stage.clone(),
                classification_reason_ref,
                t2_flagged_val, t2_confidence_ref, t2_reason_clone,
                req_json, None, ctx.raw_forward_body.clone(),
            );
            forward_or_stream(fa, ctx.is_streaming).await
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use axum::extract::Json;
    use axum::response::IntoResponse;
    use axum::routing::post;
    use axum::{serve, Router};
    use chrono::Utc;
    use reqwest::Client;
    use sqlx::postgres::PgPoolOptions;
    use std::collections::HashMap;
    use std::sync::{Arc, Once, RwLock};
    use std::time::Instant;
    use tokio::net::TcpListener;

    static SET_ENV: Once = Once::new();

    fn ensure_env() {
        SET_ENV.call_once(|| {
            // set_var is unsafe in recent Rust editions; safe here in single-threaded test init
            unsafe {
                std::env::set_var("LOG_PG_HOST", "localhost");
                std::env::set_var("LOG_PG_USER", "test");
                std::env::set_var("LOG_PG_PASSWORD", "test");
                std::env::set_var("LOG_PG_DB", "test");
                std::env::set_var("GATEWAY_INSTANCE_ID", "test-instance");
            }
        });
    }

    fn make_detector_store(pool: Arc<sqlx::PgPool>) -> DetectorStore {
        DetectorStore {
            detectors:                Arc::new(RwLock::new(Vec::new())),
            classifier_provider:      Arc::new(RwLock::new(None)),
            classifier_threshold:     Arc::new(RwLock::new(0.65)),
            classifier_system_prompt: Arc::new(RwLock::new(String::new())),
            providers_by_id:          Arc::new(RwLock::new(HashMap::new())),
            api_key_cache:            Arc::new(RwLock::new(HashMap::new())),
            admin_key_cache:          Arc::new(RwLock::new(Vec::new())),
            gateway_key_cache:        Arc::new(RwLock::new(Vec::new())),
            acl_mode:                 Arc::new(RwLock::new("allow_all".to_string())),
            acl_entries:              Arc::new(RwLock::new(Vec::new())),
            default_firewall_mode:    Arc::new(RwLock::new("allow_all".to_string())),
            app_detector_ids:          Arc::new(RwLock::new(HashMap::new())),
            app_threat_knowledge_ids: Arc::new(RwLock::new(HashMap::new())),
            embedding_providers:      Arc::new(RwLock::new(Vec::new())),
            embedding_threshold:      Arc::new(RwLock::new(0.75)),
            db_pool:                  pool,
            blocked_tools:            Arc::new(RwLock::new(HashMap::new())),
            framework_store:          Arc::new(RwLock::new(None)),
            t2_system_prompt:         Arc::new(RwLock::new(String::new())),
            t2_threshold:             Arc::new(RwLock::new(0.0)),
            t2_max_output_tokens:     Arc::new(RwLock::new(0)),
            content_quality_provider_config: Arc::new(RwLock::new(Default::default())),
            content_quality_judge_provider:  Arc::new(RwLock::new(None)),
            content_quality_system_prompt:   Arc::new(RwLock::new(String::new())),
            content_quality_threshold:       Arc::new(RwLock::new(0.0)),
            content_quality_max_output_tokens: Arc::new(RwLock::new(0)),
            cache_loaded_at:          Arc::new(RwLock::new(Utc::now())),
            cache_reload_interval_secs: 900,
            detection_degraded:         Arc::new(RwLock::new(false)),
            response_cache_enabled:        Arc::new(tokio::sync::RwLock::new(false)),
            response_cache_exact_enabled:  Arc::new(tokio::sync::RwLock::new(true)),
            response_cache_semantic_enabled: Arc::new(tokio::sync::RwLock::new(false)),
            response_cache_threshold:      Arc::new(tokio::sync::RwLock::new(0.97)),
        }
    }

    async fn test_chat_handler(Json(_body): Json<serde_json::Value>) -> impl IntoResponse {
        Json(serde_json::json!({
            "id": "test-completion",
            "object": "chat.completion",
            "choices": [{
                "index": 0,
                "message": { "role": "assistant", "content": "Test response" },
                "finish_reason": "stop"
            }],
            "usage": { "prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8 }
        }))
    }

    async fn start_test_server() -> u16 {
        let app = Router::new().route("/chat/completions", post(test_chat_handler));
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            serve(listener, app).await.unwrap();
        });
        port
    }

    fn make_test_provider(port: u16) -> Vec<ProviderConfig> {
        vec![ProviderConfig::without_meter(
            "test-provider".into(),
            "Test Provider".into(),
            format!("http://127.0.0.1:{}", port),
            Some("gpt-4".into()),
            None,
            5000,
            "openai_compatible".into(),
            None,
            None,
        )]
    }

    fn minimal_ctx<'a>(
        client: &'a Client,
        log_writer: &'a LogWriter,
        policy_store: &'a DetectorStore,
        providers: &'a [ProviderConfig],
        headers: &'a HeaderMap,
    ) -> DispatchCtx<'a> {
        DispatchCtx {
            client,
            log_writer,
            policy_store,
            provider_meter: None,
            request_id: "r",
            app_id: "a",
            api_key_prefix: "ak",
            app_name: "n",
            model: "m",
            method: "POST",
            path: "/",
            source_ip: "1.2.3.4",
            user_prompt: &None,
            provider_chain: providers,
            start_time: Instant::now(),
            is_streaming: false,
            is_anthropic: false,
            raw_forward_body: None,
            headers,
            user_agent: None,
            raw_input_payload: None,
            upstream_path_override: None,
            cache_store: None,
            cache_request_hash: None,
            prompt_text: "",
            multi_turn_cache_params: None,
            cache_ttl_seconds: None,
            app_enable_content_quality_scan: false,
            app_content_quality_mode: None,
            app_content_quality_threshold: None,
        }
    }

    // ── build_forward_args: identity mapping ─────────────────────

    #[tokio::test]
    async fn identity_mapping_carries_all_ctx_fields() {
        ensure_env();
        let client = Client::new();
        let log_writer = LogWriter::from_env();
        let pool = Arc::new(PgPoolOptions::new()
            .connect_lazy("postgres://test:test@localhost:5432/test")
            .expect("pool"));
        let policy_store = make_detector_store(pool);
        let user_prompt = Some("hello".to_string());
        let headers = HeaderMap::new();
        let providers = Vec::new();
        let ctx = DispatchCtx {
            client: &client, log_writer: &log_writer, policy_store: &policy_store,
            provider_meter: None, request_id: "req-1", app_id: "app-1",
            api_key_prefix: "ak_abc", app_name: "MyApp", model: "gpt-4",
            method: "POST", path: "/v1/chat/completions", source_ip: "10.0.0.1",
            user_prompt: &user_prompt, provider_chain: &providers,
            start_time: Instant::now(), is_streaming: false, is_anthropic: false,
            raw_forward_body: None, headers: &headers,
            user_agent: Some("agent"), raw_input_payload: Some("payload"),
            upstream_path_override: None,
            cache_store: None,
            cache_request_hash: None,
            prompt_text: "",
            multi_turn_cache_params: None,
            cache_ttl_seconds: None,
            app_enable_content_quality_scan: false,
            app_content_quality_mode: None,
            app_content_quality_threshold: None,
        };
        let args = build_forward_args(
            &ctx, false, None, None, None, None, None, None, None, None,
            None, None, None, None, false, None, None, serde_json::json!({}),
            None, None,
        );
        assert!(std::ptr::eq(args.client, ctx.client));
        assert!(std::ptr::eq(args.log_writer, ctx.log_writer));
        assert_eq!(args.request_id, "req-1");
        assert_eq!(args.app_id, "app-1");
        assert_eq!(args.api_key_prefix, "ak_abc");
        assert_eq!(args.app_name, "MyApp");
        assert_eq!(args.model, "gpt-4");
        assert_eq!(args.method, "POST");
        assert_eq!(args.path, "/v1/chat/completions");
        assert_eq!(args.source_ip, "10.0.0.1");
        assert!(std::ptr::eq(args.user_prompt, ctx.user_prompt));
        assert!(std::ptr::eq(args.providers, ctx.provider_chain));
        assert_eq!(args.start_time, ctx.start_time);
        assert!(std::ptr::eq(args.policy_store, ctx.policy_store));
        assert!(std::ptr::eq(args.client_headers, ctx.headers));
        assert!(!args.is_anthropic);
        assert!(args.provider_meter.is_none());
        assert!(args.path_override.is_none());
        assert_eq!(args.user_agent, Some("agent"));
        assert_eq!(args.raw_input_payload, Some("payload"));
    }

    // ── build_forward_args: override fields ──────────────────────

    #[tokio::test]
    async fn override_fields_appear_in_forward_args() {
        ensure_env();
        let client = Client::new();
        let log_writer = LogWriter::from_env();
        let pool = Arc::new(PgPoolOptions::new()
            .connect_lazy("postgres://test:test@localhost:5432/test").unwrap());
        let policy_store = make_detector_store(pool);
        let headers = HeaderMap::new();
        let ctx = minimal_ctx(&client, &log_writer, &policy_store, &[], &headers);
        let args = build_forward_args(
            &ctx, true, Some("det-x"), Some(0.95), Some("threat"), Some("excerpt"),
            Some("blocked".to_string()), Some("fw-1"), Some("cl-1"), Some("cl-name"),
            Some(r#"{"a":1}"#.to_string()), Some("block".to_string()),
            Some("stage1".to_string()), Some("reason"), true, Some(0.8),
            Some("t2-reason".to_string()), serde_json::json!({"msg":"hi"}),
            Some("redacted".to_string()),
            Some((Bytes::from("body"), Some("raw".to_string()))),
        );
        assert!(args.flagged);
        assert_eq!(args.detector, Some("det-x"));
        assert_eq!(args.confidence, Some(0.95));
        assert_eq!(args.threat_title, Some("threat"));
        assert_eq!(args.excerpt, Some("excerpt"));
        assert_eq!(args.action, Some("blocked".to_string()));
        assert_eq!(args.threat_framework_id, Some("fw-1"));
        assert_eq!(args.classifier_id, Some("cl-1"));
        assert_eq!(args.classifier_name, Some("cl-name"));
        assert_eq!(args.pipeline_trace, Some(r#"{"a":1}"#.to_string()));
        assert_eq!(args.final_decision, Some("block".to_string()));
        assert_eq!(args.blocked_stage, Some("stage1".to_string()));
        assert_eq!(args.classification_reason, Some("reason"));
        assert!(args.t2_flagged);
        assert_eq!(args.t2_confidence, Some(0.8));
        assert_eq!(args.t2_reason, Some("t2-reason".to_string()));
        assert_eq!(args.req_body, serde_json::json!({"msg":"hi"}));
        assert_eq!(args.input_redaction_summary, Some("redacted".to_string()));
        assert!(args.raw_body.is_some());
        assert_eq!(args.raw_body.as_ref().unwrap().0, Bytes::from("body"));
    }

    // ── build_forward_args: defaults ─────────────────────────────

    #[tokio::test]
    async fn override_defaults_are_none_false() {
        ensure_env();
        let client = Client::new();
        let log_writer = LogWriter::from_env();
        let pool = Arc::new(PgPoolOptions::new()
            .connect_lazy("postgres://test:test@localhost:5432/test").unwrap());
        let policy_store = make_detector_store(pool);
        let headers = HeaderMap::new();
        let ctx = minimal_ctx(&client, &log_writer, &policy_store, &[], &headers);
        let args = build_forward_args(
            &ctx, false, None, None, None, None, None, None, None, None,
            None, None, None, None, false, None, None, serde_json::json!({}),
            None, None,
        );
        assert!(!args.flagged);
        assert!(args.detector.is_none());
        assert!(args.confidence.is_none());
        assert!(args.threat_title.is_none());
        assert!(args.excerpt.is_none());
        assert!(args.threat_framework_id.is_none());
        assert!(args.classifier_id.is_none());
        assert!(args.classifier_name.is_none());
        assert!(args.pipeline_trace.is_none());
        assert!(args.final_decision.is_none());
        assert!(args.blocked_stage.is_none());
        assert!(args.classification_reason.is_none());
        assert!(!args.t2_flagged);
        assert!(args.t2_confidence.is_none());
        assert!(args.t2_reason.is_none());
        assert!(args.input_redaction_summary.is_none());
        assert!(args.raw_body.is_none());
    }

    // ── build_forward_args: is_anthropic ─────────────────────────

    #[tokio::test]
    async fn is_anthropic_carried_through() {
        ensure_env();
        let client = Client::new();
        let log_writer = LogWriter::from_env();
        let pool = Arc::new(PgPoolOptions::new()
            .connect_lazy("postgres://test:test@localhost:5432/test").unwrap());
        let policy_store = make_detector_store(pool);
        let headers = HeaderMap::new();
        let mut ctx = minimal_ctx(&client, &log_writer, &policy_store, &[], &headers);
        ctx.is_anthropic = true;
        let args = build_forward_args(
            &ctx, false, None, None, None, None, None, None, None, None,
            None, None, None, None, false, None, None, serde_json::json!({}),
            None, None,
        );
        assert!(args.is_anthropic);
    }

    // ── build_forward_args: upstream_path_override ───────────────

    #[tokio::test]
    async fn upstream_path_override_carried_through() {
        ensure_env();
        let client = Client::new();
        let log_writer = LogWriter::from_env();
        let pool = Arc::new(PgPoolOptions::new()
            .connect_lazy("postgres://test:test@localhost:5432/test").unwrap());
        let policy_store = make_detector_store(pool);
        let headers = HeaderMap::new();
        let mut ctx = minimal_ctx(&client, &log_writer, &policy_store, &[], &headers);
        ctx.upstream_path_override = Some("/v1/responses");
        let args = build_forward_args(
            &ctx, false, None, None, None, None, None, None, None, None,
            None, None, None, None, false, None, None, serde_json::json!({}),
            None, None,
        );
        assert_eq!(args.path_override, Some("/v1/responses"));
    }

    // ── build_forward_args: user_agent and raw_input_payload ─────

    #[tokio::test]
    async fn user_agent_and_raw_input_payload_carried_through() {
        ensure_env();
        let client = Client::new();
        let log_writer = LogWriter::from_env();
        let pool = Arc::new(PgPoolOptions::new()
            .connect_lazy("postgres://test:test@localhost:5432/test").unwrap());
        let policy_store = make_detector_store(pool);
        let headers = HeaderMap::new();
        let mut ctx = minimal_ctx(&client, &log_writer, &policy_store, &[], &headers);
        ctx.user_agent = Some("curl/8.0");
        ctx.raw_input_payload = Some("raw-input");
        let args = build_forward_args(
            &ctx, false, None, None, None, None, None, None, None, None,
            None, None, None, None, false, None, None, serde_json::json!({}),
            None, None,
        );
        assert_eq!(args.user_agent, Some("curl/8.0"));
        assert_eq!(args.raw_input_payload, Some("raw-input"));
    }

    // ── handle_bypass ────────────────────────────────────────────

    #[tokio::test]
    async fn bypass_does_not_panic() {
        ensure_env();
        let client = Client::new();
        let log_writer = LogWriter::from_env();
        let pool = Arc::new(PgPoolOptions::new()
            .connect_lazy("postgres://test:test@localhost:5432/test").unwrap());
        let policy_store = make_detector_store(pool);
        let headers = HeaderMap::new();
        let ctx = minimal_ctx(&client, &log_writer, &policy_store, &[], &headers);
        let result = handle_bypass(&ctx, serde_json::json!({})).await;
        assert!(result.is_ok() || result.is_err());
    }

    // ── dispatch_enforcement: status code contracts ──────────────

    fn hit_summary(mode: &str, final_decision: &str) -> ScanSummary {
        ScanSummary {
            hit: Some(crate::pipeline_types::LayerResult::Hit {
                detector: "test-det".to_string(),
                mode: mode.to_string(),
                confidence: Some(0.95),
                reason: Some("injection attempt".to_string()),
                excerpt: Some("ignore previous instructions".to_string()),
                framework_id: "owasp-2025-llm01".to_string(),
                placeholder: None,
            }),
            semantic_matches: Vec::new(),
            emb_threshold: 0.85,
            classifier_result: None,
            false_positive_candidates: false,
            trace_stages: Vec::new(),
            final_decision: final_decision.to_string(),
            blocked_stage: None,
            t2_result: None,
            cache_hit: false,
            cache_tier: None,
            cache_provider_id: None,
            cache_tokens_in: None,
            cache_tokens_out: None,
            cache_response_bytes: None,
            cache_response_headers: None,
        }
    }

    fn safe_summary() -> ScanSummary {
        ScanSummary {
            hit: None,
            semantic_matches: Vec::new(),
            emb_threshold: 0.85,
            classifier_result: None,
            false_positive_candidates: false,
            trace_stages: Vec::new(),
            final_decision: "allow".to_string(),
            blocked_stage: None,
            t2_result: None,
            cache_hit: false,
            cache_tier: None,
            cache_provider_id: None,
            cache_tokens_in: None,
            cache_tokens_out: None,
            cache_response_bytes: None,
            cache_response_headers: None,
        }
    }

    #[tokio::test]
    async fn safe_scan_no_hit_returns_200() {
        ensure_env();
        let port = start_test_server().await;
        let client = Client::new();
        let log_writer = LogWriter::from_env();
        let pool = Arc::new(PgPoolOptions::new()
            .connect_lazy("postgres://test:test@localhost:5432/test").unwrap());
        let policy_store = make_detector_store(pool);
        let headers = HeaderMap::new();
        let providers = make_test_provider(port);
        let ctx = minimal_ctx(&client, &log_writer, &policy_store, &providers, &headers);
        let summary = safe_summary();
        let result = dispatch_enforcement(
            &ctx, &summary, None, None, false, None, None,
            None, None, None, "guard", serde_json::json!({"messages":[{"role":"user","content":"hi"}]}), false,
        ).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn monitor_mode_hit_returns_200() {
        ensure_env();
        let port = start_test_server().await;
        let client = Client::new();
        let log_writer = LogWriter::from_env();
        let pool = Arc::new(PgPoolOptions::new()
            .connect_lazy("postgres://test:test@localhost:5432/test").unwrap());
        let policy_store = make_detector_store(pool);
        let headers = HeaderMap::new();
        let providers = make_test_provider(port);
        let ctx = minimal_ctx(&client, &log_writer, &policy_store, &providers, &headers);
        let summary = hit_summary("block", "block");
        let result = dispatch_enforcement(
            &ctx, &summary, None, None, false, None, None,
            None, None, None, "monitor", serde_json::json!({"messages":[{"role":"user","content":"hi"}]}), false,
        ).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn block_guard_hit_returns_403() {
        ensure_env();
        let client = Client::new();
        let log_writer = LogWriter::from_env();
        let pool = Arc::new(PgPoolOptions::new()
            .connect_lazy("postgres://test:test@localhost:5432/test").unwrap());
        let policy_store = make_detector_store(pool);
        let headers = HeaderMap::new();
        let ctx = minimal_ctx(&client, &log_writer, &policy_store, &[], &headers);
        let summary = hit_summary("block", "block");
        let result = dispatch_enforcement(
            &ctx, &summary, None, None, false, None, None,
            None, None, None, "guard", serde_json::json!({}), false,
        ).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().status(), StatusCode::FORBIDDEN);
    }
}
