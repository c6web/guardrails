/// SSE streaming forward logic.
use axum::{body::Bytes, http::StatusCode, response::Response};
use futures::StreamExt;

use crate::adapters::llm::{adapter_for_provider, anthropic::OpenAiToAnthropicSse};
use crate::agents::redaction::redact_or_keep;
use crate::tools::log_writer::LogEntry;
use crate::pipeline_types::{AppError, ForwardArgs};

use super::helpers::*;
use super::meter_check::{check_provider_meter, MeterCheckResult};
use super::provider_call::try_provider;
use super::response::relay_response_headers;

// ── SSE Streaming ─────────────────────────────────────────────────────────────

/// Upper bound on bytes accumulated for output scanning/audit logging of a single
/// streamed response (SEC-C2). Without this cap, `sse_body` below grows for the full
/// duration of the upstream stream regardless of size, multiplied by concurrent
/// requests — an unbounded-memory DoS vector. The default (16 MiB) is sized generously
/// above any realistic legitimate response: even a verbose extended-thinking/tool-call-
/// heavy completion at the largest commonly configured output-token ceilings, inflated
/// by SSE/JSON per-chunk framing overhead, comfortably fits within this bound. Once the
/// cap is hit, scanning/logging operates on the bounded prefix only — the live client
/// relay (`body_tx`, above) is entirely unaffected and continues unbounded, since that
/// path never buffers.
fn max_scan_bytes() -> usize {
    static MAX_SCAN_BYTES: std::sync::OnceLock<usize> = std::sync::OnceLock::new();
    *MAX_SCAN_BYTES.get_or_init(|| {
        std::env::var("MAX_SCAN_BYTES_MB")
            .ok()
            .and_then(|v| v.parse::<usize>().ok())
            .map(|mb| mb * 1024 * 1024)
            .unwrap_or(16 * 1024 * 1024)
    })
}

