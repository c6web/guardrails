//! Post-scan enforcement rules — evaluates scan results against app mode to determine action.

use crate::pipeline_types::{LayerResult, ScanSummary};

/// Per-enforcement action to take after scanning.
pub enum EnforcementAction {
    /// Threat detected but app is in "monitor" mode — forward with monitoring tag.
    Monitor {
        detector: String,
        confidence: Option<f32>,
        reason: Option<String>,
        excerpt: Option<String>,
    },
    /// Threat detected and should be blocked — caller returns 403 error.
    Block {
        detector: String,
        confidence: Option<f32>,
        reason: Option<String>,
        excerpt: Option<String>,
    },
    /// Threat detected but should be flagged — forward with flagging tag.
    Flag {
        detector: String,
        confidence: Option<f32>,
        reason: Option<String>,
        excerpt: Option<String>,
    },
    /// Regex match found with mode="redact" — replace matched spans with placeholder, forward sanitized request.
    /// Non-regex (keyword/semantic/LLM) hits with mode="redact" fall back to Block instead.
    Redact {
        detector: String,
        placeholder: String,
        confidence: Option<f32>,
        reason: Option<String>,
    },
}

/// Check if the detector mode indicates blocking (excludes "redact" — handled separately).
pub fn should_block(mode: &str, final_decision: &str) -> bool {
    mode == "block" && final_decision == "block"
}

/// Evaluate enforcement rules based on scan results and app mode.
///
/// Returns `None` when no hit was found (normal forward path).
/// Returns `Some(EnforcementAction)` when a threat was detected.
pub fn evaluate(scan_summary: &ScanSummary, app_mode: &str) -> Option<EnforcementAction> {
    let hit = match &scan_summary.hit {
        Some(LayerResult::Hit { detector, mode, confidence, reason, excerpt, placeholder, .. }) => {
            (detector.clone(), mode.clone(), *confidence, reason.clone(), excerpt.clone(), placeholder.clone())
        }
        _ => return None,
    };

    if app_mode == "monitor" {
        return Some(EnforcementAction::Monitor {
            detector: hit.0,
            confidence: hit.2,
            reason: hit.3,
            excerpt: hit.4,
        });
    }

    // Block takes precedence over redact — if final_decision is "block", enforce blocking regardless of mode.
    if should_block(&hit.1, &scan_summary.final_decision) {
        return Some(EnforcementAction::Block {
            detector: hit.0,
            confidence: hit.2,
            reason: hit.3,
            excerpt: hit.4,
        });
    }

    // Redact: regex hit with placeholder → substitute and forward (non-terminal; survives LLM "safe").
    // No placeholder (keyword/semantic/LLM hit) → fall back to block.
    if hit.1 == "redact" {
        if let Some(placeholder) = hit.5 {
            return Some(EnforcementAction::Redact {
                detector: hit.0,
                placeholder,
                confidence: hit.2,
                reason: hit.3,
            });
        }
        // No placeholder (keyword/semantic/LLM hit) → fall back to block.
        return Some(EnforcementAction::Block {
            detector: hit.0,
            confidence: hit.2,
            reason: hit.3,
            excerpt: hit.4,
        });
    }

    // Flag / throttle — threat detected but not blocking or redacting.
    Some(EnforcementAction::Flag {
        detector: hit.0,
        confidence: hit.2,
        reason: hit.3,
        excerpt: hit.4,
    })
}

