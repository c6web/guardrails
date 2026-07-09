/// Core forwarding logic: non-streaming forward, streaming forward, passthrough.
use axum::{body::Bytes, http::HeaderMap, http::StatusCode, response::Response};
use reqwest::Client;
use serde_json::Value;

use crate::policy::ProviderConfig;
use crate::adapters::llm::LlmAdapter;
use crate::tools::log_writer::LogEntry;
use crate::agents::redaction::redact_or_keep;
use crate::pipeline_types::{format_option, AppError, ForwardArgs};

use super::helpers::*;
use super::provider_call::try_provider;
use super::response::{relay_response_headers, FormatJson};
use super::body_mutation::should_use_raw_passthrough;
use super::meter_check::{check_provider_meter, MeterCheckResult};

use axum::response::IntoResponse;

// ── Non-streaming forward ──────────────────────────────────────────────────────

pub async fn forward_with_fallback(
    args: ForwardArgs<'_>,
) -> Result<Response, AppError> {
    let ForwardArgs {
        client,
        log_writer,
        request_id,
        app_id,
        api_key_prefix,
        app_name,
        model,
        method,
        path,
        source_ip,
        user_prompt,
        req_body,
        providers,
        start_time,
        flagged,
        detector,
        confidence,
        threat_title,
        excerpt,
        action,
        threat_framework_id,
        classifier_id,
        classifier_name,
        policy_store,
        is_anthropic,
        pipeline_trace,
        final_decision,
        blocked_stage,
        classification_reason,
        t2_flagged,
        t2_confidence,
        t2_reason,
        provider_meter,
        input_redaction_summary,
        raw_body,
        path_override,
        client_headers,
        user_agent,
        raw_input_payload,
        cache_store,
        cache_request_hash,
        prompt_text,
        multi_turn_cache_params,
        cache_ttl_seconds,
        app_enable_content_quality_scan,
        app_content_quality_mode,
        app_content_quality_threshold,
    } = args;
    let mut last_err = String::new();
    let mut all_meter_blocked = !providers.is_empty();
    let mut meter_period_end: Option<chrono::DateTime<chrono::Utc>> = None;

    for (i, provider) in providers.iter().enumerate() {
        let slot = match i {
            0 => "primary",
            1 => "backup1",
            _ => "backup2",
        };

        // Provider meter check — fail-open: infra error → allow
        if let Some(meter) = provider_meter
            && let Some(result) = check_provider_meter(request_id, slot, provider, meter).await {
                match result {
                    MeterCheckResult::Exceeded { period_end } => {
                        last_err = format!("Provider {} meter exceeded", provider.name);
                        meter_period_end = Some(period_end);
                        continue;
                    }
                    MeterCheckResult::SoftExceeded |
                    MeterCheckResult::Warning => {}
                    MeterCheckResult::Ok => {}
                }
            }

        all_meter_blocked = false;

        // Request-time DNS re-validation to prevent DNS-rebinding SSRF.
        if !crate::policy::endpoint_validation::revalidate_endpoint(&provider.endpoint).await {
            last_err = format!("{} endpoint failed DNS re-validation (potential SSRF)", provider.name);
            tracing::warn!("[forward] {} SSRF_CHECK {} app=\"{}\" provider=\"{}\" endpoint=\"{}\"",
                request_id, slot, app_name, provider.name, provider.endpoint);
            continue;
        }

        // Vendor-host binding: the endpoint host must match the vendor's domain.
        if !crate::policy::endpoint_validation::verify_vendor_host(&provider.endpoint, &provider.vendor) {
            last_err = format!("{} endpoint host does not match vendor \"{}\"", provider.name, provider.vendor);
            tracing::warn!("[forward] {} VENDOR_HOST_MISMATCH {} app=\"{}\" provider=\"{}\" vendor=\"{}\" endpoint=\"{}\"",
                request_id, slot, app_name, provider.name, provider.vendor, provider.endpoint);
            continue;
        }

        let attempt = match prepare_provider_attempt(
            provider, i, &req_body, model, is_anthropic,
            path_override, user_prompt, request_id, false,
        ).await {
            Ok(a) => a,
            Err(err) => {
                last_err = err;
                continue;
            }
        };

        // Unpack to preserve existing variable names for the handlers below.
        let adapter = attempt.adapter;
        let upstream_body = attempt.upstream_body;
        let mutations_json = attempt.mutations_json;
        let effective_model = attempt.effective_model;
        let cross_dialect = attempt.cross_dialect;

        // Phase 2: select forward payload — raw passthrough for same-dialect, no-mutation paths.
        let (raw_bytes_opt, raw_ct_opt) = match &raw_body {
            Some((b, ct)) => (Some(b), ct.as_deref()),
            None => (None, None),
        };
        let use_raw = should_use_raw_passthrough(raw_bytes_opt, cross_dialect, mutations_json.is_none());

        let provider_start = std::time::Instant::now();
        let resp_result = try_provider(
            client, provider, adapter.as_ref(), &upstream_body,
            if use_raw { raw_bytes_opt } else { None },
            if use_raw { raw_ct_opt } else { None },
            false,
            path_override,
            client_headers,
        ).await;

        match resp_result {
            Ok(resp) if resp.status().is_success() => {
                let provider_ms = provider_start.elapsed().as_millis() as f64;
                if let Some(m) = crate::tools::telemetry::METRICS.get() {
                    m.upstream_duration_ms.with_label_values(&[&provider.name, "ok"]).observe(provider_ms);
                }
                let resp_status = resp.status().as_u16() as i16;
                // Capture upstream response headers before consuming the body
                let resp_headers = resp.headers().clone();
                let raw_resp_bytes = resp.bytes().await.map_err(|e| AppError(e.to_string()))?;
                let raw_output_payload = String::from_utf8_lossy(&raw_resp_bytes).to_string();

                // Parse raw vendor response for logging and output scanning.
                let native_resp: Value = serde_json::from_slice::<Value>(&raw_resp_bytes).unwrap_or(Value::Null);
                let (pcl_tin, pcl_tout) = adapter.extract_usage(&native_resp);

               // Vendor response → canonical (OpenAI) for uniform extraction + scanning.
                let mut canonical: Value = {
                    let native_clone = native_resp.clone();
                    if native_clone != Value::Null { adapter.parse_upstream_response(native_clone) } else { Value::Null }
                };

                let mut tokens_in:  i32 = 0;
                let mut tokens_out: i32 = 0;
                let mut assistant_reply: Option<String> = None;
                // Tool-call responses are excluded from response caching (V1 scope —
                // often time-sensitive/non-deterministic side effects).
                let mut has_tool_calls = false;

                {
                    let resp_json = &canonical;
                    if let Some(usage) = resp_json.get("usage") {
                        tokens_in  = usage.get("prompt_tokens").and_then(|v| v.as_u64()).unwrap_or(0) as i32;
                        tokens_out = usage.get("completion_tokens").and_then(|v| v.as_u64()).unwrap_or(0) as i32;
                    }
                    if let Some(choices) = resp_json.get("choices").and_then(|v| v.as_array()) {
                        for choice in choices {
                            let msg = choice.get("message");
                            let content  = msg.and_then(|m| m.get("content")).and_then(|c| c.as_str()).unwrap_or("");
                            let thinking = msg.and_then(|m| m.get("reasoning_content")).and_then(|rc| rc.as_str()).unwrap_or("");
                            assistant_reply = format_reply(content, thinking);
                            if choice.get("message")
                                .and_then(|m| m.get("tool_calls"))
                                .and_then(|v| v.as_array())
                                .is_some_and(|tc| !tc.is_empty())
                            {
                                has_tool_calls = true;
                                // Tool call args are redacted in-place by redact_tool_args_in_canonical below
                            }
                        }
                    }
                }

                // Raw provider call log — redact PII from response before persisting (G5 fix)
                let pcl_url = format!("{}{}", provider.endpoint.trim_end_matches('/'), adapter.chat_path());
                log_writer.log_upstream_call(
                    request_id, app_id, app_name, provider,
                    &pcl_url, effective_model.as_str(),
                    &upstream_body, &native_resp,
                    pcl_tin, pcl_tout,
                    provider_start.elapsed().as_millis() as i64,
                    resp_status, true, None,
                );

                // Output scanning (runs on canonical copy regardless of passthrough mode)
                let mut output_scan_flagged    = false;
                let mut output_scan_framework_id: Option<String> = None;
                let mut output_scan_confidence: Option<f32>      = None;
                let mut output_scan_detector:   Option<String>   = None;
                let mut output_blocked         = false;
                let mut output_block_action:    Option<String>   = None;
                let mut output_redacted_reply:  Option<String>   = None;

                if let Some(reply) = &assistant_reply {
                    let scan_result = super::output_scan::scan_output_impl(policy_store, request_id, app_id, app_name, reply);
                    output_scan_flagged = scan_result.flagged;
                    output_scan_framework_id.clone_from(&scan_result.category);
                    output_scan_confidence = Some(scan_result.confidence);
                    output_scan_detector.clone_from(&scan_result.detector_name);
                    if let Some(rt) = scan_result.redacted_text {
                        output_redacted_reply = Some(rt);
                    }
                    if scan_result.blocked {
                        output_blocked     = true;
                        output_block_action = scan_result.block_action;
                        output_scan_detector.clone_from(&scan_result.detector_name);
                    }
                }

                // R5/V2: Also scan tool call args for flag/block/redact decisions.
                let mut tool_args_redacted = false;
                crate::content::tool_calls::for_each_tool_call_args(&canonical, |args| {
                    let tool_scan = super::output_scan::scan_output_impl(policy_store, request_id, app_id, app_name, args);
                    if tool_scan.flagged && !output_scan_flagged {
                        output_scan_flagged = true;
                    }
                    if tool_scan.blocked {
                        output_blocked = true;
                        output_block_action = tool_scan.block_action;
                    }
                    if tool_scan.redacted_text.is_some() {
                        tool_args_redacted = true;
                    }
                });

                // ── Content Quality Scanning (opt-in per app; runs after output scan) ──
                // Scores the generated response for groundedness/relevance/hallucination
                // via the active Content Quality Provider (TruLens by default) and
                // decides whether to block/redact/flag/monitor it. This is a content
                // *quality* judgment (is the answer any good), not a threat verdict —
                // it reuses the same enforcement vocabulary as security detectors, but
                // is evaluated independently, after output scanning has already cleared.
                //
                // Block/redact modes run synchronously (inline scan, block response
                // before returning). Flag/monitor/null modes run asynchronously
                // (response returns immediately, scan in background).
                let cq_mode_is_enforcing = matches!(app_content_quality_mode.unwrap_or("flag"), "block" | "redact");
                let cq_eligible = app_enable_content_quality_scan && !output_blocked && assistant_reply.is_some();
                let cq_run_async = cq_eligible && !cq_mode_is_enforcing;
                let cq_assistant_reply = if cq_eligible { assistant_reply.clone() } else { None };

                let mut content_quality_scanned       = false;
                let mut content_quality_groundedness: Option<f32> = None;
                let mut content_quality_relevance:    Option<f32> = None;
                let mut content_quality_hallucination: Option<f32> = None;
                let mut content_quality_flagged       = false;
                let mut content_quality_action: Option<String> = None;
                let mut content_quality_reason: Option<String> = None;
                let mut content_quality_blocked       = false;

                if cq_eligible && cq_mode_is_enforcing {
                    let reply = cq_assistant_reply.as_deref().unwrap();
                    let outcome = super::content_quality_stage::run_inline(
                        client, policy_store, request_id, app_id, app_name, prompt_text, &reply,
                        log_writer, app_content_quality_mode, app_content_quality_threshold,
                    ).await;
                    content_quality_scanned = outcome.scanned;
                    if let Some(ref scores) = outcome.scores {
                        content_quality_groundedness = scores.first().copied();
                        content_quality_relevance = scores.get(1).copied();
                        content_quality_hallucination = scores.get(2).copied();
                    }
                    content_quality_flagged = outcome.flagged;
                    content_quality_action = outcome.action;
                    content_quality_reason = outcome.reason;
                    content_quality_blocked = outcome.blocked;
                    if let Some(redacted) = outcome.redact_message {
                        output_redacted_reply = Some(redacted);
                    }
                }

                if content_quality_blocked {
                    let elapsed = start_time.elapsed().as_millis() as i64;
                    tracing::warn!(
                        "[blocked] {} CONTENT_QUALITY_BLOCKED app=\"{}\" reason={} elapsed={}ms",
                        request_id, app_name, format_option(&content_quality_reason), elapsed
                    );
                    let redacted_user_prompt = user_prompt.as_ref().map(|up| redact_or_keep(up, policy_store, app_id));
                    let redacted_assistant_reply = assistant_reply.as_ref().map(|ar| redact_or_keep(ar, policy_store, app_id));
                    let blocked_status = StatusCode::BAD_REQUEST.as_u16() as i16;
                    let cq_trace = append_content_quality_stage(&pipeline_trace, "blocked", &content_quality_reason);
                    log_writer.log_entry(LogEntry {
                        request_id: request_id.to_string(),
                        app_id: app_id.to_string(),
                        app_name: app_name.to_string(),
                        model: effective_model.to_string(),
                        method: method.to_string(),
                        path: path.to_string(),
                        source_ip: source_ip.to_string(),
                        app_api_key: api_key_prefix.to_string(),
                        tokens_in,
                        tokens_out,
                        duration_ms: elapsed,
                        status_code: blocked_status,
                        flagged: true,
                        action: Some("blocked".to_string()),
                        threat_title: Some("Response blocked by content quality scan".to_string()),
                        threat_knowledge_matches: None,
                        user_prompt: redacted_user_prompt,
                        response_body: redacted_assistant_reply,
                        upstream_provider_id: Some(provider.id.clone()),
                        upstream_provider_name: Some(provider.name.clone()),
                        classifier_provider_id: classifier_id.map(|s| s.to_string()),
                        classifier_provider_name: classifier_name.map(|s| s.to_string()),
                        output_scan_flagged,
                        output_scan_framework_id: output_scan_framework_id.clone(),
                        output_scan_confidence,
                        output_scan_detector: output_scan_detector.clone(),
                        pipeline_trace: cq_trace,
                        final_decision: Some("block".to_string()),
                        blocked_stage: Some("content_quality_scan".to_string()),
                        classification_reason: classification_reason.map(|s| s.to_string()),
                        t2_flagged,
                        t2_confidence,
                        t2_reason: t2_reason.clone(),
                        request_mutations: mutations_json.clone(),
                        user_agent: user_agent.map(|s| s.to_string()),
                        raw_input_payload: raw_input_payload.map(|s| s.to_string()),
                        raw_output_payload: Some(raw_output_payload.clone()),
                        content_quality_scanned,
                        content_quality_groundedness,
                        content_quality_relevance,
                        content_quality_hallucination,
                        content_quality_flagged,
                        content_quality_action: content_quality_action.clone(),
                        content_quality_reason: content_quality_reason.clone(),
                        ..Default::default()
                    });
                    if let Some(meter) = provider_meter {
                        meter.increment(&provider.id, tokens_in, tokens_out);
                    }
                    return Ok(format_gateway_error(
                        "Response blocked by content quality scanning policy",
                        "firewall_block", "blocked_content_quality", request_id, is_anthropic,
                        StatusCode::BAD_REQUEST,
                    ));
                }

                // If output scan blocked, log and return error
                if output_blocked {
                    let elapsed = start_time.elapsed().as_millis() as i64;
                    tracing::warn!(
                        "[blocked] {} OUTPUT_BLOCKED app=\"{}\" detector={} elapsed={}ms",
                        request_id, app_name, format_option(&output_scan_detector), elapsed
                    );
                    // Build redaction_summary for blocked output (may include input redaction)
                    let block_redaction_summary = match &input_redaction_summary {
                        Some(input) => {
                            let mut entries: Vec<Value> = Vec::new();
                            if let Ok(val) = serde_json::from_str::<serde_json::Value>(input.as_str())
                                && let serde_json::Value::Array(arr) = val {
                                    entries.extend(arr);
                                }
                            let mut out_entry = serde_json::Map::new();
                            out_entry.insert("type".to_string(), "output_blocked".into());
                            out_entry.insert("detector".to_string(), output_scan_detector.clone().into());
                            entries.push(serde_json::Value::Object(out_entry));
                            Some(serde_json::Value::Array(entries).to_string())
                        }
                        None => {
                            let mut entry = serde_json::Map::new();
                            entry.insert("type".to_string(), "output_blocked".into());
                            entry.insert("detector".to_string(), output_scan_detector.clone().into());
                            Some(serde_json::Value::Object(entry).to_string())
                        }
                    };
                    // Redact sensitive fields before logging (G5 fix)
                    let redacted_user_prompt = user_prompt.as_ref().map(|up| redact_or_keep(up, policy_store, app_id));
                    let redacted_assistant_reply = assistant_reply.as_ref().map(|ar| redact_or_keep(ar, policy_store, app_id));
                    let blocked_status = StatusCode::BAD_REQUEST.as_u16() as i16;
                    log_writer.log_entry(LogEntry {
                        request_id: request_id.to_string(),
                        app_id: app_id.to_string(),
                        app_name: app_name.to_string(),
                        model: effective_model.to_string(),
                        method: method.to_string(),
                        path: path.to_string(),
                        source_ip: source_ip.to_string(),
                        app_api_key: api_key_prefix.to_string(),
                        tokens_in,
                        tokens_out,
                        duration_ms: elapsed,
                        status_code: blocked_status,
                        flagged: true,
                        detector: output_scan_detector.clone(),
                        confidence: output_scan_confidence,
                        action: output_block_action,
                        threat_title: Some("Output blocked by detector".to_string()),
                        framework_id: output_scan_framework_id.clone(),
                        user_prompt: redacted_user_prompt,
                        response_body: redacted_assistant_reply,
                        upstream_provider_id: Some(provider.id.clone()),
                        upstream_provider_name: Some(provider.name.clone()),
                        classifier_provider_id: classifier_id.map(|s| s.to_string()),
                        classifier_provider_name: classifier_name.map(|s| s.to_string()),
                        output_scan_flagged: true,
                        output_scan_framework_id: output_scan_framework_id.clone(),
                        output_scan_confidence,
                        output_scan_detector: output_scan_detector.clone(),
                        pipeline_trace: pipeline_trace.clone(),
                        final_decision: Some("block".to_string()),
                        blocked_stage: Some("output_scan".to_string()),
                        classification_reason: classification_reason.map(|s| s.to_string()),
                        t2_flagged,
                        t2_confidence,
                        t2_reason: t2_reason.clone(),
                        request_mutations: mutations_json.clone(),
                        redaction_summary: block_redaction_summary,
                        user_agent: user_agent.map(|s| s.to_string()),
                        raw_input_payload: raw_input_payload.map(|s| s.to_string()),
                        raw_output_payload: Some(raw_output_payload.clone()),
                        ..Default::default()
                    });
                    // Meter the blocked response — upstream already billed for it
                    if let Some(meter) = provider_meter {
                        meter.increment(&provider.id, tokens_in, tokens_out);
                    }
                    let block_msg = format!("Response blocked by output scanning policy (detector: {})", output_scan_detector.as_deref().unwrap_or("unknown"));
                    return Ok(format_gateway_error(&block_msg, "firewall_block", "blocked_output", request_id, is_anthropic, StatusCode::BAD_REQUEST));
                }

                // Apply output redaction (mutation forces canonical-reserialized path)
                let output_was_modified = output_redacted_reply.is_some() || tool_args_redacted;
                if let Some(ref redacted) = output_redacted_reply {
                    assistant_reply = Some(redacted.clone());
                }

                let elapsed = start_time.elapsed().as_millis() as i64;
                let effective_action = if output_redacted_reply.is_some() || tool_args_redacted {
                    "redacted_output"
                } else {
                    action.as_deref().unwrap_or("forwarded")
                };
                tracing::info!("[ok]      {} {} app=\"{}\" provider=\"{}\" status={} elapsed={}ms in={} out={}", request_id, effective_action, app_name, provider.name, resp_status, elapsed, tokens_in, tokens_out);
                log_writer.note_successful_request(app_id);
                if let Some(meter) = provider_meter {
                    meter.increment(&provider.id, tokens_in, tokens_out);
                }

                  let redaction_summary = input_redaction_summary;

                // Record backup-provider failover in the pipeline trace when a non-primary
                // slot served the request (Bug B / routing visibility).
                let routed_trace = super::helpers::append_routing_stage(
                    &pipeline_trace, slot, &provider.name, &effective_model,
                );
                let routed_trace = if content_quality_scanned {
                    append_content_quality_stage(
                        &routed_trace,
                        content_quality_action.as_deref().unwrap_or("none"),
                        &content_quality_reason,
                    )
                } else if cq_run_async {
                    append_content_quality_stage(
                        &routed_trace,
                        "scheduled",
                        &None,
                    )
                } else {
                    routed_trace
                };

                // Redact sensitive fields before logging (G5 fix)
                let redacted_user_prompt = user_prompt.as_ref().map(|up| redact_or_keep(up, policy_store, app_id));
                let redacted_excerpt = excerpt.map(|e| redact_or_keep(e, policy_store, app_id));
                let redacted_assistant_reply = assistant_reply.as_ref().map(|ar| redact_or_keep(ar, policy_store, app_id));

                // Clone trace for the async CQ scan before moving it into the log entry.
                let async_cq_trace = if cq_run_async { routed_trace.clone() } else { None };

                log_writer.log_entry(LogEntry {
                    request_id: request_id.to_string(),
                    app_id: app_id.to_string(),
                    app_name: app_name.to_string(),
                    model: effective_model.to_string(),
                    method: method.to_string(),
                    path: path.to_string(),
                    source_ip: source_ip.to_string(),
                    app_api_key: api_key_prefix.to_string(),
                    tokens_in,
                    tokens_out,
                    duration_ms: elapsed,
                    status_code: resp_status,
                    flagged,
                    detector: detector.map(|s| s.to_string()),
                    confidence,
                    action: Some(effective_action.to_string()),
                    threat_title: threat_title.map(|s| s.to_string()),
                    excerpt: redacted_excerpt,
                    framework_id: threat_framework_id.map(|s| s.to_string()),
                    user_prompt: redacted_user_prompt,
                    response_body: redacted_assistant_reply,
                    upstream_provider_id: Some(provider.id.clone()),
                    upstream_provider_name: Some(provider.name.clone()),
                    classifier_provider_id: classifier_id.map(|s| s.to_string()),
                    classifier_provider_name: classifier_name.map(|s| s.to_string()),
                    output_scan_flagged,
                    output_scan_framework_id: output_scan_framework_id.clone(),
                    output_scan_confidence,
                    output_scan_detector: output_scan_detector.clone(),
                    pipeline_trace: routed_trace,
                    final_decision: final_decision.clone(),
                    blocked_stage: blocked_stage.clone(),
                    classification_reason: classification_reason.map(|s| s.to_string()),
                    t2_flagged,
                    t2_confidence,
                    t2_reason: t2_reason.clone(),
                    request_mutations: mutations_json,
                    redaction_summary,
                    user_agent: user_agent.map(|s| s.to_string()),
                    raw_input_payload: raw_input_payload.map(|s| s.to_string()),
                    raw_output_payload: Some(raw_output_payload.clone()),
                    content_quality_scanned,
                    content_quality_groundedness,
                    content_quality_relevance,
                    content_quality_hallucination,
                    content_quality_flagged,
                    content_quality_action,
                    content_quality_reason,
                    ..Default::default()
                });

                // Spawn async content quality scan (flag/monitor/null modes)
                // Runs after the log entry so the row exists for the UPDATE.
                if cq_run_async {
                    let async_client = client.clone();
                    let async_policy_store = policy_store.clone();
                    let async_log_writer = log_writer.clone();
                    let async_request_id = request_id.to_string();
                    let async_app_id = app_id.to_string();
                    let async_app_name = app_name.to_string();
                    let async_prompt = prompt_text.to_string();
                    let async_reply = cq_assistant_reply.unwrap();
                    let async_mode = app_content_quality_mode.map(|s| s.to_string());
                    let async_base_trace = async_cq_trace;

                    super::content_quality_stage::spawn_async_scan(
                        super::content_quality_stage::CqAsyncCtx {
                            client: async_client,
                            policy_store: async_policy_store,
                            log_writer: async_log_writer,
                            request_id: async_request_id,
                            app_id: async_app_id,
                            app_name: async_app_name,
                            prompt_text: async_prompt,
                            assistant_reply: async_reply,
                            mode: async_mode,
                            threshold: app_content_quality_threshold,
                            base_trace: async_base_trace,
                        },
                    );
                }

                // Phase 2: select what to return to the client.
                // Same dialect + no output scan mutation → raw passthrough; otherwise translate/reserialize.

                // Redact tool_call arguments in canonical response (G7/V2 fix)
                if output_redacted_reply.is_some() || tool_args_redacted {
                    let redact_detectors: Vec<_> = {
                        let all_det = policy_store.detectors.read().unwrap_or_else(|e| e.into_inner());
                        all_det.iter()
                            .filter(|d| d.mode == "redact" && d.rule_type == "regex" && (d.scanning_scope == "output" || d.scanning_scope == "both"))
                            .cloned()
                            .collect()
                    };
                    super::output_scan::redact_tool_args_in_canonical(&mut canonical, &redact_detectors);
                }

                let client_bytes: Bytes = super::output_scan::build_response_bytes(
                    use_raw, output_was_modified, raw_resp_bytes, canonical,
                    &output_redacted_reply, is_anthropic,
                );

                let mut response: Response = FormatJson::new(client_bytes.clone()).into_response();
                response.headers_mut().insert("content-type", "application/json".parse().unwrap());
                // F-8: relay important upstream response headers to the client
                relay_response_headers(&resp_headers, &mut response);

                // ── Cache write (fire-and-forget) ────────────────────────────
                // Gated on: the global admin toggle (per-app + env gates already produced
                // Some(cache_store)/Some(hash) upstream), no output redaction applied, and
                // no tool calls in the response — see "What's excluded from caching in V1".
                let output_was_redacted = output_redacted_reply.is_some() || tool_args_redacted;
                if cache_store.is_some() && cache_request_hash.is_some()
                    && *policy_store.response_cache_enabled.read().await
                    && (output_was_redacted || has_tool_calls)
                    && let Some(m) = crate::tools::telemetry::METRICS.get()
                {
                    let outcome = if output_was_redacted { "skipped_redacted" } else { "skipped_tool_call" };
                    m.cache_write_total.with_label_values(&[outcome]).inc();
                }
                if let (Some(store), Some(ref hash)) = (cache_store, cache_request_hash)
                    && *policy_store.response_cache_enabled.read().await
                    && !output_was_redacted
                    && !has_tool_calls
                {
                    let final_headers: std::collections::HashMap<String, String> = response.headers().iter()
                        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
                        .collect();
                    // Per-app override (connected_apps.cache_ttl_seconds), clamped to the
                    // deploy-time RESPONSE_CACHE_MAX_TTL_SECONDS ceiling; falls back to the
                    // global default when the app hasn't set an override.
                    let ttl = cache_ttl_seconds
                        .map(|t| (t.max(0) as u64).min(store.max_ttl_seconds()))
                        .unwrap_or_else(|| store.default_ttl_seconds());
                    let is_multi_turn = multi_turn_cache_params.as_ref().map(|p| p.enabled).unwrap_or(false);
                    let entry = crate::agents::cache::CachedResponse {
                        id:                format!("cache_{}", rand::random::<u64>()),
                        app_id:            app_id.to_string(),
                        request_hash:      hash.to_string(),
                        model:             effective_model.clone(),
                        provider_id:       provider.id.clone(),
                        match_mode:        "exact".to_string(),
                        response_bytes:    client_bytes.to_vec(),
                        response_headers:  Some(final_headers),
                        tokens_in,
                        tokens_out,
                        created_at:        chrono::Utc::now(),
                        expires_at:        chrono::Utc::now() + chrono::Duration::seconds(ttl as i64),
                        hit_count:         0,
                        last_hit_at:       None,
                        embedding:         None,
                        system_prompt_hash: if is_multi_turn { multi_turn_cache_params.as_ref().map(|p| p.system_prompt_hash.clone()) } else { None },
                        end_user_id:       if is_multi_turn { multi_turn_cache_params.as_ref().map(|p| p.end_user_id.clone()) } else { None },
                        turn_index:        if is_multi_turn { multi_turn_cache_params.as_ref().map(|p| p.turn_index) } else { None },
                    };
                    store.insert_l1(app_id.to_string(), hash.to_string(), entry.clone());
                    if let Some(l2_pool) = store.l2_pool().cloned() {
                        if *policy_store.response_cache_semantic_enabled.read().await && !prompt_text.is_empty() {
                            let emb_provs = policy_store.embedding_providers.read().unwrap_or_else(|e| e.into_inner()).clone();
                            if !emb_provs.is_empty() {
                                if is_multi_turn {
                                    let mt = multi_turn_cache_params.unwrap();
                                    crate::agents::cache::write::spawn_write_semantic_multi_turn(
                                        l2_pool, client.clone(), emb_provs,
                                        mt.latest_user_message, entry,
                                        Some(mt.system_prompt_hash),
                                        Some(mt.end_user_id),
                                        Some(mt.turn_index),
                                    );
                                } else {
                                    crate::agents::cache::write::spawn_write_semantic(
                                        l2_pool, client.clone(), emb_provs,
                                        prompt_text.to_string(), entry,
                                    );
                                }
                            } else {
                                crate::agents::cache::write::spawn_write(l2_pool, entry);
                            }
                        } else {
                            crate::agents::cache::write::spawn_write(l2_pool, entry);
                        }
                    }
                }

                return Ok(response);
            }

            Ok(resp) => {
                let status = resp.status();
                let provider_ms = provider_start.elapsed().as_millis() as f64;
                if let Some(m) = crate::tools::telemetry::METRICS.get() {
                    let label = if status.is_client_error() { "client_error" } else { "server_error" };
                    m.upstream_duration_ms.with_label_values(&[&provider.name, label]).observe(provider_ms);
                    m.upstream_failures_total.with_label_values(&[&provider.name, slot]).inc();
                }

                if status.is_client_error() {
                    // F-11: pass through upstream 4xx status + body instead of wrapping as 502.
                    let resp_headers = resp.headers().clone();
                    let body_bytes   = resp.bytes().await.unwrap_or_default();
                    let elapsed      = start_time.elapsed().as_millis() as i64;
                    tracing::warn!("[forward] {} UPSTREAM_4XX {} app=\"{}\" provider=\"{}\" status={} elapsed={}ms",
                        request_id, slot, app_name, provider.name, status, elapsed);

                    // G5 fix: redact PII from upstream response before logging
                    let resp_text = String::from_utf8_lossy(&body_bytes).into_owned();
                    let redacted_resp = Some(redact_or_keep(&resp_text, policy_store, app_id));

                    let pcl_url = format!("{}{}", provider.endpoint.trim_end_matches('/'), adapter.chat_path());
                    log_writer.log_provider_call(
                        Some(request_id), "upstream", "pipeline",
                        Some(app_id), Some(app_name),
                        Some(provider.id.as_str()), Some(provider.name.as_str()),
                        Some(adapter.vendor()),
                        Some(effective_model.as_str()),
                        Some(pcl_url.as_str()),
                        Some(serde_json::to_string(&upstream_body).unwrap_or_default()),
                        redacted_resp,
                        None, None,
                        elapsed,
                        Some(status.as_u16() as i16),
                        false,
                        Some(&format!("Client error {}", status.as_u16())),
                    );
                    let redacted_user_prompt_4xx = user_prompt.as_ref().map(|up| redact_or_keep(up, policy_store, app_id));
                     log_writer.log_entry(LogEntry {
                        request_id: request_id.to_string(),
                        app_id: app_id.to_string(),
                        app_name: app_name.to_string(),
                        model: effective_model.to_string(),
                        method: method.to_string(),
                        path: path.to_string(),
                        source_ip: source_ip.to_string(),
                        app_api_key: api_key_prefix.to_string(),
                        duration_ms: elapsed,
                        status_code: status.as_u16() as i16,
                        action: Some("failed".to_string()),
                        threat_title: Some(format!("Client error from {}: {}", provider.name, status)),
                        framework_id: threat_framework_id.map(|s| s.to_string()),
                        user_prompt: redacted_user_prompt_4xx,
                        response_body: Some(String::new()),
                        upstream_provider_id: Some(provider.id.clone()),
                        upstream_provider_name: Some(provider.name.clone()),
                        classifier_provider_id: classifier_id.map(|s| s.to_string()),
                        classifier_provider_name: classifier_name.map(|s| s.to_string()),
                        classification_reason: classification_reason.map(|s| s.to_string()),
                        t2_flagged,
                        t2_confidence,
                        t2_reason: t2_reason.clone(),
                        user_agent: user_agent.map(|s| s.to_string()),
                        raw_input_payload: raw_input_payload.map(|s| s.to_string()),
                        ..Default::default()
                    });

                    // Return the upstream status code and body as-is (adds gateway request-id header)
                    let mut response = Response::new(axum::body::Body::from(body_bytes));
                    *response.status_mut() = status;
                    relay_response_headers(&resp_headers, &mut response);
                    response.headers_mut().entry("content-type").or_insert("application/json".parse().unwrap());
                    return Ok(response);
                }

                let body = resp.text().await.unwrap_or_default();
                last_err = format!("{} ({}) returned {}: {}", slot, provider.name, status, body);
                // G5 fix: redact PII from upstream response before logging
                let redacted_resp = Some(redact_or_keep(&body, policy_store, app_id));
                {
                    let pcl_url = format!("{}{}", provider.endpoint.trim_end_matches('/'), adapter.chat_path());
                    log_writer.log_provider_call(
                        Some(request_id), "upstream", "pipeline",
                        Some(app_id), Some(app_name),
                        Some(provider.id.as_str()), Some(provider.name.as_str()),
                        Some(adapter.vendor()),
                        Some(effective_model.as_str()),
                        Some(pcl_url.as_str()),
                        Some(serde_json::to_string(&upstream_body).unwrap_or_default()),
                        redacted_resp,
                        None, None,
                        provider_start.elapsed().as_millis() as i64,
                        Some(status.as_u16() as i16),
                        false,
                        Some(&format!("Server error {}", status.as_u16())),
                    );
                }
                tracing::warn!("[forward] {} UPSTREAM_5XX {} app=\"{}\" provider=\"{}\" status={} — trying next", request_id, slot, app_name, provider.name, status);
            }

            Err(e) => {
                let err_str = e.to_string();
                last_err = format!("{} ({}) unreachable: {}", slot, provider.name, err_str);
                let redacted = redact_or_keep(&err_str, policy_store, app_id);
                let pcl_url = format!("{}{}", provider.endpoint.trim_end_matches('/'), adapter.chat_path());
                log_provider_failure(
                    log_writer, request_id, app_id, app_name, provider, slot,
                    adapter.vendor(), effective_model.as_str(), &pcl_url,
                    &serde_json::to_string(&upstream_body).unwrap_or_default(),
                    None, None, Some(&redacted),
                    provider_start.elapsed().as_millis() as i64,
                );
                tracing::warn!("[forward] {} PROVIDER_UNREACHABLE {} app=\"{}\" provider=\"{}\" error={}", request_id, slot, app_name, provider.name, last_err);
            }
        }
    }

    let elapsed = start_time.elapsed().as_millis() as i64;

    // G5/V3 fix: redact PII from accumulated error messages and user prompt before failure-path logging
    let (redacted_last_err, redacted_user_prompt_failure) = {
        let last_err_redacted = Some(redact_or_keep(&last_err, policy_store, app_id));
        let prompt_redacted = user_prompt.as_ref().map(|up| redact_or_keep(up, policy_store, app_id));
        (last_err_redacted, prompt_redacted)
    };

    if all_meter_blocked {
        tracing::warn!("[meter] {} ALL_METER_EXCEEDED app=\"{}\" elapsed={}ms — 429", request_id, app_name, elapsed);
        let reset_msg = meter_period_end
            .map(|e| format!(" Resets at {}.", e.to_rfc3339()))
            .unwrap_or_default();
        let msg = format!("All providers have exceeded their usage limits. {}{}", last_err, reset_msg);
        log_writer.log_entry(LogEntry {
            request_id: request_id.to_string(),
            app_id: app_id.to_string(),
            app_name: app_name.to_string(),
            model: model.to_string(),
            method: method.to_string(),
            path: path.to_string(),
            source_ip: source_ip.to_string(),
            app_api_key: api_key_prefix.to_string(),
            duration_ms: elapsed,
            status_code: 429,
            flagged,
            detector: Some("provider_meter_exceeded".to_string()),
            action: Some("blocked".to_string()),
            threat_title: Some(msg.clone()),
            excerpt: excerpt.map(|s| s.to_string()),
            framework_id: threat_framework_id.map(|s| s.to_string()),
            user_prompt: redacted_user_prompt_failure,
            response_body: Some(String::new()),
            classifier_provider_id: classifier_id.map(|s| s.to_string()),
            classifier_provider_name: classifier_name.map(|s| s.to_string()),
            final_decision: Some("block".to_string()),
            classification_reason: classification_reason.map(|s| s.to_string()),
            t2_flagged,
            t2_confidence,
            t2_reason,
            user_agent: user_agent.map(|s| s.to_string()),
            raw_input_payload: raw_input_payload.map(|s| s.to_string()),
            ..Default::default()
        });
        let mut resp = format_gateway_error(&msg, "rate_limit_error", "provider_meter_exceeded", request_id, is_anthropic, StatusCode::TOO_MANY_REQUESTS);
        if let Some(e) = meter_period_end {
            let secs = (e - chrono::Utc::now()).num_seconds().max(1);
            if let Ok(hv) = secs.to_string().parse() {
                resp.headers_mut().insert("retry-after", hv);
            }
        }
        return Ok(resp);
    }

    tracing::error!("[forward] {} ALL_PROVIDERS_FAILED app=\"{}\" elapsed={}ms last_error={}", request_id, app_name, elapsed, last_err);
    log_writer.log_entry(LogEntry {
        request_id: request_id.to_string(),
        app_id: app_id.to_string(),
        app_name: app_name.to_string(),
        model: model.to_string(),
        method: method.to_string(),
        path: path.to_string(),
        source_ip: source_ip.to_string(),
        app_api_key: api_key_prefix.to_string(),
        duration_ms: elapsed,
        status_code: 503,
        flagged,
        detector: detector.map(|s| s.to_string()),
        confidence,
        action: action.clone(),
        threat_title: Some(format!("All providers failed. Last error: {}", redacted_last_err.as_deref().unwrap_or("N/A"))),
        excerpt: excerpt.map(|s| s.to_string()),
        framework_id: threat_framework_id.map(|s| s.to_string()),
        user_prompt: redacted_user_prompt_failure,
        response_body: Some(String::new()),
        classifier_provider_id: classifier_id.map(|s| s.to_string()),
        classifier_provider_name: classifier_name.map(|s| s.to_string()),
        classification_reason: classification_reason.map(|s| s.to_string()),
        t2_flagged,
        t2_confidence,
        t2_reason: t2_reason.clone(),
        user_agent: user_agent.map(|s| s.to_string()),
        raw_input_payload: raw_input_payload.map(|s| s.to_string()),
        ..Default::default()
    });

    Ok(format_gateway_error(
        &format!("All upstream providers failed: {}", last_err),
        "api_error", "service_unavailable", request_id, is_anthropic,
        StatusCode::SERVICE_UNAVAILABLE,
    ))
}

// ── Generic passthrough forward (P4) ────────────────────────────────────────────

/// Forward a raw request body to the first available upstream provider without
/// scanning or body transformation. Used for media endpoints (files, audio, images).
pub async fn passthrough_forward(
    client:        &Client,
    provider:      &ProviderConfig,
    adapter:       &dyn LlmAdapter,
    raw_body:      Bytes,
    path:          &str,
    client_headers: &HeaderMap,
) -> Result<reqwest::Response, reqwest::Error> {
    let url = format!("{}{}", provider.endpoint.trim_end_matches('/'), path);

    let mut req = client.post(&url).body(raw_body);

    // Apply adapter headers (auth, content-type, version)
    for (name, value) in adapter.build_headers(provider) {
        req = req.header(name, value);
    }

    // F-8: pass through allowed client headers
    for hname in ALLOWED_CLIENT_HEADERS {
        if let Some(val) = client_headers.get(*hname) {
            req = req.header(*hname, val);
        }
    }

    if provider.timeout_ms > 0 {
        req = req.timeout(std::time::Duration::from_millis(provider.timeout_ms));
    }
    req.send().await
}

