//! Input redaction — replaces regex-matched spans in request content with a placeholder.
//!
//! Called only for `EnforcementAction::Redact` (mode="redact" + regex detector hit).
//! Walks `messages[].content`, top-level `prompt`, `system`, and OpenAI Responses API
//! fields (`input`, `instructions`) in the canonical JSON Value, applying each regex
//! pattern.  Returns the number of distinct fields mutated.

use crate::policy::DetectorConfig;
use regex::Regex;
use serde_json::Value;
use std::borrow::Cow;

/// Per-detector replacement counts for accurate attribution.
#[derive(Debug, Clone, PartialEq)]
pub struct RedactionCounts {
    pub total: usize,
    pub by_detector: std::collections::HashMap<String, usize>,
}

/// Apply a single detector's redaction rules to text.
/// Replaces keywords and regex matches with the detector's placeholder text.
pub fn redact_text_with_detector(text: &str, detector: &DetectorConfig) -> String {
    let placeholder = detector.redaction_placeholder.as_deref().unwrap_or("[REDACTED]");
    // Cow chaining: only allocate a full copy when a pattern/keyword actually matches
    // (`replace_all` returns `Cow::Borrowed` on no match) — avoids an unconditional
    // full-size copy per pattern/keyword on the common no-match path.
    let mut result: Cow<str> = Cow::Borrowed(text);
    match detector.rule_type.as_str() {
        "regex" => {
            for (_, re_opt) in &detector.compiled_patterns {
                if let Some(re) = re_opt
                    && let Cow::Owned(s) = re.replace_all(&result, regex::NoExpand(placeholder))
                {
                    result = Cow::Owned(s);
                }
            }
        }
        "keyword" => {
            for (_, re_opt) in &detector.compiled_patterns {
                if let Some(re) = re_opt
                    && let Cow::Owned(s) = re.replace_all(&result, regex::NoExpand(placeholder))
                {
                    result = Cow::Owned(s);
                }
            }
        }
        _ => {}
    }
    result.into_owned()
}

/// Apply redaction to all text-bearing content fields in `req_json`.
///
/// Uses the canonical `for_each_text_field_mut` visitor for standard text-bearing
/// fields (`messages[].content`, `input`, `prompt`, `system`, `instructions`),
/// plus separate tool-call-argument handling.
/// Only processes detectors with `mode == "redact"`.
/// Mutates `req_json` in-place and returns per-detector replacement counts.
pub fn redact_request(req_json: &mut Value, detectors: &[DetectorConfig]) -> RedactionCounts {
    let redact_detectors: Vec<&DetectorConfig> = detectors.iter().filter(|d| d.mode == "redact").collect();

    if redact_detectors.is_empty() {
        return RedactionCounts { total: 0, by_detector: std::collections::HashMap::new() };
    }

    let mut counts = RedactionCounts {
        total: 0,
        by_detector: std::collections::HashMap::new(),
    };

    // Canonical field visitor — covers messages[].content, input, prompt, system, instructions
    crate::content::extraction::for_each_text_field_mut(req_json, |s| {
        let mut tmp = Value::String(s.clone());
        let c = redact_string_multi(&mut tmp, &redact_detectors);
        if c.total > 0 {
            *s = tmp.as_str().unwrap().to_string();
        }
        merge_counts(&mut counts, &c);
    });

    // tool_calls[].function.arguments in each message (assistant/tool role)
    if let Some(messages) = req_json.get_mut("messages").and_then(|m| m.as_array_mut()) {
        for msg in messages.iter_mut() {
            if let Some(tool_calls) = msg.get_mut("tool_calls").and_then(|v| v.as_array_mut()) {
                crate::content::tool_calls::for_each_tool_call_args_mut(tool_calls, |args| {
                    let c = redact_string_multi(args, &redact_detectors);
                    merge_counts(&mut counts, &c);
                });
            }
        }
    }

    // top-level tool_calls[].function.arguments
    if let Some(tool_calls) = req_json.get_mut("tool_calls").and_then(|v| v.as_array_mut()) {
        crate::content::tool_calls::for_each_tool_call_args_mut(tool_calls, |args| {
            let c = redact_string_multi(args, &redact_detectors);
            merge_counts(&mut counts, &c);
        });
    }

    counts
}

fn merge_counts(target: &mut RedactionCounts, source: &RedactionCounts) {
    target.total += source.total;
    for (name, count) in &source.by_detector {
        *target.by_detector.entry(name.clone()).or_default() += count;
    }
}