// ── Tests ─────────────────────────────────────────────────────────────────────
// Mode × Detection Regression Matrix
//
// Each test covers one cell of the matrix:
//   app_mode  | scan result          | expected action
//   ----------|----------------------|----------------
//   bypass    | (scan skipped)       | None — caller never calls evaluate()
//   monitor   | hit                  | Monitor (forward + tag)
//   guard     | hit, mode=block      | Block (return 403)
//   guard     | hit, mode=redact+ph  | Redact (sanitise body, forward)
//   guard     | hit, mode=redact, no placeholder | Block (fallback)
//   any       | hit, mode=flag       | Flag (forward + tag)
//   any       | no hit               | None (allow)
//
// Streaming does not affect evaluate() — it is a pure function of scan+mode.
// The streaming path is covered at the forwarder level.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipeline_types::{LayerResult, ScanSummary, SemanticMatch, TraceStage};

    fn hit_summary(det_mode: &str, final_decision: &str, placeholder: Option<String>) -> ScanSummary {
        ScanSummary {
            hit: Some(LayerResult::Hit {
                detector:     "test-detector".to_string(),
                mode:         det_mode.to_string(),
                confidence:   Some(0.95),
                reason:       Some("injection attempt".to_string()),
                excerpt:      Some("ignore previous instructions".to_string()),
                framework_id: "owasp-2025-llm01".to_string(),
                placeholder,
            }),
            semantic_matches:          Vec::<SemanticMatch>::new(),
            emb_threshold:             0.85,
            classifier_result:         None,
            false_positive_candidates: false,
            trace_stages:              Vec::<TraceStage>::new(),
            final_decision:            final_decision.to_string(),
            blocked_stage:             None,
            t2_result:                 None,
            cache_hit:                 false,
            cache_tier:                None,
            cache_provider_id:         None,
            cache_tokens_in:           None,
            cache_tokens_out:          None,
            cache_response_bytes:      None,
            cache_response_headers:    None,
        }
    }

    fn safe_summary() -> ScanSummary {
        ScanSummary {
            hit:                       None,
            semantic_matches:          Vec::<SemanticMatch>::new(),
            emb_threshold:             0.85,
            classifier_result:         None,
            false_positive_candidates: false,
            trace_stages:              Vec::<TraceStage>::new(),
            final_decision:            "allow".to_string(),
            blocked_stage:             None,
            t2_result:                 None,
            cache_hit:                 false,
            cache_tier:                None,
            cache_provider_id:         None,
            cache_tokens_in:           None,
            cache_tokens_out:          None,
            cache_response_bytes:      None,
            cache_response_headers:    None,
        }
    }

    // ── 1. No hit → None for any app_mode ─────────────────────────────────────

    #[test]
    fn no_hit_returns_none_for_guard() {
        assert!(evaluate(&safe_summary(), "guard").is_none());
    }

    #[test]
    fn no_hit_returns_none_for_monitor() {
        assert!(evaluate(&safe_summary(), "monitor").is_none());
    }

    // ── 2. bypass — evaluate() is never called; safe scan also returns None ───

    #[test]
    fn bypass_safe_scan_returns_none() {
        // In the request handler, bypass skips scanning entirely.
        // If evaluate() were called with a safe scan the result is still None.
        assert!(evaluate(&safe_summary(), "bypass").is_none());
    }

    // ── 3. monitor + malicious → Monitor (forward + tag, never block) ─────────

    #[test]
    fn monitor_hit_returns_monitor() {
        let summary = hit_summary("block", "block", None);
        match evaluate(&summary, "monitor") {
            Some(EnforcementAction::Monitor { detector, confidence, .. }) => {
                assert_eq!(detector, "test-detector");
                assert_eq!(confidence, Some(0.95));
            }
            other => panic!("expected Monitor, got {:?}", other.is_some()),
        }
    }

    #[test]
    fn monitor_hit_non_streaming_returns_monitor() {
        let summary = hit_summary("block", "block", None);
        assert!(matches!(evaluate(&summary, "monitor"), Some(EnforcementAction::Monitor { .. })));
    }

    // ── 4. guard + malicious (block mode) → Block (return 403) ───────────────

    #[test]
    fn guard_block_mode_hit_returns_block() {
        let summary = hit_summary("block", "block", None);
        assert!(matches!(evaluate(&summary, "guard"), Some(EnforcementAction::Block { .. })));
    }

    #[test]
    fn guard_block_mode_hit_streaming_returns_block() {
        // Streaming does not change enforcement decision — same result.
        let summary = hit_summary("block", "block", None);
        assert!(matches!(evaluate(&summary, "guard"), Some(EnforcementAction::Block { .. })));
    }

    // ── 5. guard + redact detector with placeholder → Redact (sanitise + fwd) ─

    #[test]
    fn guard_redact_with_placeholder_returns_redact() {
        let summary = hit_summary("redact", "block", Some("[REDACTED]".to_string()));
        match evaluate(&summary, "guard") {
            Some(EnforcementAction::Redact { detector, placeholder, .. }) => {
                assert_eq!(detector, "test-detector");
                assert_eq!(placeholder, "[REDACTED]");
            }
            other => panic!("expected Redact, got {:?}", other.is_some()),
        }
    }

    #[test]
    fn guard_redact_with_placeholder_streaming_returns_redact() {
        let summary = hit_summary("redact", "block", Some("[REDACTED]".to_string()));
        assert!(matches!(evaluate(&summary, "guard"), Some(EnforcementAction::Redact { .. })));
    }

    // ── 6. guard + redact without placeholder → falls back to Block ───────────

    #[test]
    fn guard_redact_no_placeholder_falls_back_to_block() {
        let summary = hit_summary("redact", "block", None);
        assert!(matches!(evaluate(&summary, "guard"), Some(EnforcementAction::Block { .. })));
    }

    // ── 7. flag mode (non-blocking) → Flag ────────────────────────────────────

    #[test]
    fn flag_mode_hit_returns_flag() {
        let summary = hit_summary("flag", "allow", None);
        assert!(matches!(evaluate(&summary, "guard"), Some(EnforcementAction::Flag { .. })));
    }

    #[test]
    fn flag_mode_hit_streaming_returns_flag() {
        let summary = hit_summary("flag", "allow", None);
        assert!(matches!(evaluate(&summary, "guard"), Some(EnforcementAction::Flag { .. })));
    }

    // ── 8. Regression: guard + block mode but allow decision → Flag (not Block) ─

    #[test]
    fn guard_block_mode_allow_decision_does_not_block() {
        let summary = hit_summary("block", "allow", None);
        assert!(matches!(evaluate(&summary, "guard"), Some(EnforcementAction::Flag { .. })));
    }

    // ── 9. Regression: soft mode + block hit → Block ───────────────────────────

    #[test]
    fn soft_mode_with_block_hit_returns_block() {
        let summary = hit_summary("block", "block", None);
        assert!(matches!(evaluate(&summary, "soft"), Some(EnforcementAction::Block { .. })));
    }

    // ── 10. Regression: bypass mode + block hit → Block ────────────────────────

    #[test]
    fn bypass_hit_returns_block() {
        // bypass is not special-cased in evaluate(); a block hit still yields Block
        let summary = hit_summary("block", "block", None);
        assert!(matches!(evaluate(&summary, "bypass"), Some(EnforcementAction::Block { .. })));
    }

    // ── 11. should_block helper ────────────────────────────────────────────────

    #[test]
    fn should_block_true_when_block_block() {
        assert!(should_block("block", "block"));
    }

    #[test]
    fn should_block_false_when_mode_is_monitor() {
        assert!(!should_block("monitor", "block"));
    }

    #[test]
    fn should_block_false_when_decision_is_allow() {
        assert!(!should_block("block", "allow"));
    }
}
