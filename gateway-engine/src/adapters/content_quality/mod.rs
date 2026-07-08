//! Per-vendor Content Quality Provider adapters — the plugin slot behind
//! "Content Quality Scanning". TruLens is the first/default plugin, not the
//! only one: adding a second vendor means one new file + one match arm here,
//! the same arrangement as `adapters/embedding/mod.rs`'s `EmbeddingAdapter`.
//!
//! Everything downstream of this trait (the pipeline hook-in, enforcement,
//! logging) is written against [`ContentQualityScores`], never against a
//! specific vendor — see `agents::content_quality` for that plugin-agnostic
//! caller code.

use serde_json::Value;

use crate::policy::content_quality_provider::ContentQualityProviderConfig;
use crate::policy::ProviderConfig;

pub mod trulens;

/// Vendor-agnostic scoring result. This is what `ContentQualityAdapter::parse_response`
/// produces and what `agents::content_quality::rules::evaluate_content_quality` consumes —
/// no plugin-specific fields leak past this boundary.
#[derive(Debug, Clone, Default)]
pub struct ContentQualityScores {
    pub groundedness:  Option<f32>,
    pub relevance:     Option<f32>,
    pub hallucination: Option<f32>,
    pub reason:        Option<String>,
}

/// One adapter per Content Quality Provider plugin vendor.
pub trait ContentQualityAdapter: Send + Sync {
    /// Stable vendor key, for logging/diagnostics.
    fn vendor(&self) -> &'static str;

    /// Path appended to `cfg.service_url` for the scoring request.
    fn evaluate_path(&self) -> &'static str;

    /// HTTP headers (optional bearer auth + content-type) for this vendor's service.
    fn build_headers(&self, cfg: &ContentQualityProviderConfig) -> Vec<(String, String)>;

    /// Build the JSON request body for this vendor's `/evaluate`-equivalent endpoint.
    fn build_body(
        &self,
        cfg: &ContentQualityProviderConfig,
        context: &str,
        response: &str,
        judge_provider: &ProviderConfig,
        metrics: &[&str],
    ) -> Value;

    /// Parse the JSON response body into vendor-agnostic scores.
    fn parse_response(&self, data: &Value) -> Result<ContentQualityScores, String>;
}

/// Factory: pick the adapter for the active Content Quality Provider config.
/// Unknown vendors fall back to the default plugin (TruLens), same fallback
/// behaviour as `adapters::embedding::adapter_for`.
pub fn adapter_for(cfg: &ContentQualityProviderConfig) -> Box<dyn ContentQualityAdapter> {
    match cfg.vendor.as_str() {
        "trulens" => Box::new(trulens::TruLensAdapter),
        _ => Box::new(trulens::TruLensAdapter),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg(vendor: &str) -> ContentQualityProviderConfig {
        ContentQualityProviderConfig {
            vendor: vendor.to_string(),
            service_url: "http://localhost:8090".to_string(),
            service_api_key: None,
            timeout_ms: 10000,
        }
    }

    #[test]
    fn trulens_vendor_resolves_to_trulens_adapter() {
        assert_eq!(adapter_for(&cfg("trulens")).vendor(), "trulens");
    }

    #[test]
    fn unknown_vendor_falls_back_to_trulens_adapter() {
        assert_eq!(adapter_for(&cfg("some-future-plugin")).vendor(), "trulens");
    }
}
