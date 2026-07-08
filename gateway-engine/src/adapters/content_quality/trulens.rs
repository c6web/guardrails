//! First/default Content Quality Provider plugin: a stateless HTTP call to the
//! TruLens Quality Service (`trulens-service/`, FastAPI wrapping the real
//! `trulens` package). See `trulens_plan.md` §1 for the full `/evaluate`
//! contract this adapter builds requests against.

use serde_json::{json, Value};

use super::{ContentQualityAdapter, ContentQualityScores};
use crate::policy::content_quality_provider::ContentQualityProviderConfig;
use crate::policy::ProviderConfig;

pub struct TruLensAdapter;

impl ContentQualityAdapter for TruLensAdapter {
    fn vendor(&self) -> &'static str {
        "trulens"
    }

    fn evaluate_path(&self) -> &'static str {
        "/evaluate"
    }

    fn build_headers(&self, cfg: &ContentQualityProviderConfig) -> Vec<(String, String)> {
        let mut h = vec![("content-type".to_string(), "application/json".to_string())];
        if let Some(key) = cfg.service_api_key.as_deref().filter(|k| !k.is_empty()) {
            h.push(("authorization".to_string(), format!("Bearer {}", key)));
        }
        h
    }

    fn build_body(
        &self,
        _cfg: &ContentQualityProviderConfig,
        context: &str,
        response: &str,
        judge_provider: &ProviderConfig,
        metrics: &[&str],
    ) -> Value {
        json!({
            "context": context,
            "response": response,
            "metrics": metrics,
            "judge_provider": {
                "vendor": judge_provider.vendor,
                "endpoint": judge_provider.endpoint,
                "model": judge_provider.model,
                "api_key": judge_provider.api_key,
            },
        })
    }

    fn parse_response(&self, data: &Value) -> Result<ContentQualityScores, String> {
        if let Some(msg) = crate::adapters::check_provider_error(data) {
            return Err(format!("content quality service error: {}", msg));
        }
        if !data.is_object() {
            return Err("content quality service response is not a JSON object".to_string());
        }

        Ok(ContentQualityScores {
            groundedness:  data.get("groundedness").and_then(|v| v.as_f64()).map(|v| v as f32),
            relevance:     data.get("relevance").and_then(|v| v.as_f64()).map(|v| v as f32),
            hallucination: data.get("hallucination").and_then(|v| v.as_f64()).map(|v| v as f32),
            reason:        data.get("reason").and_then(|v| v.as_str()).map(|s| s.to_string()),
        })
    }
}
