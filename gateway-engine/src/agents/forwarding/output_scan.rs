/// Output scanning and response building for non-streaming forwarding.
use axum::body::Bytes;
use serde_json::Value;

use crate::adapters::llm::anthropic;
use crate::pipeline_types::format_option;
use crate::policy::{DetectorConfig, DetectorStore};
use crate::agents::scanning::output_scanner::{scan_with_detector_configs, OutputScanResult};

/// Scan the assistant reply against output-scoped detectors (scanning_scope = "output" or "both").
/// Respects per-app detector overrides via `app_detector_ids` — an app with `detectors_custom=true`
/// and no output-scope selections effectively has output scanning disabled.
pub fn scan_output_impl(
    policy_store: &DetectorStore,
    request_id: &str,
    app_id: &str,
    app_name: &str,
    reply: &str,
) -> OutputScanResult {
    let mut result = OutputScanResult {
        flagged: false,
        category: None,
        confidence: 0.0,
        detector_name: None,
        redacted_text: None,
        blocked: false,
        block_action: None,
    };

    // Output scanning using regular detectors with scanning_scope = "output" or "both"
    {
        let all_detectors = policy_store.detectors.read().unwrap_or_else(|e| e.into_inner());
        let app_detector_map = policy_store.app_detector_ids.read().unwrap_or_else(|e| e.into_inner());
        let scoped: Vec<DetectorConfig> = all_detectors.iter()
            .filter(|d| d.scanning_scope == "output" || d.scanning_scope == "both")
            .filter(|d| {
                match app_detector_map.get(app_id) {
                    None => true,                                 // no override — all active detectors
                    Some(ids) => ids.contains(&d.id),             // app override — only selected detectors
                }
            })
            .cloned().collect();

        let app_result = scan_with_detector_configs(&scoped, reply);
        if app_result.flagged {
            result.flagged = true;
            if result.detector_name.is_none() {
                result.category.clone_from(&app_result.category);
                result.confidence = app_result.confidence;
                result.detector_name.clone_from(&app_result.detector_name);
            }
            tracing::warn!(
                "[output] {} APP_OUTPUT_FLAGGED app=\"{}\" confidence={:.2} detector={}",
                request_id, app_name, app_result.confidence,
                format_option(&app_result.detector_name)
            );

            // Apply block > redact > flag precedence across all detectors (use actual matches, not config)
            if app_result.blocked {
                result.blocked = true;
                result.block_action = Some("blocked_output".to_string());
                // Block takes precedence: don't return redacted text
                result.redacted_text = None;
            } else if let Some(rt) = app_result.redacted_text {
                result.redacted_text = Some(rt);
                tracing::info!(
                    "[redact]   {} OUTPUT_REDACTED app=\"{}\" detector={}",
                    request_id, app_name,
                    format_option(&result.detector_name)
                );
            }
        }
    }

    result
}

/// Build the final response bytes for a successful provider response.
pub fn build_response_bytes(
    use_raw: bool,
    output_was_modified: bool,
    raw_resp_bytes: Bytes,
    canonical: Value,
    redacted_reply: &Option<String>,
    is_anthropic: bool,
) -> Bytes {
    if use_raw && !output_was_modified {
        raw_resp_bytes
    } else if is_anthropic {
        let mut resp_canonical = canonical;
        if let Some(redacted) = redacted_reply
            && let Some(choices) = resp_canonical.get_mut("choices").and_then(|c| c.as_array_mut()) {
                for choice in choices.iter_mut() {
                    if let Some(content) = choice.pointer_mut("/message/content")
                        && content.is_string() {
                            *content = Value::String(redacted.clone());
                        }
                }
            }
        Bytes::from(serde_json::to_vec(&anthropic::translate_openai_to_anthropic(resp_canonical)).unwrap_or_default())
    } else {
        let mut resp_canonical = canonical;
        if let Some(redacted) = redacted_reply
            && let Some(choices) = resp_canonical.get_mut("choices").and_then(|c| c.as_array_mut()) {
                for choice in choices.iter_mut() {
                    if let Some(content) = choice.pointer_mut("/message/content")
                        && content.is_string() {
                            *content = Value::String(redacted.clone());
                        }
                }
            }
        Bytes::from(serde_json::to_vec(&resp_canonical).unwrap_or_default())
    }
}

/// Redact tool_call arguments in a canonical OpenAI JSON response using the given detectors.
/// Applies all redact-mode regex detectors to `choices[].message.tool_calls[].function.arguments`.
pub fn redact_tool_args_in_canonical(canonical: &mut Value, detectors: &[crate::policy::DetectorConfig]) {
    if detectors.is_empty() || canonical == &Value::Null {
        return;
    }

    // Collect (choice_idx, tc_idx, redacted) tuples for later mutation
    let mut updates: Vec<(usize, usize, String)> = Vec::new();
    if let Some(choices) = canonical.get("choices").and_then(|v| v.as_array()) {
        for (ci, choice) in choices.iter().enumerate() {
            if let Some(tool_calls) = choice.pointer("/message/tool_calls").and_then(|v| v.as_array()) {
                for (ti, tc) in tool_calls.iter().enumerate() {
                    if let Some(args) = tc.pointer("/function/arguments").and_then(|a| a.as_str()) {
                        let mut redacted_args = args.to_string();
                        for detector in detectors {
                            if detector.mode != "redact" { continue; }
                            redacted_args = crate::agents::redaction::redact_text_with_detector(&redacted_args, detector);
                        }
                        if redacted_args != args {
                            updates.push((ci, ti, redacted_args));
                        }
                    }
                }
            }
        }
    }

    // Apply collected updates
    for (ci, ti, redacted_args) in updates {
        if let Some(tc) = canonical
            .pointer_mut(&format!("/choices/{ci}/message/tool_calls/{ti}"))
            .and_then(|v| v.as_object_mut())
            && let Some(func) = tc.get_mut("function").and_then(|f| f.as_object_mut())
        {
            *func.get_mut("arguments").unwrap() = Value::String(redacted_args);
        }
    }
}
