//! OpenRouter adapter — OpenAI-compatible chat API with optional passthrough
//! routing fields (`provider`, `allow_fallbacks`, `data_collection`), mirroring
//! the OpenRouter handling in the embedding adapters.
//!
//! Those fields live on the provider row; for chat requests they are carried in
//! the request body when present.

use axum::http::HeaderMap;
use serde_json::Value;

use crate::adapters::{bearer_headers, openrouter_headers};
use super::{openai_classify_request, openai_extract_text, LlmAdapter};
use crate::policy::ProviderConfig;

pub struct OpenRouterAdapter;

impl LlmAdapter for OpenRouterAdapter {
    fn vendor(&self) -> &'static str {
        "openrouter"
    }

    fn chat_path(&self) -> &str {
        "/chat/completions"
    }

    fn build_headers(&self, p: &ProviderConfig) -> Vec<(String, String)> {
        let mut h = bearer_headers(p.api_key.as_deref());
        let mut hm = HeaderMap::new();
        openrouter_headers(&mut hm);
        for (name, value) in &hm {
            h.push((name.to_string(), value.to_str().unwrap().to_string()));
        }
        h
    }

    fn build_classify_request(&self, model: &str, system_prompt: &str, user_prompt: &str, max_output_token: Option<i32>) -> Value {
        openai_classify_request(model, system_prompt, user_prompt, max_output_token)
    }

    fn extract_classify_text<'a>(&self, native: &'a Value) -> Option<&'a str> {
        openai_extract_text(native)
    }
}
