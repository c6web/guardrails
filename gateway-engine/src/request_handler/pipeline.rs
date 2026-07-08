//! Shared security pipeline — consolidates duplicated post-`prepare()` logic
//! from `handler.rs` and `responses_handler.rs`.

use axum::{
    body::Bytes,
    http::StatusCode,
    response::Response,
};
use serde_json::Value;
use std::time::Instant;

use crate::tools::token_estimator::estimate_token_count;
use crate::tools::json_response::json_response;
use crate::agents::scanning::output_scanner;
use crate::policy::DetectorConfig;
use crate::pipeline_types::{AppError, LayerResult};
use crate::tools::log_writer::{LogEntry, ToolAuditEntry};
use crate::request_handler::enforcement::{DispatchCtx, dispatch_enforcement, handle_bypass};
use crate::request_handler::helpers::{build_firewall_error, trace_json};
use crate::request_handler::preamble::Prepared;

/// Run the post-`prepare()` security pipeline — token limit, tool guard,
/// classifier lookup, T1 scan, T2 analysis, knowledge developer, enforcement.
pub(crate) async fn run_security_pipeline(
    state: &crate::GatewayState,
    prep: Prepared,
    prompt_text: String,
    user_prompt: Option<String>,
    body_for_dispatch: Value,
    upstream_path_override: Option<&'static str>,
    is_anthropic: bool,
    is_multipart: bool,
    log_prefix: &str,
    // When Some, overrides `prep.raw_forward_body` in the DispatchCtx
    // so the upstream receives chat-translated bytes while prepare()'s own
    // raw_forward_body (the original body) is used for payload-size logging.
    forward_body_override: Option<(Bytes, Option<String>)>,
) -> Result<Response, AppError> {
    let Prepared {
        body_bytes, req_json, auth, is_streaming,
        is_anthropic: _, is_multipart: _,
        request_id, method, path, source_ip, user_agent, headers,
        provider_chain, model,
        app_id, api_key_prefix, app_name, app_mode,
        app_enable_t2, app_enable_knowledge_dev, raw_forward_body,
        app_enable_content_quality_scan, app_content_quality_mode, app_content_quality_threshold, ..
    } = prep;

    let client         = &state.client;
    let log_writer     = &state.log_writer;
    let policy_store   = &state.policy_store;
    let provider_meter = &state.provider_meter;

    // Populate tracing span fields for structured-log correlation with log entries
    tracing::Span::current().record("request_id", request_id.as_str());
    tracing::Span::current().record("app_id", app_id.as_str());

    // Token limit check — reject if input exceeds app's max_tokens threshold
    if let Some(max_tokens) = auth.max_tokens {
        let approx_tokens = estimate_token_count(&prompt_text);
        if approx_tokens > (max_tokens as usize) {
            let log_user_prompt = crate::agents::redaction::redact_option(&user_prompt, policy_store);
            tracing::warn!("[token]   {} EXCEEDS_MAX_TOKENS app=\"{}\" tokens={} max={}", request_id, app_name, approx_tokens, max_tokens);
            log_writer.log_entry(LogEntry {
                request_id: request_id.clone(),
                app_id: app_id.clone(),
                app_name: app_name.clone(),
                model: model.clone(),
                method: method.clone(),
                path: path.clone(),
                source_ip: source_ip.clone(),
                app_api_key: api_key_prefix.clone(),
                tokens_in: approx_tokens as i32,
                status_code: 413,
                action: Some("blocked".to_string()),
                threat_title: Some(format!("Input exceeds maximum allowed tokens ({})", max_tokens)),
                user_prompt: log_user_prompt,
                raw_input_payload: Some(String::from_utf8_lossy(&body_bytes).to_string()),
                user_agent: user_agent.clone(),
                ..Default::default()
            });
            return Ok(build_firewall_error(
                &format!("Input exceeds maximum allowed tokens ({})", max_tokens),
                &request_id, is_anthropic, StatusCode::PAYLOAD_TOO_LARGE,
            ));
        }
    }

    // Tool guard check — block tools in the app's blocklist before forwarding.
    if app_mode != "bypass" {
        let has_tools = req_json.get("tools")
            .and_then(|v| v.as_array())
            .map(|a| !a.is_empty())
            .unwrap_or(false);
        if has_tools {
            let app_blocked = {
                let blocked = policy_store.blocked_tools.read().unwrap_or_else(|e| e.into_inner());
                blocked.get(&app_id).cloned().unwrap_or_default()
            };
            if !app_blocked.is_empty() {
                let parsed = match crate::content::parser::ParsedRequest::parse(&req_json) {
                    Ok(p) => p,
                    Err(e) => {
                        tracing::warn!("[tool_guard] {} parse error (continuing): {}", request_id, e);
                        drop(req_json);
                        return Ok(json_response(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            &format!(r#"{{"error":"Request parsing failed: {}"}}"#, e),
                        ));
                    }
                };

                let tool_guard = crate::tools::tool_guard::ToolGuard { blocked_tools: app_blocked };
                let result = tool_guard.check_request(&parsed);

                if !result.tool_names.is_empty() {
                    let log_user_prompt = crate::agents::redaction::redact_option(&user_prompt, policy_store);
                    match app_mode.as_str() {
                        "guard" | "block" if !result.allowed => {
                            tracing::warn!("[tool_guard] {} BLOCKED app=\"{}\" violations={:?}", request_id, app_name, result.violations);
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
                                detector: Some("tool-guard".to_string()),
                                action: Some("blocked".to_string()),
                                threat_title: Some(format!("Tool guard violation: {:?}", result.violations)),
                                user_prompt: log_user_prompt,
                                raw_input_payload: Some(String::from_utf8_lossy(&body_bytes).to_string()),
                                user_agent: user_agent.clone(),
                                ..Default::default()
                            });
                            return Ok(build_firewall_error(
                                &format!("Tool guard violation: {:?}", result.violations),
                                &request_id, is_anthropic, StatusCode::FORBIDDEN,
                            ));
                        }
                        "monitor" | "flag" if !result.violations.is_empty() => {
                            tracing::warn!("[tool_guard] {} FLAGGED app=\"{}\" tools={:?}", request_id, app_name, result.tool_names);
                            log_writer.log_entry(LogEntry {
                                request_id: request_id.clone(),
                                app_id: app_id.clone(),
                                app_name: app_name.clone(),
                                model: model.clone(),
                                method: method.clone(),
                                path: path.clone(),
                                source_ip: source_ip.clone(),
                                app_api_key: api_key_prefix.clone(),
                                status_code: 200,
                                detector: Some("tool-guard".to_string()),
                                threat_title: Some("flagged".to_string()),
                                excerpt: Some(format!("Blocked tool used: {} tools", result.violations.len())),
                                user_prompt: log_user_prompt,
                                raw_input_payload: Some(String::from_utf8_lossy(&body_bytes).to_string()),
                                user_agent: user_agent.clone(),
                                ..Default::default()
                            });
                        }
                        _ => {
                            if !result.violations.is_empty() {
                                tracing::warn!("[tool_guard] {} app=\"{}\" blocked-tools={:?} (mode={}, no enforcement)", request_id, app_name, result.violations, app_mode);
                            }
                        }
                    }

                    for tool_name in &result.tool_names {
                        let is_violation = result.violations.iter().any(|v| matches!(v, crate::content::parser::ToolViolation::BlockedTool(n) if n == tool_name));
                        log_writer.log_tool_audit(
                            ToolAuditEntry {
                                request_id: request_id.clone(),
                                app_id: app_id.clone(),
                                app_name: app_name.clone(),
                                tool_name: tool_name.clone(),
                                invocation_count: 1,
                                approved: false,
                                violation_flag: is_violation,
                            },
                        );
                    }
                }
            }
        }
    }

    // ── Compute request hash for cache lookup ──────────────────────────────
    // A request continuing a server-side-stored conversation (OpenAI Responses API's
    // `previous_response_id`) depends on prior-turn context the gateway never sees —
    // hashing only the new turn would let two different callers' continuations of
    // *different* stored conversations collide on an identical-looking follow-up
    // question. Excluded from caching entirely, same rationale as tool-calls/streaming.
    let has_previous_response_id = req_json.get("previous_response_id")
        .map(|v| !v.is_null())
        .unwrap_or(false);

    let (request_hash, enable_cache) = if auth.enable_response_cache && !has_previous_response_id {
        let messages = req_json.get("messages")
            .or_else(|| req_json.get("input"));
        match messages {
            Some(msgs) => {
                let temp = req_json.get("temperature").and_then(|v| v.as_f64());
                let max_tok = req_json.get("max_tokens").and_then(|v| v.as_i64()).map(|v| v as i32);
                let top_p = req_json.get("top_p").and_then(|v| v.as_f64());
                let stream = req_json.get("stream").and_then(|v| v.as_bool());
                let tools = req_json.get("tools");
                let response_format = req_json.get("response_format");
                let stop = req_json.get("stop");
                let seed = req_json.get("seed").and_then(|v| v.as_i64());
                let n = req_json.get("n").and_then(|v| v.as_i64());
                let frequency_penalty = req_json.get("frequency_penalty").and_then(|v| v.as_f64());
                let presence_penalty = req_json.get("presence_penalty").and_then(|v| v.as_f64());
                let logit_bias = req_json.get("logit_bias");
                let instructions = req_json.get("instructions").and_then(|v| v.as_str());
                let hash = crate::agents::cache::key::compute_request_hash(
                    &app_id, &model, msgs, temp, max_tok, top_p,
                    stream, tools, response_format, stop, seed, n,
                    frequency_penalty, presence_penalty, logit_bias, instructions,
                );
                (Some(hash), true)
            }
            None => (None, false),
        }
    } else {
        (None, false)
    };

    // ── Extract multi-turn cache params ─────────────────────────────────────
    // Only applies to chat completions with a `user` field.
    let multi_turn_params = if auth.multi_turn_semantic_enabled {
        let messages = req_json.get("messages").and_then(|v| v.as_array());
        let end_user_id = req_json.get("user").and_then(|v| v.as_str()).map(|s| s.to_string());

        match (messages, end_user_id) {
            (Some(msgs), Some(uid)) if !uid.is_empty() => {
                // Hash of all system messages concatenated
                let system_text: String = msgs.iter()
                    .filter(|m| m.get("role").and_then(|r| r.as_str()) == Some("system"))
                    .filter_map(|m| m.get("content").and_then(|c| c.as_str()))
                    .collect::<Vec<_>>()
                    .join("\n");
                let system_prompt_hash = if system_text.is_empty() {
                    String::new()
                } else {
                    crate::agents::cache::key::hash_string(&system_text)
                };

                // Latest user message content
                let latest_user_message = msgs.iter()
                    .rev()
                    .find(|m| m.get("role").and_then(|r| r.as_str()) == Some("user"))
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_str())
                    .unwrap_or("")
                    .to_string();

                let turn_index = msgs.len() as i32;

                Some(crate::pipeline_types::MultiTurnCacheParams {
                    enabled: true,
                    system_prompt_hash,
                    end_user_id: uid,
                    turn_index,
                    latest_user_message,
                })
            }
            (Some(_), _) => {
                // Has messages but no non-empty user field — increment skipped counter
                if let Some(m) = crate::tools::telemetry::METRICS.get() {
                    m.multi_turn_cache_skipped_no_user_id_total.inc();
                }
                None
            }
            _ => {
                // No messages array — not a chat conversation, skip silently
                None
            }
        }
    } else {
        None
    };

    // ── Start enforcement / forward dispatch ────────────────────────────────
    let start_time = Instant::now();

    tracing::info!("[{log_prefix}] {} {} {} ip={} app=\"{}\" mode={}", request_id, method, path, source_ip, app_name, app_mode);

    let (classifier_prov_id, classifier_prov_name) = {
        let cp = policy_store.classifier_provider.read().unwrap_or_else(|e| e.into_inner());
        (
            cp.as_ref().map(|p| p.id.clone()),
            cp.as_ref().map(|p| p.name.clone()),
        )
    };

    let raw_input = String::from_utf8_lossy(&body_bytes);

    let forward_body = forward_body_override.or(raw_forward_body);

    let ctx = DispatchCtx {
        client,
        log_writer,
        policy_store,
        provider_meter: Some(provider_meter),
        request_id: &request_id,
        app_id: &app_id,
        api_key_prefix: &api_key_prefix,
        app_name: &app_name,
        model: &model,
        method: &method,
        path: &path,
        source_ip: &source_ip,
        user_prompt: &user_prompt,
        provider_chain: &provider_chain,
        start_time,
        is_streaming,
        is_anthropic,
        raw_forward_body: forward_body,
        headers: &headers,
        user_agent: user_agent.as_deref(),
        raw_input_payload: Some(raw_input.as_ref()),
        upstream_path_override,
        cache_store: state.response_cache_store.as_ref(),
        cache_request_hash: request_hash.as_deref(),
        prompt_text: &prompt_text,
        multi_turn_cache_params: multi_turn_params.clone(),
        cache_ttl_seconds: auth.cache_ttl_seconds,
        app_enable_content_quality_scan,
        app_content_quality_mode: app_content_quality_mode.as_deref(),
        app_content_quality_threshold,
    };

    // Bypass: skip all scanning, log with bypass trace, forward immediately
    if app_mode == "bypass" {
        return handle_bypass(&ctx, body_for_dispatch.clone()).await;
    }

    // ── Run the sequential scan pipeline ────────────────────────────────────
    let t1_summary = crate::agents::orchestrator::scan_pipeline(
        client, &prompt_text, &app_id, policy_store,
        &request_id, &source_ip, log_writer,
        state.scan_fail_closed,
        state.response_cache_store.as_ref(),
        request_hash.as_deref(),
        enable_cache,
        multi_turn_params.as_ref(),
        auth.classifier_threshold, auth.classifier_prompt.as_deref(),
    ).await;

    // ── Cache hit — return cached response directly, skip T2 + enforcement ──
    if t1_summary.cache_hit {
        // Run T2 analysis on cache hits to prevent novel attacks from
        // bypassing T2 (DET-1b). If T2 blocks, redirect to enforcement.
        if app_enable_t2 {
            let t2_on_cache = crate::agents::classification::t2_analyzer::run_t2_analysis(
                client, &prompt_text, policy_store, &request_id, t1_summary.clone(), log_writer,
            ).await;
            if t2_on_cache.final_decision == "block" {
                tracing::warn!(
                    "[cache] {} CACHE_HIT_T2_BLOCKED — T2 analysis blocked response, serving block instead of cache",
                    request_id
                );
                let pipeline_trace_json = trace_json(&t2_on_cache);
                let t2_flagged = true;
                let t2_confidence = t2_on_cache.t2_result.as_ref().map(|r| r.confidence);
                let t2_reason = t2_on_cache.t2_result.as_ref().map(|r| r.reason.clone());
                let threat_framework_id = t2_on_cache.hit.as_ref().and_then(|h| {
                    if let LayerResult::Hit { framework_id, .. } = h {
                        Some(framework_id.clone())
                    } else {
                        None
                    }
                });
                return dispatch_enforcement(
                    &ctx, &t2_on_cache, pipeline_trace_json, None, t2_flagged,
                    t2_confidence, t2_reason, threat_framework_id,
                    classifier_prov_id, classifier_prov_name, &app_mode,
                    body_for_dispatch, is_multipart,
                ).await;
            }
        }

        // A cache hit must look like a real, auditable request: count it toward
        // app quota (it's still a served request), log it into ai_provider_call_logs
        // with call_type="cache" (no real upstream $ cost, so provider_meter is
        // deliberately not incremented), and mark cache_hit/cache_tier on the
        // ai_request_logs entry so the Traffic page reflects it too.
        let cache_elapsed = start_time.elapsed().as_millis() as i64;
        state.quota_tracker.increment(&app_id);

        // Resolve provider_name/vendor from cache_provider_id — leaving these None
        // (as opposed to the live-request log path, which always has a resolved
        // ProviderConfig in hand) produced NULL provider_usage_daily rollup rows,
        // which broke the rollup job's `max(provider_name)` aggregate for any
        // (provider_id, call_type, day) group made up entirely of cache hits.
        let cache_provider = t1_summary.cache_provider_id.as_deref()
            .and_then(|id| policy_store.resolve_provider(id));

        log_writer.log_provider_call(
            Some(&request_id), "cache", "pipeline",
            Some(&app_id), Some(&app_name),
            t1_summary.cache_provider_id.as_deref(),
            cache_provider.as_ref().map(|p| p.name.as_str()),
            cache_provider.as_ref().map(|p| p.vendor.as_str()),
            Some(&model),
            None,
            None, None,
            t1_summary.cache_tokens_in, t1_summary.cache_tokens_out,
            cache_elapsed,
            Some(200),
            true,
            None,
        );

        log_writer.log_entry(LogEntry {
            request_id: request_id.clone(),
            app_id: app_id.clone(),
            app_name: app_name.clone(),
            model: model.clone(),
            method: method.clone(),
            path: path.clone(),
            source_ip: source_ip.clone(),
            app_api_key: api_key_prefix.clone(),
            tokens_in: t1_summary.cache_tokens_in.unwrap_or(0),
            tokens_out: t1_summary.cache_tokens_out.unwrap_or(0),
            duration_ms: cache_elapsed,
            status_code: 200,
            action: Some("cache_hit".to_string()),
            final_decision: Some("allow".to_string()),
            upstream_provider_id: t1_summary.cache_provider_id.clone(),
            cache_hit: true,
            cache_tier: t1_summary.cache_tier.clone(),
            user_agent: user_agent.clone(),
            raw_input_payload: Some(raw_input.to_string()),
            ..Default::default()
        });

        let resp_bytes = t1_summary.cache_response_bytes.unwrap_or_default();

        // Run output scanning on cached response body
        let output_detectors: Vec<DetectorConfig> = {
            let all_detectors = policy_store.detectors.read().unwrap_or_else(|e| e.into_inner());
            let app_detector_map = policy_store.app_detector_ids.read().unwrap_or_else(|e| e.into_inner());
            match app_detector_map.get(&app_id) {
                None => all_detectors.iter()
                    .filter(|d| d.scanning_scope == "output" || d.scanning_scope == "both")
                    .cloned()
                    .collect(),
                Some(ids) => all_detectors.iter()
                    .filter(|d| ids.contains(&d.id) && (d.scanning_scope == "output" || d.scanning_scope == "both"))
                    .cloned()
                    .collect(),
            }
        };

        let resp_text = String::from_utf8_lossy(&resp_bytes);
        let output_result = output_scanner::scan_with_detector_configs(
            &output_detectors,
            &resp_text,
        );

        if output_result.blocked {
            tracing::warn!(
                "[cache] {} CACHE_HIT OUTPUT_BLOCKED — detector=\"{}\"",
                request_id,
                output_result.detector_name.as_deref().unwrap_or("unknown")
            );
            return Ok(build_firewall_error(
                &format!("Response blocked by output detector: {}", output_result.detector_name.as_deref().unwrap_or("unknown")),
                &request_id, is_anthropic, StatusCode::FORBIDDEN,
            ));
        }

        let resp_bytes: Bytes = match output_result.redacted_text {
            Some(redacted) => Bytes::from(redacted.into_bytes()),
            None => Bytes::from(resp_bytes),
        };

        let headers_str = t1_summary.cache_response_headers.unwrap_or_default();
        let mut resp = Response::new(axum::body::Body::from(resp_bytes));
        resp.headers_mut().insert("content-type", "application/json".parse().unwrap());
        if let Ok(headers_map) = serde_json::from_str::<std::collections::HashMap<String, String>>(&headers_str) {
            for (k, v) in headers_map {
                if let Ok(name) = axum::http::HeaderName::from_bytes(k.as_bytes())
                    && let Ok(val) = axum::http::HeaderValue::from_str(&v)
                    && name != "content-type"
                {
                    resp.headers_mut().insert(name, val);
                }
            }
        }
        return Ok(resp);
    }

    // ── T2 Intent Analysis (per-app opt-in, runs only when T1 allows) ────────
    let scan_summary = if app_enable_t2 && t1_summary.final_decision != "block" {
        crate::agents::classification::t2_analyzer::run_t2_analysis(
            client, &prompt_text, policy_store, &request_id, t1_summary, log_writer,
        ).await
    } else {
        t1_summary
    };

    // ── Post-scan processing ──────────────────────────────────────────────────
    let t2_flagged = scan_summary.t2_result.as_ref().map(|r| r.is_attack).unwrap_or(false);
    let t2_confidence = scan_summary.t2_result.as_ref().map(|r| r.confidence);
    let t2_reason = scan_summary.t2_result.as_ref().map(|r| r.reason.clone());

    // Spawn Knowledge Developer if T2 found a novel, generalizable attack
    if app_enable_knowledge_dev && t2_flagged
        && let Some(ref t2) = scan_summary.t2_result
            && t2.suggest_new_knowledge {
                let kd_client     = client.clone();
                let kd_prompt     = prompt_text.clone();
                let kd_reason     = if t2.knowledge_reason.is_empty() {
                    t2.reason.clone()
                } else {
                    format!("{} (generalizable because: {})", t2.reason, t2.knowledge_reason)
                };
                let kd_req_id     = request_id.clone();
                let kd_app_id     = app_id.clone();
                let kd_store      = policy_store.clone();
                let kd_pool       = state.db_pool.clone();
                let kd_lw         = log_writer.clone();
                tokio::spawn(async move {
                    crate::agents::knowledge::knowledge_developer::develop_threat_knowledge(
                        &kd_client, &kd_prompt, &kd_reason, &kd_req_id, &kd_app_id,
                        &kd_store, &kd_pool, &kd_lw,
                    ).await;
                });
            }

    if t2_flagged
        && let Some(m) = crate::tools::telemetry::METRICS.get() {
            m.t2_flagged_total.with_label_values(&[app_id.as_str()]).inc();
        }

    let pipeline_trace_json = trace_json(&scan_summary);
    let classification_reason: Option<String> =
        scan_summary.classifier_result.as_ref().map(|r| r.reason.clone());

    let hit_framework_id = scan_summary.hit
        .as_ref()
        .and_then(|h| {
            if let LayerResult::Hit { framework_id, .. } = h {
                Some(framework_id.clone())
            } else {
                None
            }
        });

    let threat_framework_id: Option<String> = scan_summary.classifier_result
        .as_ref().filter(|r| !r.framework_id.is_empty())
        .map(|r| r.framework_id.clone())
        .or_else(|| {
            if hit_framework_id.as_deref().unwrap_or("").is_empty() {
                None
            } else {
                hit_framework_id.clone()
            }
        });

    dispatch_enforcement(
        &ctx,
        &scan_summary,
        pipeline_trace_json,
        classification_reason,
        t2_flagged,
        t2_confidence,
        t2_reason,
        threat_framework_id,
        classifier_prov_id,
        classifier_prov_name,
        &app_mode,
        body_for_dispatch,
        is_multipart,
    ).await
}