/// Apply redaction and return a JSON-serializable summary of what was applied.
///
/// Returns `(total_fields_modified, summary_json)` where summary_json is an array of
/// objects with `detector`, `placeholder`, and `fields_redacted` fields.
/// Only includes detectors that had > 0 replacements.
pub fn redact_request_with_summary(req_json: &mut Value, detectors: &[DetectorConfig]) -> (usize, Option<String>) {
    let counts = redact_request(req_json, detectors);

    if counts.total == 0 {
        return (0, None);
    }

    // Build summary only for detectors with > 0 replacements
    let mut entry_objects: Vec<Value> = Vec::new();
    for d in detectors.iter() {
        let has_patterns = match d.rule_type.as_str() {
            "regex"   => !d.compiled_patterns.is_empty(),
            "keyword" => !d.keywords.is_empty(),
            _         => false,
        };
        if !has_patterns { continue; }
        let field_count = counts.by_detector.get(&d.name).copied().unwrap_or(0);
        if field_count == 0 { continue; } // R7: skip detectors with no replacements
        let mut entry = serde_json::Map::new();
        entry.insert("detector".to_string(), serde_json::Value::String(d.name.clone()));
        entry.insert(
            "placeholder".to_string(),
            serde_json::Value::String(d.redaction_placeholder.as_deref().unwrap_or("[REDACTED]").to_string()),
        );
        entry.insert(
            "fields_redacted".to_string(),
            serde_json::json!(field_count),
        );
        entry_objects.push(Value::Object(entry));
    }

    (counts.total, Some(serde_json::Value::Array(entry_objects).to_string()))
}

/// Per-detector counting variant of redact_string_value.
/// Counts regex matches per detector before applying replacements in-place.
fn redact_string_multi(val: &mut Value, detectors: &[&DetectorConfig]) -> RedactionCounts {
    let original = match val.as_str() {
        Some(s) => s.to_string(),
        None => return RedactionCounts { total: 0, by_detector: std::collections::HashMap::new() },
    };

    let mut counts = RedactionCounts { total: 0, by_detector: std::collections::HashMap::new() };
    let mut text = original;

    for detector in detectors {
        let mut match_count = 0usize;
        match detector.rule_type.as_str() {
            "regex" => {
                for (_, re_opt) in &detector.compiled_patterns {
                    if let Some(re) = re_opt {
                        match_count += re.find_iter(&text).count();
                    }
                }
            }
            "keyword" => {
                for (_, re_opt) in &detector.compiled_patterns {
                    if let Some(re) = re_opt {
                        match_count += re.find_iter(&text).count();
                    }
                }
            }
            _ => {}
        }

        if match_count > 0 {
            *counts.by_detector.entry(detector.name.clone()).or_default() += match_count;
            counts.total += match_count;
            text = redact_text_with_detector(&text, detector);
        }
    }

    if counts.total > 0 {
        *val = Value::String(text);
    }

    counts
}

/// Apply all redact-mode regex detectors to a plain string and return the sanitized version.
///
/// If no detectors are provided or none match, returns None (caller keeps original).
/// Uses NoExpand so placeholders like `[REDACTED-$0]` are literal, not template strings.
pub fn redact_string(text: &str, detectors: &[DetectorConfig]) -> Option<String> {
    let mut regex_detectors: Vec<(Regex, &str)> = Vec::new();
    for d in detectors.iter() {
        if d.rule_type != "regex" || d.compiled_patterns.is_empty() { continue; }
        let placeholder = d.redaction_placeholder.as_deref().unwrap_or("[REDACTED]");
        for (_, re_opt) in &d.compiled_patterns {
            if let Some(re) = re_opt.clone() {
                regex_detectors.push((re, placeholder));
            }
        }
    }

    if regex_detectors.is_empty() {
        return None;
    }

    // Chain via Cow so each pattern only allocates a fresh copy of the (potentially
    // large, e.g. capped streaming-output) text when it actually replaces something —
    // `replace_all` returns `Cow::Borrowed` on no match, so an unconditional
    // `.into_owned()` here would force a full-size copy per pattern even when nothing
    // matched, which compounds badly across many detectors/patterns on large buffers.
    let mut result: Cow<str> = Cow::Borrowed(text);
    let mut matched = false;
    for (re, placeholder) in &regex_detectors {
        if let Cow::Owned(s) = re.replace_all(&result, regex::NoExpand(placeholder)) {
            result = Cow::Owned(s);
            matched = true;
        }
    }
    if matched { Some(result.into_owned()) } else { None }
}

