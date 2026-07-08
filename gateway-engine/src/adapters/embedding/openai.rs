//! OpenAI embedding adapter — standard `/embeddings` endpoint, Bearer auth.

use serde_json::Value;

use crate::adapters::bearer_headers;
use super::{parse_openai_response, standard_body, EmbeddingAdapter};
use crate::agents::embedding::client::EmbeddingProviderConfig;

pub struct OpenAiEmbeddingAdapter;

impl EmbeddingAdapter for OpenAiEmbeddingAdapter {
    fn vendor(&self) -> &'static str {
        "openai"
    }

    fn endpoint_path(&self, _p: &EmbeddingProviderConfig) -> String {
        "/embeddings".to_string()
    }

    fn build_headers(&self, p: &EmbeddingProviderConfig) -> Vec<(String, String)> {
        bearer_headers(p.api_key.as_deref())
    }

    fn build_body(&self, p: &EmbeddingProviderConfig, input: &str) -> Value {
        standard_body(p, input)
    }

    fn parse_response(&self, data: &Value) -> Result<Vec<f32>, String> {
        parse_openai_response(data)
    }
}
