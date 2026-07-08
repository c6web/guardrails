//! Ollama embedding adapter — two API modes, selected from the endpoint:
//!   - **compat**: endpoint contains `/v1` → OpenAI-compatible `/embeddings`.
//!   - **native**: otherwise → Ollama's own `/api/embed` (`embeddings[0]` shape).

use serde_json::Value;

use crate::adapters::{check_provider_error, is_ollama_compat, json_headers};
use super::{extract_f32, parse_openai_response, standard_body, EmbeddingAdapter};
use crate::agents::embedding::client::EmbeddingProviderConfig;

pub struct OllamaEmbeddingAdapter {
    /// True when the endpoint exposes the OpenAI-compatible `/v1` surface.
    compat: bool,
}

impl OllamaEmbeddingAdapter {
    pub fn new(endpoint: &str) -> Self {
        OllamaEmbeddingAdapter { compat: is_ollama_compat(endpoint) }
    }
}

impl EmbeddingAdapter for OllamaEmbeddingAdapter {
    fn vendor(&self) -> &'static str {
        "ollama"
    }

    fn endpoint_path(&self, _p: &EmbeddingProviderConfig) -> String {
        if self.compat { "/embeddings".to_string() } else { "/api/embed".to_string() }
    }

    fn build_headers(&self, _p: &EmbeddingProviderConfig) -> Vec<(String, String)> {
        let hm = json_headers();
        (&hm).into_iter().map(|(k, v)| (k.to_string(), v.to_str().unwrap().to_string())).collect()
    }

    fn build_body(&self, p: &EmbeddingProviderConfig, input: &str) -> Value {
        standard_body(p, input)
    }

    fn parse_response(&self, data: &Value) -> Result<Vec<f32>, String> {
        if let Some(msg) = check_provider_error(data) {
            return Err(format!("provider error: {}", msg));
        }
        if self.compat {
            return parse_openai_response(data);
        }
        // Native: { "embeddings": [[...]] }
        let arr = data["embeddings"][0].as_array()
            .ok_or_else(|| "ollama response missing \"embeddings[0]\" array".to_string())?;
        extract_f32(arr, "embeddings[0]")
    }
}
