//! Output response scanner — detects sensitive content in upstream provider responses.
//!
//! Scans the assistant's reply text against regular detectors with `scanning_scope`
//! set to `output` or `both`. Detects PII, credentials, API keys, and other sensitive
//! data patterns. Results are logged and can trigger redaction or blocking.

use regex::Regex;

/// Check if `keyword` appears as a whole word (with word boundaries) in `text`.
fn has_word_boundary_match(text: &str, keyword: &str) -> bool {
    if keyword.is_empty() {
        return false;
    }
    let pattern = format!(r"\b{}\b", regex::escape(keyword));
    Regex::new(&pattern).map_or_else(
        |_| text.contains(keyword),
        |re| re.is_match(text),
    )
}

// ── Scan result ──────────────────────────────────────────────────────────────

/// Result from scanning a response body.
#[derive(Clone, Debug)]
pub struct OutputScanResult {
    pub flagged:          bool,
    pub category:         Option<String>,  // highest severity category
    pub confidence:       f32,             // 0.0-1.0 based on pattern matches
    pub detector_name:    Option<String>,  // which detector matched
    /// Populated when mode="redact" and a match was found: the response text with all
    /// redact-mode detector matches replaced by their placeholder strings.
    pub redacted_text:    Option<String>,
    /// True when any block-mode detector matched (not just configured).
    pub blocked:          bool,
    /// Populated when the response was blocked (e.g. "blocked_output").
    pub block_action:     Option<String>,
}

/// Scan a response using user-managed DetectorConfig entries (scope "output" or "both").
/// Supports both keyword and regex rule types.
pub fn scan_with_detector_configs(
    detectors: &[crate::policy::DetectorConfig],
    response_text: &str,
) -> OutputScanResult {
    if detectors.is_empty() {
        return OutputScanResult { flagged: false, category: None, confidence: 0.0, detector_name: None, redacted_text: None, blocked: false, block_action: None };
    }

    let text_lower = response_text.to_lowercase();
    let mut flagged = false;
    let mut highest_confidence = 0.0_f32;
    let mut best_detector: Option<String> = None;
    let mut best_category: Option<String> = None;
    let mut has_block = false;
    let mut working_text = response_text.to_string();
    let mut any_redacted = false;

    for detector in detectors {
        let matched = if detector.rule_type == "regex" {
            detector.compiled_patterns.iter().any(|(_, re_opt)| re_opt.as_ref().is_some_and(|re| re.is_match(response_text)))
        } else {
            detector.keywords.iter().any(|kw| has_word_boundary_match(&text_lower, &kw.to_lowercase()))
        };

        if matched {
            flagged = true;
            let confidence = 0.85_f32;
            if confidence > highest_confidence {
                highest_confidence = confidence;
                best_detector = Some(detector.name.clone());
                best_category = if detector.framework_id.is_empty() { None } else { Some(detector.framework_id.clone()) };
            }

            // Track mode precedence: block wins over redact/flag
            if detector.mode == "block" {
                has_block = true;
            }

            if detector.mode == "redact" {
                let new_text = crate::agents::redaction::redact_text_with_detector(&working_text, detector);
                if new_text != working_text {
                    working_text = new_text;
                    any_redacted = true;
                }
            }
        }
    }

    OutputScanResult {
        flagged,
        category:        best_category,
        confidence:      highest_confidence,
        detector_name:   best_detector,
        // If any block-mode detector matched, return original text (block takes precedence over redact)
        redacted_text: if has_block { None } else if any_redacted { Some(working_text) } else { None },
        blocked: has_block,
        block_action: if has_block { Some("blocked_output".to_string()) } else { None },
    }
}


