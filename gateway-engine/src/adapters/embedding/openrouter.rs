//! OpenRouter embedding adapter — OpenAI-compatible `/embeddings` plus optional
//! passthrough routing fields (`provider`, `allow_fallbacks`, `data_collection`).

use axum::http::HeaderMap;
use serde_json::{json, Value};

use crate::adapters::{bearer_headers, openrouter_headers};
use super::{parse_openai_response, standard_body, EmbeddingAdapter};
use crate::agents::embedding::client::EmbeddingProviderConfig;

pub struct OpenRouterEmbeddingAdapter;

impl EmbeddingAdapter for OpenRouterEmbeddingAdapter {
    fn vendor(&self) -> &'static str {
        "openrouter"
    }

    fn endpoint_path(&self, _p: &EmbeddingProviderConfig) -> String {
        "/embeddings".to_string()
    }

    fn build_headers(&self, p: &EmbeddingProviderConfig) -> Vec<(String, String)> {
        let mut h = bearer_headers(p.api_key.as_deref());
        let mut hm = HeaderMap::new();
        openrouter_headers(&mut hm);
        for (name, value) in &hm {
            h.push((name.to_string(), value.to_str().unwrap().to_string()));
        }
        h
    }

    fn build_body(&self, p: &EmbeddingProviderConfig, input: &str) -> Value {
        let mut body = standard_body(p, input);
        // OpenRouter-specific passthrough fields
        if let Some(pv) = &p.provider {
            body["provider"] = json!(pv);
        }
        if let Some(af) = p.allow_fallbacks {
            body["allow_fallbacks"] = json!(af);
        }
        if let Some(dc) = &p.data_collection {
            body["data_collection"] = json!(dc);
        }
        body
    }

    fn parse_response(&self, data: &Value) -> Result<Vec<f32>, String> {
        parse_openai_response(data)
    }
}