/// Forward request to upstream provider with true SSE streaming.
/// Phase 1: Body::from_stream relay + tee → background logging task.
pub async fn forward_streaming(
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
        threat_knowledge_matches,
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
        cache_store: _,
        cache_request_hash: _,
        prompt_text,
        multi_turn_cache_params: _,
        cache_ttl_seconds: _,
        app_enable_content_quality_scan,
        app_content_quality_mode,
        app_content_quality_threshold,
    } = args;
    let mut last_err = String::new();

    for (i, provider) in providers.iter().enumerate() {
        let slot = match i {
            0 => "primary",
            1 => "backup1",
            _ => "backup2",
        };

        // Request-time DNS re-validation to prevent DNS-rebinding SSRF.
        if !crate::policy::endpoint_validation::revalidate_endpoint(&provider.endpoint).await {
            last_err = format!("{} endpoint failed DNS re-validation (potential SSRF)", provider.name);
            tracing::warn!("[streaming] {} SSRF_CHECK {} app=\"{}\" provider=\"{}\" endpoint=\"{}\"",
                request_id, slot, app_name, provider.name, provider.endpoint);
            continue;
        }

        // Vendor-host binding: the endpoint host must match the vendor's domain.
        if !crate::policy::endpoint_validation::verify_vendor_host(&provider.endpoint, &provider.vendor) {
            last_err = format!("{} endpoint host does not match vendor \"{}\"", provider.name, provider.vendor);
            tracing::warn!("[streaming] {} VENDOR_HOST_MISMATCH {} app=\"{}\" provider=\"{}\" vendor=\"{}\" endpoint=\"{}\"",
                request_id, slot, app_name, provider.name, provider.vendor, provider.endpoint);
            continue;
        }

        // Provider meter check — fail-open: infra error → allow
        if let Some(meter) = provider_meter
            && let Some(result) = check_provider_meter(request_id, slot, provider, meter).await {
                match result {
                    MeterCheckResult::Exceeded { period_end } => {
                        last_err = format!(
                            "Provider {} meter exceeded. Resets at {}.",
                            provider.name, period_end.to_rfc3339(),
                        );
                        continue;
                    }
                    MeterCheckResult::SoftExceeded |
                    MeterCheckResult::Warning => {}
                    MeterCheckResult::Ok => {}
                }
            }

        let attempt = match prepare_provider_attempt(
            provider, i, &req_body, model, is_anthropic,
            path_override, user_prompt, request_id, true,
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
        let mutations_json_owned = attempt.mutations_json;
        let effective_model = attempt.effective_model;
        let cross_dialect = attempt.cross_dialect;

        let (raw_bytes_opt, raw_ct_opt) = match &raw_body {
            Some((b, ct)) => (Some(b), ct.as_deref()),
            None => (None, None),
        };
        let use_raw = raw_bytes_opt.is_some() && !cross_dialect && mutations_json_owned.is_none();

        // Capture for spawn
        let needs_sse_transform  = adapter.needs_sse_transform();
        let adapts_to_anthropic  = is_anthropic;

        let provider_start = std::time::Instant::now();
        match try_provider(
            client, provider, adapter.as_ref(), &upstream_body,
            if use_raw { raw_bytes_opt } else { None },
            if use_raw { raw_ct_opt } else { None },
            true,
            path_override,
            client_headers,
        ).await {
            Ok(resp) if resp.status().is_success() => {
                let provider_ms = provider_start.elapsed().as_millis() as f64;
                if let Some(m) = crate::tools::telemetry::METRICS.get() {
                    m.upstream_duration_ms.with_label_values(&[&provider.name, "ok"]).observe(provider_ms);
                }
                let resp_status  = resp.status().as_u16() as i16;
                let resp_headers = resp.headers().clone();

                // Increment provider meter for the streaming call
                // (token counts are estimated since we don't have final usage yet;
                // the reconcile loop picks up actual counts from the DB)
                if let Some(meter) = provider_meter {
                    meter.increment(&provider.id, 0, 0);
                }

                // Captured here (adapter/provider still in scope) for the provider-call audit log.
                let vendor_owned     = adapter.vendor().to_string();
                let pcl_url          = format!("{}{}", provider.endpoint.trim_end_matches('/'), adapter.stream_path());
                let pcl_request_body = serde_json::to_string(&upstream_body).unwrap_or_default();
                let provider_start_for_log = provider_start;

                // --- Phase 1+F-6: true streaming with event-boundary aware SSE transform ----
                // Channel 1: bytes → client response body
                let (body_tx, body_rx) = tokio::sync::mpsc::channel::<Bytes>(128);
                // Channel 2: bytes → background logging task
                let (log_tx, log_rx)   = tokio::sync::mpsc::channel::<Bytes>(128);

                // Owned values for the upstream reader task
                let request_id_s = request_id.to_string();
                let log_tx2      = log_tx.clone();
                // Move the adapter into the task for per-event SSE transforms.
                let stream_adapter = adapter_for_provider(provider);

                let mut upstream_stream = resp.bytes_stream();
                tokio::spawn(async move {
                    // Stateful translator for Anthropic clients (OAI SSE → Ant SSE)
                    let mut ant_translator = if adapts_to_anthropic {
                        Some(OpenAiToAnthropicSse::new("msg_gw", "unknown"))
                    } else {
                        None
                    };

                    // F-6: event-boundary buffers so transforms see complete SSE events.
                    // ant_frame_buf: buffers raw upstream bytes when the upstream uses a
                    //   non-OAI SSE format (Anthropic, Gemini) — we need complete events.
                    // oai_to_ant_buf: buffers OAI-format bytes when the client speaks Anthropic
                    //   but the upstream is already OAI (chunks may arrive mid-event).
                    let mut ant_frame_buf: Option<SseFrameBuffer> = if needs_sse_transform {
                        Some(SseFrameBuffer::new())
                    } else {
                        None
                    };
                    let mut oai_to_ant_buf: Option<SseFrameBuffer> =
                        if adapts_to_anthropic && !needs_sse_transform {
                            Some(SseFrameBuffer::new())
                        } else {
                            None
                        };

                    while let Some(chunk_result) = upstream_stream.next().await {
                        match chunk_result {
                            Ok(raw_chunk) => {
                                let raw_str = String::from_utf8_lossy(&raw_chunk);

                                // Step 1: collect complete OAI-format SSE events.
                                // For upstream formats that differ from OAI (Anthropic, Gemini),
                                // buffer until we have full events then apply the adapter transform.
                                // For OAI-compatible upstreams, pass the raw chunk through directly.
                                let oai_chunks: Vec<Bytes> = if let Some(ref mut buf) = ant_frame_buf {
                                    buf.feed(&raw_str).into_iter()
                                        .map(|event| {
                                            let converted = stream_adapter.transform_stream_chunk(&event);
                                            Bytes::from(converted.into_bytes())
                                        })
                                        .collect()
                                } else {
                                    vec![raw_chunk]
                                };

                                if oai_chunks.is_empty() {
                                    continue; // partial event still accumulating in frame buffer
                                }

                                // Step 2: optionally translate OAI SSE → Anthropic SSE.
                                for oai_chunk in oai_chunks {
                                    let client_chunk: Bytes = if let Some(ref mut t) = ant_translator {
                                        let oai_str = String::from_utf8_lossy(&oai_chunk);
                                        let translated: String = if let Some(ref mut buf) = oai_to_ant_buf {
                                            // Buffer OAI chunks to complete events before translating.
                                            buf.feed(&oai_str).into_iter()
                                                .map(|event| t.translate(&event))
                                                .collect()
                                        } else {
                                            // oai_chunk is already a complete event (from ant_frame_buf).
                                            t.translate(&oai_str)
                                        };
                                        if translated.is_empty() { continue; }
                                        Bytes::from(translated.into_bytes())
                                    } else {
                                        oai_chunk
                                    };

                                    let _ = log_tx2.send(client_chunk.clone()).await;
                                    if body_tx.send(client_chunk).await.is_err() {
                                        return; // client disconnected
                                    }
                                }
                            }
                            Err(e) => {
                                tracing::warn!("[stream] {} chunk error: {}", request_id_s, e);
                                break;
                            }
                        }
                    }
                    // Dropping log_tx2 and body_tx signals end-of-stream
                });

                // Background logging task — fires after stream is done
                {
                    let request_id_owned    = request_id.to_string();
                    let app_id_owned        = app_id.to_string();
                    let app_name_owned      = app_name.to_string();
                    let model_owned         = effective_model.to_string();
                    let method_owned        = method.to_string();
                    let path_owned          = path.to_string();
                    let source_ip_owned     = source_ip.to_string();
                    let api_key_prefix_owned = api_key_prefix.to_string();
                    let provider_id_owned   = provider.id.clone();
                    let provider_name_owned = provider.name.clone();
                    let user_prompt_owned   = user_prompt.clone();
                    let log_writer_owned    = log_writer.clone();
                    let action_owned        = action.clone();
                    let pipeline_trace_owned = super::helpers::append_routing_stage(
                        &pipeline_trace, slot, &provider.name, &effective_model,
                    );
                    let final_decision_owned = final_decision.clone();
                    let blocked_stage_owned  = blocked_stage.clone();
                    let classification_reason_owned = classification_reason.map(|s| s.to_string());
                    let threat_knowledge_matches_owned = threat_knowledge_matches.clone();
                    let detector_owned       = detector.map(|s| s.to_string());
                    let threat_title_owned   = threat_title.map(|s| s.to_string());
                    let excerpt_owned        = excerpt.map(|s| s.to_string());
                    let threat_fw_owned      = threat_framework_id.map(|s| s.to_string());
                    let classifier_id_owned  = classifier_id.map(|s| s.to_string());
                    let classifier_name_owned = classifier_name.map(|s| s.to_string());
                    let t2_reason_owned      = t2_reason.clone();
                    let mutations_owned      = mutations_json_owned;
                    let user_agent_owned     = user_agent.map(|s| s.to_string());
                    let raw_input_payload_owned = raw_input_payload.map(|s| s.to_string());

                    let mut log_rx_owned = log_rx;
                    // Capture policy_store for output scanning (G2 fix)
                    let policy_store_clone = policy_store.clone();
                    let request_id_for_scan  = request_id.to_string();

                    // Content Quality Scanning (streaming): detect-and-log-only, never
                    // block/redact — bytes are already relayed to the client by the time
                    // this background task's scan completes, same asymmetry as the
                    // existing streaming output-scan above.
                    let client_owned = client.clone();
                    let prompt_text_owned = prompt_text.to_string();
                    let cq_enabled = app_enable_content_quality_scan;
                    let cq_mode_owned = app_content_quality_mode.map(|s| s.to_string());
                    let cq_threshold = app_content_quality_threshold;

                    tokio::spawn(async move {
                        use crate::pipeline_types::format_option;

                        let cap = max_scan_bytes();
                        let mut sse_body: Vec<u8> = Vec::new();
                        while let Some(chunk) = log_rx_owned.recv().await {
                            // Keep draining the channel unconditionally so the upstream
                            // relay (which tees into this channel before sending to the
                            // client) never blocks on a full log_rx — only stop *storing*
                            // bytes once the scan/audit cap is reached (SEC-C2).
                            if sse_body.len() < cap {
                                let remaining = cap - sse_body.len();
                                if chunk.len() <= remaining {
                                    sse_body.extend_from_slice(&chunk);
                                } else {
                                    sse_body.extend_from_slice(&chunk[..remaining]);
                                }
                            }
                        }
                        let elapsed      = start_time.elapsed().as_millis() as i64;
                        let (stream_reply, tokens_in, tokens_out) = extract_sse_reply(&sse_body);

                        // Scan assembled reply against output-scoped detectors (streaming bypass fix)
                        let mut streaming_output_flagged    = false;
                        let mut streaming_output_framework_id: Option<String> = None;
                        let mut streaming_output_confidence: Option<f32>      = None;
                        let mut streaming_output_detector:   Option<String>   = None;

                        if let Some(reply_text) = &stream_reply {
                            let scan_result = super::output_scan::scan_output_impl(
                                &policy_store_clone, &request_id_for_scan, &app_id_owned, &app_name_owned, reply_text,
                            );
                            streaming_output_flagged    = scan_result.flagged;
                            streaming_output_framework_id.clone_from(&scan_result.category);
                            streaming_output_confidence = Some(scan_result.confidence);
                            streaming_output_detector.clone_from(&scan_result.detector_name);

                            if scan_result.blocked || streaming_output_flagged || scan_result.redacted_text.is_some() {
                                streaming_output_flagged = true;
                                tracing::warn!(
                                    "[stream-output] {} OUTPUT_DETECTED app=\"{}\" detector={} confidence={:.2}",
                                    request_id_for_scan, &app_name_owned,
                                    format_option(&scan_result.detector_name), scan_result.confidence
                                );
                            }
                        }

                        // Content Quality Scanning (streaming, detect-and-log-only — see note above)
                        let mut content_quality_scanned       = false;
                        let mut content_quality_groundedness: Option<f32> = None;
                        let mut content_quality_relevance:    Option<f32> = None;
                        let mut content_quality_hallucination: Option<f32> = None;
                        let mut content_quality_flagged       = false;
                        let mut content_quality_action: Option<String> = None;
                        let mut content_quality_reason: Option<String> = None;

                        if cq_enabled
                            && let Some(reply_text) = &stream_reply
                            && let Some(scores) = crate::agents::content_quality::client::run_content_quality_scan(
                                &client_owned, &policy_store_clone, &request_id_for_scan,
                                &app_id_owned, &app_name_owned, &prompt_text_owned, reply_text, &log_writer_owned,
                            ).await {
                                content_quality_scanned = true;
                                content_quality_groundedness = scores.groundedness;
                                content_quality_relevance = scores.relevance;
                                content_quality_hallucination = scores.hallucination;
                                content_quality_reason = scores.reason.clone();

                                let decision = crate::agents::content_quality::rules::evaluate_content_quality(
                                    &scores, cq_mode_owned.as_deref(), cq_threshold, &policy_store_clone,
                                );
                                if let Some(action) = decision {
                                    content_quality_flagged = true;
                                    use crate::agents::content_quality::rules::ContentQualityEnforcementAction as CQA;
                                    // Streaming can only ever detect-and-log — bytes are already
                                    // relayed to the client by the time this scan completes, so
                                    // Block/Redact/Flag all collapse to "flagged" here rather than
                                    // claiming an enforcement action that didn't actually happen
                                    // (unlike the non-streaming path, where these are real outcomes).
                                    content_quality_action = Some(match action {
                                        CQA::Monitor => "monitored".to_string(),
                                        CQA::Block | CQA::Redact | CQA::Flag => "flagged".to_string(),
                                    });
                                }
                            }

                        // G5: Redact sensitive fields before logging (streaming fix)
                        let redacted_user_prompt = user_prompt_owned.as_ref().map(|up| redact_or_keep(up, &policy_store_clone, &app_id_owned));
                        let redacted_stream_reply = stream_reply.as_ref().map(|ar| redact_or_keep(ar, &policy_store_clone, &app_id_owned));

                        // Provider-call audit log (full request/response payload for admin/auditor review) —
                        // streaming responses previously had no entry here at all.
                        let raw_sse_text = String::from_utf8_lossy(&sse_body).into_owned();
                        drop(sse_body); // last use was above — free the capped buffer before redaction allocates more copies
                        let redacted_pcl_response = redact_or_keep(&raw_sse_text, &policy_store_clone, &app_id_owned);
                        log_writer_owned.log_provider_call(
                            Some(&request_id_owned), "upstream", "pipeline",
                            Some(&app_id_owned), Some(&app_name_owned),
                            Some(provider_id_owned.as_str()), Some(provider_name_owned.as_str()),
                            Some(vendor_owned.as_str()),
                            Some(&model_owned),
                            Some(pcl_url.as_str()),
                            Some(pcl_request_body.clone()),
                            Some(redacted_pcl_response),
                            tokens_in, tokens_out,
                            provider_start_for_log.elapsed().as_millis() as i64,
                            Some(resp_status),
                            true,
                            None,
                        );

                        // Determine effective streaming action (output flagging + input status)
                        let streaming_action = if streaming_output_flagged {
                            if action_owned.as_deref() == Some("redacted") {
                                "redacted"
                            } else {
                                "output_flagged"
                            }
                        } else {
                            action_owned.as_deref().unwrap_or("forwarded")
                        };

                        tracing::info!("[ok]      {} {} app=\"{}\" provider=\"{}\" status={} elapsed={}ms (streaming)",
                            request_id_owned, streaming_action,
                            app_name_owned, provider_name_owned, resp_status, elapsed);
                        log_writer_owned.note_successful_request(&app_id_owned);
                        log_writer_owned.log_entry(LogEntry {
                            request_id: request_id_owned.clone(),
                            app_id: app_id_owned.clone(),
                            app_name: app_name_owned.clone(),
                            model: model_owned.clone(),
                            method: method_owned.clone(),
                            path: path_owned.clone(),
                            source_ip: source_ip_owned.clone(),
                            app_api_key: api_key_prefix_owned.clone(),
                            tokens_in: tokens_in.unwrap_or(0),
                            tokens_out: tokens_out.unwrap_or(0),
                            duration_ms: elapsed,
                            status_code: resp_status,
                            flagged: flagged || streaming_output_flagged,
                            detector: detector_owned.clone(),
                            confidence,
                            action: Some(streaming_action.to_string()),
                            threat_title: threat_title_owned.clone(),
                            excerpt: excerpt_owned.clone(),
                            framework_id: threat_fw_owned.clone(),
                            user_prompt: redacted_user_prompt,
                            response_body: redacted_stream_reply,
                            upstream_provider_id: Some(provider_id_owned.clone()),
                            upstream_provider_name: Some(provider_name_owned.clone()),
                            classifier_provider_id: classifier_id_owned.clone(),
                            classifier_provider_name: classifier_name_owned.clone(),
                            output_scan_flagged: streaming_output_flagged,
                            output_scan_framework_id: streaming_output_framework_id.clone(),
                            output_scan_confidence: streaming_output_confidence,
                            output_scan_detector: streaming_output_detector.clone(),
                            pipeline_trace: pipeline_trace_owned,
                            final_decision: final_decision_owned,
                            blocked_stage: blocked_stage_owned,
                            classification_reason: classification_reason_owned,
                            threat_knowledge_matches: threat_knowledge_matches_owned,
                            t2_flagged,
                            t2_confidence,
                            t2_reason: t2_reason_owned,
                            request_mutations: mutations_owned,
                            redaction_summary: input_redaction_summary.clone(),
                            user_agent: user_agent_owned,
                            raw_input_payload: raw_input_payload_owned,
                            raw_output_payload: Some(raw_sse_text),
                            content_quality_scanned,
                            content_quality_groundedness,
                            content_quality_relevance,
                            content_quality_hallucination,
                            content_quality_flagged,
                            content_quality_action,
                            content_quality_reason,
                            ..Default::default()
                        });
                    });
                }

                // Build streaming response from the body channel
                let body_stream = futures::stream::unfold(body_rx, |mut rx| async move {
                    rx.recv().await.map(|b| (Ok::<_, std::convert::Infallible>(b), rx))
                });

                let mut response = Response::new(axum::body::Body::from_stream(body_stream));
                *response.status_mut() = StatusCode::OK;
                response.headers_mut().insert("content-type", "text/event-stream".parse().unwrap());
                response.headers_mut().insert("cache-control", "no-cache".parse().unwrap());
                response.headers_mut().insert("x-accel-buffering", "no".parse().unwrap());
                relay_response_headers(&resp_headers, &mut response);
                return Ok(response);
            }

            Ok(resp) => {
                let status = resp.status();
                last_err = if status.is_client_error() {
                    format!("Client error from {}: {}", provider.name, status)
                } else {
                    format!("Upstream error from {}: {}", provider.name, status)
                };

                let body_text = resp.text().await.unwrap_or_default();
                let redacted_resp = Some(redact_or_keep(&body_text, policy_store, app_id));
                let pcl_url = format!("{}{}", provider.endpoint.trim_end_matches('/'), adapter.stream_path());
                log_provider_failure(
                    log_writer, request_id, app_id, app_name, provider, slot,
                    adapter.vendor(), effective_model.as_str(), &pcl_url,
                    &serde_json::to_string(&upstream_body).unwrap_or_default(),
                    redacted_resp,
                    Some(status.as_u16() as i16),
                    Some(&format!("Upstream error {}", status.as_u16())),
                    provider_start.elapsed().as_millis() as i64,
                );
            }

            Err(e) => {
                tracing::warn!("[forward] {} FAILED {} provider: \"{}\" error={}", request_id, slot, provider.name, e);
                let err_str = e.to_string();
                let redacted = redact_or_keep(&err_str, policy_store, app_id);
                let pcl_url = format!("{}{}", provider.endpoint.trim_end_matches('/'), adapter.stream_path());
                log_provider_failure(
                    log_writer, request_id, app_id, app_name, provider, slot,
                    adapter.vendor(), effective_model.as_str(), &pcl_url,
                    &serde_json::to_string(&upstream_body).unwrap_or_default(),
                    Some(redacted), None, Some("Upstream unreachable"),
                    provider_start.elapsed().as_millis() as i64,
                );

                last_err = err_str;
            }
        }
    }

    let elapsed = start_time.elapsed().as_millis() as i64;
    // G5: redact sensitive fields (user_prompt) for logging.
    let log_user_prompt = crate::agents::redaction::redact_option(user_prompt, policy_store, app_id);
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
        status_code: 502,
        action: Some("failed".to_string()),
        threat_title: Some(last_err.clone()),
        framework_id: threat_framework_id.map(|s| s.to_string()),
        user_prompt: log_user_prompt,
        classifier_provider_id: classifier_id.map(|s| s.to_string()),
        classifier_provider_name: classifier_name.map(|s| s.to_string()),
        classification_reason: classification_reason.map(|s| s.to_string()),
        threat_knowledge_matches,
        t2_flagged,
        t2_confidence,
        t2_reason: t2_reason.clone(),
        redaction_summary: input_redaction_summary,
        user_agent: user_agent.map(|s| s.to_string()),
        raw_input_payload: raw_input_payload.map(|s| s.to_string()),
        ..Default::default()
    });

    Ok(format_gateway_error(
        &format!("All upstream providers failed: {}", last_err),
        "api_error", "service_unavailable", request_id, is_anthropic,
        StatusCode::BAD_GATEWAY,
    ))
}
