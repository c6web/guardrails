//! LLM-based prompt classification.
//!
//! Sends prompts to a configured classifier provider and parses structured JSON
//! responses (verdict, framework_id, confidence, reason). The classifier provider
//! is just an AI LLM provider in the "classifier" role, so it dispatches through
//! the same per-vendor `LlmAdapter` as upstream forwarding (selected via
//! `ProviderConfig.vendor`).

use reqwest::Client;
use serde_json::Value;

use crate::policy::{ProviderConfig, DetectorStore};
use crate::adapters::llm::adapter_for_provider;
use crate::agents::redaction::redact_or_keep;

// ── Structured output from the classifier ─────────────────────────────────────

#[derive(Clone, Debug)]
pub struct ClassifyResult {
    pub is_attack:  bool,
    pub framework_id:   String,   // detection framework ID (e.g. "owasp-2025-llm01")
    pub confidence: f32,
    pub reason:     String,
}

// ── Classifier execution ─────────────────────────────────────────────────────

/// Send a single chat message to an LLM provider and return the raw assistant text.
///
/// This is the shared HTTP transport used by `classify`, T2 analysis, and the
/// Knowledge Developer. Returns Err on network/parse failures — callers treat
/// these as fail-open.
///
/// `target_max_tokens` is the caller's desired output-token budget (see
/// `constants.rs` for the named per-call-type values) — it is capped down to
/// the provider's configured `max_output_token` when that's lower, but the
/// configured ceiling itself is never sent upstream directly.
///
/// Before building the request, the input is checked against the provider's
/// configured `max_input_token` (if set) and rejected with `Err` if too large —
/// the `classify` caller detects this specific error and returns a block verdict
/// so that oversize input cannot be used to bypass the classifier.
pub async fn llm_complete(
    client:            &Client,
    provider:          &ProviderConfig,
    system_prompt:     &str,
    user_prompt:       &str,
    call_type:         &str,
    log_writer:        &crate::tools::log_writer::LogWriter,
    request_id:        Option<&str>,
    policy_store:      &DetectorStore,
    app_id:            &str,
    target_max_tokens: i32,
) -> Result<String, String> {
    if let Some(max_input_token) = provider.max_input_token {
        let approx_input_tokens = crate::tools::token_estimator::estimate_token_count(user_prompt);
        if approx_input_tokens > (max_input_token as usize) {
            return Err(format!(
                "Provider {} input token limit exceeded ({} > {})",
                provider.name, approx_input_tokens, max_input_token
            ));
        }
    }

    // Request-time DNS re-validation to prevent DNS-rebinding SSRF.
    if !crate::policy::endpoint_validation::revalidate_endpoint(&provider.endpoint).await {
        return Err(format!(
            "Provider {} endpoint failed DNS re-validation (potential SSRF)",
            provider.name
        ));
    }

    // Vendor-host binding: the endpoint host must match the vendor's domain.
    if !crate::policy::endpoint_validation::verify_vendor_host(&provider.endpoint, &provider.vendor) {
        return Err(format!(
            "Provider {} endpoint host does not match vendor \"{}\"",
            provider.name, provider.vendor
        ));
    }

    let adapter  = adapter_for_provider(provider);
    let model    = provider.model.as_deref().unwrap_or("unknown");
    let url      = format!("{}{}", provider.endpoint.trim_end_matches('/'), adapter.chat_path());
    let classify_max_tokens = Some(
        provider.max_output_token
            .map(|ceiling| ceiling.min(target_max_tokens))
            .unwrap_or(target_max_tokens)
    );
    let body     = adapter.build_classify_request(model, system_prompt, user_prompt, classify_max_tokens);
    let req_str  = serde_json::to_string(&body).unwrap_or_default();

    // G5 fix: redact PII from request/response before logging provider calls
    let redacted_req_str = Some(redact_or_keep(&req_str, policy_store, app_id));

    // Transport-level failures (including client-side timeout) are retried —
    // slow-but-working classifier endpoints otherwise get treated as fully
    // down on any response past `timeout_ms`. Non-success HTTP statuses are
    // NOT retried here; those are handled separately below.
    const MAX_ATTEMPTS: u32 = 3;
    const RETRY_DELAY: std::time::Duration = std::time::Duration::from_secs(2);

    let call_start = std::time::Instant::now();
    let mut send_result = None;
    let mut attempts_made: u32 = 0;
    for attempt in 1..=MAX_ATTEMPTS {
        attempts_made = attempt;
        let mut req = client.post(&url).body(serde_json::to_vec(&body).unwrap_or_default());
        for (name, value) in adapter.build_headers(provider) {
            req = req.header(name, value);
        }
        if provider.timeout_ms > 0 {
            req = req.timeout(std::time::Duration::from_millis(provider.timeout_ms));
        }
        match req.send().await {
            Ok(r) => {
                send_result = Some(Ok(r));
                break;
            }
            Err(e) if attempt < MAX_ATTEMPTS => {
                tracing::warn!(
                    "[llm_complete] {} send failed (attempt {}/{}) provider=\"{}\" timeout={}: {} — retrying in {}s",
                    request_id.unwrap_or("n/a"), attempt, MAX_ATTEMPTS, provider.name, e.is_timeout(), e, RETRY_DELAY.as_secs()
                );
                tokio::time::sleep(RETRY_DELAY).await;
            }
            Err(e) => send_result = Some(Err(e)),
        }
    }
    let send_result = send_result.expect("loop always assigns before exiting");

    let resp = match send_result {
        Err(e) => {
            let elapsed = call_start.elapsed().as_millis() as i64;
            let is_timeout = e.is_timeout();
            let kind_tag = if is_timeout {
                format!("timeout after {}ms", provider.timeout_ms)
            } else {
                "connection error".to_string()
            };
            let err_str = format!("[{}] {} (attempts={})", kind_tag, e, attempts_made);
            log_writer.log_provider_call(
                request_id, call_type, "pipeline",
                None, None,
                Some(provider.id.as_str()), Some(provider.name.as_str()),
                Some(adapter.vendor()), Some(model),
                Some(url.as_str()),
                redacted_req_str.clone(), None,
                None, None, elapsed, None, false,
                Some(&err_str),
            );
            tracing::warn!(
                "[llm_complete] {} FAILED provider=\"{}\" {} after {} attempt(s), elapsed={}ms",
                request_id.unwrap_or("n/a"), provider.name, kind_tag, attempts_made, elapsed
            );
            return Err(format!("LLM request failed: {}", err_str));
        }
        Ok(r) => r,
    };

    if !resp.status().is_success() {
        let status     = resp.status();
        let body_text  = resp.text().await.unwrap_or_default();
        let elapsed    = call_start.elapsed().as_millis() as i64;
        // G5 fix: redact PII from response before logging
        let redacted_resp = Some(redact_or_keep(&body_text, policy_store, app_id));
        log_writer.log_provider_call(
            request_id, call_type, "pipeline",
            None, None,
            Some(provider.id.as_str()), Some(provider.name.as_str()),
            Some(adapter.vendor()), Some(model),
            Some(url.as_str()),
            redacted_req_str.clone(), redacted_resp,
            None, None, elapsed,
            Some(status.as_u16() as i16), false,
            Some(&format!("HTTP {}", status.as_u16())),
        );
        return Err(format!("LLM provider returned {}: {}", status, body_text));
    }

    let resp_bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    let elapsed    = call_start.elapsed().as_millis() as i64;
    let parsed: Value = serde_json::from_slice(&resp_bytes)
        .map_err(|e| format!("Invalid LLM response: {}", e))?;

    let (tin, tout) = adapter.extract_usage(&parsed);
    // G5 fix: redact PII from response before logging
    let resp_json = serde_json::to_string(&parsed).unwrap_or_default();
    let redacted_resp = Some(redact_or_keep(&resp_json, policy_store, app_id));
    log_writer.log_provider_call(
        request_id, call_type, "pipeline",
        None, None,
        Some(provider.id.as_str()), Some(provider.name.as_str()),
        Some(adapter.vendor()), Some(model),
        Some(url.as_str()),
        redacted_req_str.clone(),
        redacted_resp,
        tin, tout, elapsed,
        Some(200i16), true, None,
    );

    Ok(adapter.extract_classify_text(&parsed).unwrap_or("").trim().to_string())
}

