//! Google Generative AI embedding adapter (Vertex AI / AI Studio).
//!
//! Uses a different URL (`/models/{model}:embedContent`), an `x-goog-api-key`
//! header, and a `{ content: { parts: [{ text }] } }` body shape.

use serde_json::{json, Value};

use crate::adapters::{check_provider_error, google_headers};
use super::{extract_f32, EmbeddingAdapter, DEFAULT_MODEL_GOOGLE};
use crate::agents::embedding::client::EmbeddingProviderConfig;

pub struct GoogleEmbeddingAdapter;

impl EmbeddingAdapter for GoogleEmbeddingAdapter {
    fn vendor(&self) -> &'static str {
        "google"
    }

    fn endpoint_path(&self, p: &EmbeddingProviderConfig) -> String {
        let model = p.model.as_deref().unwrap_or(DEFAULT_MODEL_GOOGLE);
        format!("/models/{}:embedContent", model)
    }

    fn build_headers(&self, p: &EmbeddingProviderConfig) -> Vec<(String, String)> {
        let key = p.api_key.as_deref().unwrap_or("");
        let hm = google_headers(key);
        (&hm).into_iter().map(|(k, v)| (k.to_string(), v.to_str().unwrap().to_string())).collect()
    }

    fn build_body(&self, _p: &EmbeddingProviderConfig, input: &str) -> Value {
        // Google uses a different body structure — model is in the URL.
        json!({ "content": { "parts": [{ "text": input }] } })
    }

    fn parse_response(&self, data: &Value) -> Result<Vec<f32>, String> {
        if let Some(msg) = check_provider_error(data) {
            return Err(format!("provider error: {}", msg));
        }
        let arr = data["embedding"]["values"].as_array()
            .ok_or_else(|| "google response missing \"embedding.values\" array".to_string())?;
        extract_f32(arr, "embedding.values")
    }
}