/// Redact sensitive text from an Option<String> using all redact-mode regex detectors.
///
/// Returns None if the input is None or no detectors match. Otherwise returns Some(redacted_string).
pub fn redact_option(text: &Option<String>, policy_store: &crate::policy::DetectorStore) -> Option<String> {
    text.as_ref().map(|s| redact_or_keep(s, policy_store))
}

/// Redact text using the policy store's redact-mode regex detectors.
/// Returns the redacted text if any redactions applied, otherwise returns the original.
pub fn redact_or_keep(text: &str, policy_store: &crate::policy::DetectorStore) -> String {
    let detectors = policy_store.redact_detectors();
    if detectors.is_empty() {
        return text.to_string();
    }
    redact_string(text, &detectors).unwrap_or_else(|| text.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_detector(patterns: Vec<&str>, placeholder: &str) -> DetectorConfig {
        let compiled: Vec<(String, Option<Regex>)> = patterns
            .iter()
            .map(|p| (p.to_string(), Regex::new(p).ok()))
            .collect();
        DetectorConfig {
            id: "test-1".to_string(),
            name: "test_detector".to_string(),
            keywords: vec![],
            rule_type: "regex".to_string(),
            compiled_patterns: compiled,
            mode: "redact".to_string(),
            framework_id: "".to_string(),
            scanning_scope: "input".to_string(),
            redaction_placeholder: Some(placeholder.to_string()),
        }
    }

    #[test]
    fn noexpand_dollar_sign_placeholder() {
        let detectors = make_detector(vec!["[A-Za-z]+@[a-z]+\\.[a-z]+"], "[REDACTED-$0]");
        let mut req_json = serde_json::json!({
            "messages": [
                {"role": "user", "content": "Contact john@example.com for info"}
            ]
        });
        let counts = redact_request(&mut req_json, &[detectors]);
        assert_eq!(counts.total, 1);
        let content = req_json["messages"][0]["content"].as_str().unwrap();
        assert_eq!(content, "Contact [REDACTED-$0] for info");
        assert!(!content.contains("john@example.com"));
    }

    #[test]
    fn noexpand_dollar_one_placeholder() {
        let detectors = make_detector(vec!["(\\d{3})[- ]?(\\d{4})"], "[$1-XXXX]");
        let mut req_json = serde_json::json!({
            "messages": [
                {"role": "user", "content": "Phone: 555-1234"}
            ]
        });
        let counts = redact_request(&mut req_json, &[detectors]);
        assert_eq!(counts.total, 1);
        let content = req_json["messages"][0]["content"].as_str().unwrap();
        assert_eq!(content, "Phone: [$1-XXXX]");
    }

    #[test]
    fn redact_content_parts_array() {
        let detectors = make_detector(vec!["[A-Za-z]+@[a-z]+\\.[a-z]+"], "[REDACTED]");
        let mut req_json = serde_json::json!({
            "messages": [
                {"role": "user", "content": [
                    {"type": "text", "text": "Email: alice@test.org"},
                    {"type": "image", "image_url": "https://img.com/1"}
                ]}
            ]
        });
        let counts = redact_request(&mut req_json, &[detectors]);
        assert_eq!(counts.total, 1);
        let content = req_json["messages"][0]["content"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["type"] == "text")
            .unwrap()["text"].as_str().unwrap();
        assert_eq!(content, "Email: [REDACTED]");
    }

    #[test]
    fn redact_multiple_messages() {
        let detectors = make_detector(vec!["[A-Za-z]+@[a-z]+\\.[a-z]+"], "[EMAIL_REDACTED]");
        let mut req_json = serde_json::json!({
            "messages": [
                {"role": "user", "content": "My email is alice@foo.com"},
                {"role": "assistant", "content": "Got it"},
                {"role": "user", "content": "Here is another: bob@bar.org"}
            ]
        });
        let counts = redact_request(&mut req_json, &[detectors]);
        assert_eq!(counts.total, 2);
        assert_eq!(req_json["messages"][0]["content"].as_str().unwrap(), "My email is [EMAIL_REDACTED]");
        assert_eq!(req_json["messages"][2]["content"].as_str().unwrap(), "Here is another: [EMAIL_REDACTED]");
    }

    #[test]
    fn redact_prompt_field() {
        let detectors = make_detector(vec!["\\b\\d{16}\\b"], "[CARD_REDACTED]");
        let mut req_json = serde_json::json!({
            "prompt": "Pay with 4111111111111111 now"
        });
        let counts = redact_request(&mut req_json, &[detectors]);
        assert_eq!(counts.total, 1);
        assert_eq!(req_json["prompt"].as_str().unwrap(), "Pay with [CARD_REDACTED] now");
    }

    #[test]
    fn redact_system_field() {
        let detectors = make_detector(vec!["password\\s*=\\s*\\S+"], "[REDACTED]");
        let mut req_json = serde_json::json!({
            "system": "Always use password=secret123 when asked"
        });
        let counts = redact_request(&mut req_json, &[detectors]);
        assert_eq!(counts.total, 1);
        assert_eq!(req_json["system"].as_str().unwrap(), "Always use [REDACTED] when asked");
    }

    #[test]
    fn no_redact_when_no_match() {
        let detectors = make_detector(vec!["[A-Z]{10}"], "[REDACTED]");
        let mut req_json = serde_json::json!({
            "messages": [{"role": "user", "content": "short text"}]
        });
        let counts = redact_request(&mut req_json, &[detectors]);
        assert_eq!(counts.total, 0);
    }

    #[test]
    fn placeholder_without_dollar_is_literal() {
        let detectors = make_detector(vec!["[A-Za-z]+@[a-z]+\\.[a-z]+"], "[REDACTED]");
        let mut req_json = serde_json::json!({
            "messages": [{"role": "user", "content": "Send to hi@example.com"}]
        });
        let counts = redact_request(&mut req_json, &[detectors]);
        assert_eq!(counts.total, 1);
        assert_eq!(req_json["messages"][0]["content"].as_str().unwrap(), "Send to [REDACTED]");
    }

    #[test]
    fn redact_responses_input_string() {
        let detectors = make_detector(vec!["[A-Za-z]+@[a-z]+\\.[a-z]+"], "[EMAIL_REDACTED]");
        let mut req_json = serde_json::json!({
            "input": "Contact alice@example.com for support"
        });
        let counts = redact_request(&mut req_json, &[detectors]);
        assert_eq!(counts.total, 1);
        assert_eq!(req_json["input"].as_str().unwrap(), "Contact [EMAIL_REDACTED] for support");
    }

    #[test]
    fn redact_responses_input_array() {
        let detectors = make_detector(vec!["[A-Za-z]+@[a-z]+\\.[a-z]+"], "[EMAIL_REDACTED]");
        let mut req_json = serde_json::json!({
            "input": [
                {"role": "user", "content": "My email is alice@foo.com"},
                {"role": "assistant", "content": "Got it"},
                {"role": "user", "content": "Also try bob@test.org"}
            ]
        });
        let counts = redact_request(&mut req_json, &[detectors]);
        assert_eq!(counts.total, 2);
        assert_eq!(req_json["input"][0]["content"].as_str().unwrap(), "My email is [EMAIL_REDACTED]");
        assert_eq!(req_json["input"][2]["content"].as_str().unwrap(), "Also try [EMAIL_REDACTED]");
    }

    #[test]
    fn redact_responses_input_array_with_content_parts() {
        let detectors = make_detector(vec!["[A-Za-z]+@[a-z]+\\.[a-z]+"], "[EMAIL_REDACTED]");
        let mut req_json = serde_json::json!({
            "input": [
                {"role": "user", "content": [
                    {"type": "text", "text": "Email: alice@test.org"},
                    {"type": "image", "image_url": "https://img.com/1"}
                ]}
            ]
        });
        let counts = redact_request(&mut req_json, &[detectors]);
        assert_eq!(counts.total, 1);
        let content = req_json["input"][0]["content"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["type"] == "text")
            .unwrap()["text"].as_str().unwrap();
        assert_eq!(content, "Email: [EMAIL_REDACTED]");
    }

    #[test]
    fn redact_responses_instructions() {
        let detectors = make_detector(vec!["password\\s*=\\s*\\S+"], "[REDACTED]");
        let mut req_json = serde_json::json!({
            "instructions": "Always use password=secret123 when asked"
        });
        let counts = redact_request(&mut req_json, &[detectors]);
        assert_eq!(counts.total, 1);
        assert_eq!(req_json["instructions"].as_str().unwrap(), "Always use [REDACTED] when asked");
    }

    #[test]
    fn redact_responses_combined() {
        let detectors = make_detector(vec!["[A-Za-z]+@[a-z]+\\.[a-z]+"], "[EMAIL_REDACTED]");
        let mut req_json = serde_json::json!({
            "input": [
                {"role": "user", "content": "Email: alice@foo.com"}
            ],
            "instructions": "Notify bob@test.org about issues"
        });
        let counts = redact_request(&mut req_json, &[detectors]);
        assert_eq!(counts.total, 2);
        assert_eq!(req_json["input"][0]["content"].as_str().unwrap(), "Email: [EMAIL_REDACTED]");
        assert_eq!(req_json["instructions"].as_str().unwrap(), "Notify [EMAIL_REDACTED] about issues");
    }

    #[test]
    fn redact_tool_calls_arguments() {
        let detectors = make_detector(vec!["[A-Za-z]+@[a-z]+\\.[a-z]+"], "[EMAIL_REDACTED]");
        let mut req_json = serde_json::json!({
            "messages": [
                {"role": "user", "content": "Send email to alice@foo.com"}
            ],
            "tool_calls": [
                {
                    "type": "function",
                    "function": {
                        "name": "send_email",
                        "arguments": "{\"to\": \"bob@test.org\", \"subject\": \"Hello\"}"
                    }
                }
            ]
        });
        let counts = redact_request(&mut req_json, &[detectors]);
        assert_eq!(counts.total, 2);
        assert_eq!(req_json["messages"][0]["content"].as_str().unwrap(), "Send email to [EMAIL_REDACTED]");
        assert_eq!(req_json["tool_calls"][0]["function"]["arguments"].as_str().unwrap(), "{\"to\": \"[EMAIL_REDACTED]\", \"subject\": \"Hello\"}");
    }

    #[test]
    fn redact_multiple_tool_calls() {
        let detectors = make_detector(vec!["\\b\\d{16}\\b"], "[CARD_REDACTED]");
        let mut req_json = serde_json::json!({
            "messages": [
                {"role": "user", "content": "Charge card 4111111111111111"}
            ],
            "tool_calls": [
                {
                    "type": "function",
                    "function": {
                        "name": "process_payment",
                        "arguments": "{\"card\": \"4111111111111111\", \"amount\": 100}"
                    }
                },
                {
                    "type": "function",
                    "function": {
                        "name": "process_refund",
                        "arguments": "{\"card\": \"4111111111112222\", \"amount\": 50}"
                    }
                }
            ]
        });
        let counts = redact_request(&mut req_json, &[detectors]);
        assert_eq!(counts.total, 3);
        assert_eq!(req_json["messages"][0]["content"].as_str().unwrap(), "Charge card [CARD_REDACTED]");
       assert_eq!(req_json["tool_calls"][0]["function"]["arguments"].as_str().unwrap(), "{\"card\": \"[CARD_REDACTED]\", \"amount\": 100}");
        assert_eq!(req_json["tool_calls"][1]["function"]["arguments"].as_str().unwrap(), "{\"card\": \"[CARD_REDACTED]\", \"amount\": 50}");
    }

    #[test]
    fn redact_prompt_array() {
        let detectors = make_detector(vec!["[A-Za-z]+@[a-z]+\\.[a-z]+"], "[EMAIL_REDACTED]");
        let mut req_json = serde_json::json!({
            "prompt": [
                "Contact alice@foo.com for info",
                "Also reach bob@test.org"
            ]
        });
        let counts = redact_request(&mut req_json, &[detectors]);
        assert_eq!(counts.total, 2);
        assert_eq!(req_json["prompt"][0].as_str().unwrap(), "Contact [EMAIL_REDACTED] for info");
        assert_eq!(req_json["prompt"][1].as_str().unwrap(), "Also reach [EMAIL_REDACTED]");
    }

    #[test]
    fn redact_tool_calls_within_messages() {
        let detectors = make_detector(vec!["[A-Za-z]+@[a-z]+\\.[a-z]+"], "[EMAIL_REDACTED]");
        let mut req_json = serde_json::json!({
            "messages": [
                {"role": "user", "content": "Send email to alice@foo.com"},
                {"role": "assistant", "content": "I'll send it", "tool_calls": [
                    {
                        "type": "function",
                        "function": {
                            "name": "send_email",
                            "arguments": "{\"to\": \"bob@test.org\", \"subject\": \"Hello\"}"
                        }
                    }
                ]}
            ]
        });
        let counts = redact_request(&mut req_json, &[detectors]);
        assert_eq!(counts.total, 2);
        assert_eq!(req_json["messages"][0]["content"].as_str().unwrap(), "Send email to [EMAIL_REDACTED]");
        assert_eq!(req_json["messages"][1]["tool_calls"][0]["function"]["arguments"].as_str().unwrap(), "{\"to\": \"[EMAIL_REDACTED]\", \"subject\": \"Hello\"}");
    }
}