/// Run LLM classification against a single provider.
///
/// Returns Ok(ClassifyResult) on success (even if the result is SAFE).
/// Returns Err on network/parse failures — callers treat these as fail-open.
pub async fn classify(
    client:        &Client,
    prompt:        &str,
    provider:      Option<&ProviderConfig>,
    threshold:     f32,
    system_prompt: &str,
    log_writer:    &crate::tools::log_writer::LogWriter,
    request_id:    Option<&str>,
    policy_store:  &DetectorStore,
    app_id:        &str,
) -> Result<ClassifyResult, String> {
    let Some(p) = provider else {
        return Ok(ClassifyResult { is_attack: false, framework_id: String::new(), confidence: 0.0, reason: String::new() });
    };

    let raw_content = match llm_complete(
        client, p, system_prompt, prompt, "classifier", log_writer, request_id, policy_store, app_id,
        crate::constants::CLASSIFICATION_MAX_OUTPUT_TOKENS,
    ).await {
        Ok(content) => content,
        Err(e) => {
            if e.contains("input token limit exceeded") {
                return Ok(ClassifyResult {
                    is_attack: true,
                    framework_id: "oversized-input".to_string(),
                    confidence: 1.0,
                    reason: "Input exceeds classifier token limit; blocking as suspicious".to_string(),
                });
            }
            return Err(e);
        }
    };
    parse_classifier_content(&raw_content, threshold)
}

// ── Response content parser (shared for all API formats) ─────────────────────

fn parse_classifier_content(content: &str, threshold: f32) -> Result<ClassifyResult, String> {
    // Strip optional markdown code fences
    let inner = super::strip_code_fence(content);

    if let Ok(result_json) = serde_json::from_str::<Value>(inner) {
        let (flagged, confidence_opt, reason_opt) = super::parse_verdict(&result_json);
        let confidence   = confidence_opt.unwrap_or(0.0).clamp(0.0, 1.0);
        let reason       = reason_opt.unwrap_or_default();
        let framework_id = result_json.get("framework_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let is_attack    = flagged && confidence >= threshold;

        return Ok(ClassifyResult { is_attack, framework_id, confidence, reason });
    }

    // Non-JSON — classifier returned unparseable content.
    // Return Err so the pipeline honors SCAN_FAIL_CLOSED (SEC-M5).
    Err("classifier response was not valid JSON".to_string())
}


