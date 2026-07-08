//! Content-quality enforcement decision — a pure function, no side effects.
//! Runs *after* generation (assistant reply already exists), so `ScanSummary`
//! is not in scope this late in the pipeline — same precedent as
//! `agents::scanning::output_scanner`'s local output-stage decision struct.

use crate::adapters::content_quality::ContentQualityScores;
use crate::policy::DetectorStore;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContentQualityEnforcementAction {
    Block,
    Redact,
    Flag,
    Monitor,
}

/// Canned substitution used for content-quality "redact" mode. Unlike a
/// detector redact (which surgically replaces a matched span), a quality
/// failure has no placeholder concept — the whole response is swapped for
/// this message. Static, not LLM-generated (unlike the `soft` mode refusal
/// in `agents::refusal`) — a quality failure isn't a policy violation that
/// needs a tailored explanation.
pub const CONTENT_QUALITY_REDACT_MESSAGE: &str =
    "This response did not meet quality standards and has been withheld. Please try rephrasing your request.";

/// Decide what to do with a content-quality scan result. Returns `None` when
/// the response passed (nothing to enforce), `Some(action)` otherwise —
/// mirrors `enforcement::rules::evaluate`'s `Option<EnforcementAction>` shape.
///
/// `mode`/`threshold` are the app's per-app overrides (`None` = inherit the
/// global default from `content_quality_judge_prompts.threshold` / a safe
/// "flag" mode default).
pub fn evaluate_content_quality(
    scores:       &ContentQualityScores,
    mode:         Option<&str>,
    threshold:    Option<f32>,
    policy_store: &DetectorStore,
) -> Option<ContentQualityEnforcementAction> {
    let effective_threshold = threshold.unwrap_or_else(|| {
        *policy_store.content_quality_threshold.read().unwrap_or_else(|e| e.into_inner())
    });

    // A quality failure is a groundedness or relevance score below threshold —
    // either metric failing means the response wasn't well-supported by context
    // or didn't address what was asked. Missing metrics don't count as failures.
    let worst_score = [scores.groundedness, scores.relevance]
        .into_iter()
        .flatten()
        .fold(None::<f32>, |acc, v| Some(acc.map_or(v, |a| a.min(v))));

    let worst_score = worst_score?;
    if worst_score >= effective_threshold {
        return None;
    }

    // Below threshold — dispatch per configured mode. Null mode defaults to
    // "flag" (safe, non-disruptive), matching the recommended rollout in the
    // setup guide ("start with flag for a zero-risk rollout").
    Some(match mode.unwrap_or("flag") {
        "block"   => ContentQualityEnforcementAction::Block,
        "redact"  => ContentQualityEnforcementAction::Redact,
        "monitor" => ContentQualityEnforcementAction::Monitor,
        _         => ContentQualityEnforcementAction::Flag,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::{Arc, RwLock};

    fn store_with_threshold(t: f32) -> DetectorStore {
        // Minimal DetectorStore — only content_quality_threshold is read by
        // evaluate_content_quality's fallback path. db_pool is a lazy pool that
        // never actually connects (mirrors request_handler/enforcement.rs's tests).
        let pool = sqlx::postgres::PgPoolOptions::new()
            .connect_lazy("postgres://test:test@localhost:5432/test")
            .expect("lazy pool");
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
            app_detector_ids:         Arc::new(RwLock::new(HashMap::new())),
            app_threat_knowledge_ids: Arc::new(RwLock::new(HashMap::new())),
            embedding_providers:      Arc::new(RwLock::new(Vec::new())),
            embedding_threshold:      Arc::new(RwLock::new(0.75)),
            db_pool:                  Arc::new(pool),
            blocked_tools:            Arc::new(RwLock::new(HashMap::new())),
            framework_store:          Arc::new(RwLock::new(None)),
            t2_system_prompt:         Arc::new(RwLock::new(String::new())),
            t2_threshold:             Arc::new(RwLock::new(0.0)),
            t2_max_output_tokens:     Arc::new(RwLock::new(0)),
            content_quality_provider_config: Arc::new(RwLock::new(Default::default())),
            content_quality_judge_provider:  Arc::new(RwLock::new(None)),
            content_quality_system_prompt:   Arc::new(RwLock::new(String::new())),
            content_quality_threshold:       Arc::new(RwLock::new(t)),
            content_quality_max_output_tokens: Arc::new(RwLock::new(10240)),
            cache_loaded_at:            Arc::new(RwLock::new(chrono::Utc::now())),
            cache_reload_interval_secs: 900,
            detection_degraded:         Arc::new(RwLock::new(false)),
            response_cache_enabled:        Arc::new(tokio::sync::RwLock::new(false)),
            response_cache_exact_enabled:  Arc::new(tokio::sync::RwLock::new(true)),
            response_cache_semantic_enabled: Arc::new(tokio::sync::RwLock::new(false)),
            response_cache_threshold:      Arc::new(tokio::sync::RwLock::new(0.97)),
        }
    }

    fn scores(groundedness: Option<f32>, relevance: Option<f32>) -> ContentQualityScores {
        ContentQualityScores { groundedness, relevance, hallucination: None, reason: None }
    }

    #[tokio::test]
    async fn passes_when_above_threshold() {
        let store = store_with_threshold(0.7);
        let s = scores(Some(0.9), Some(0.85));
        assert_eq!(evaluate_content_quality(&s, Some("block"), None, &store), None);
    }

    #[tokio::test]
    async fn no_scores_returns_none() {
        let store = store_with_threshold(0.7);
        let s = scores(None, None);
        assert_eq!(evaluate_content_quality(&s, Some("block"), None, &store), None);
    }

    #[tokio::test]
    async fn worst_of_two_metrics_drives_decision() {
        let store = store_with_threshold(0.7);
        let s = scores(Some(0.95), Some(0.5)); // relevance fails
        assert_eq!(
            evaluate_content_quality(&s, Some("flag"), None, &store),
            Some(ContentQualityEnforcementAction::Flag)
        );
    }

    #[tokio::test]
    async fn null_mode_defaults_to_flag() {
        let store = store_with_threshold(0.7);
        let s = scores(Some(0.5), None);
        assert_eq!(
            evaluate_content_quality(&s, None, None, &store),
            Some(ContentQualityEnforcementAction::Flag)
        );
    }

    #[tokio::test]
    async fn per_app_threshold_overrides_global() {
        let store = store_with_threshold(0.3); // global would pass 0.5
        let s = scores(Some(0.5), None);
        assert_eq!(
            evaluate_content_quality(&s, Some("monitor"), Some(0.9), &store),
            Some(ContentQualityEnforcementAction::Monitor)
        );
    }

    #[tokio::test]
    async fn each_mode_maps_to_its_action() {
        let store = store_with_threshold(0.7);
        let s = scores(Some(0.1), None);
        assert_eq!(evaluate_content_quality(&s, Some("block"), None, &store), Some(ContentQualityEnforcementAction::Block));
        assert_eq!(evaluate_content_quality(&s, Some("redact"), None, &store), Some(ContentQualityEnforcementAction::Redact));
        assert_eq!(evaluate_content_quality(&s, Some("monitor"), None, &store), Some(ContentQualityEnforcementAction::Monitor));
        assert_eq!(evaluate_content_quality(&s, Some("flag"), None, &store), Some(ContentQualityEnforcementAction::Flag));
    }
}
