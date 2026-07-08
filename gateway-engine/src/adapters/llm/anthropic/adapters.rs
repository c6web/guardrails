//! Anthropic adapter implementation and data types.

use serde_json::{json, Value};

use crate::adapters::json_headers;
use crate::adapters::llm::LlmAdapter;
use crate::policy::ProviderConfig;

pub const ANTHROPIC_VERSION: &str = "2023-06-01";
pub(crate) const DEFAULT_MAX_TOKENS: u64 = 4096;

/// Represents a single content block from an Anthropic message.
#[derive(Clone, Debug)]
pub enum ContentBlock {
    Text { text: String },
    Image { source_data: String },
    Thinking,
}

// ── Vendor adapter (upstream provider is Anthropic) ──────────────────────────

pub struct AnthropicAdapter;

impl LlmAdapter for AnthropicAdapter {
    fn vendor(&self) -> &'static str {
        "anthropic"
    }

    fn chat_path(&self) -> &str {
        "/v1/messages"
    }

    fn build_headers(&self, p: &ProviderConfig) -> Vec<(String, String)> {
        let hm = json_headers();
        let mut h: Vec<(String, String)> = (&hm).into_iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap().to_string())).collect();
        h.push(("anthropic-version".to_string(), ANTHROPIC_VERSION.to_string()));
        if let Some(key) = p.api_key.as_deref().filter(|k| !k.is_empty()) {
            h.push(("x-api-key".to_string(), key.to_string()));
        }
        h
    }

    fn to_upstream_request(&self, canonical: Value) -> Value {
        crate::adapters::llm::anthropic::openai_request_to_anthropic(canonical)
    }

    fn parse_upstream_response(&self, native: Value) -> Value {
        crate::adapters::llm::anthropic::anthropic_response_to_openai(native)
    }

    fn build_classify_request(&self, model: &str, system_prompt: &str, user_prompt: &str, max_output_token: Option<i32>) -> Value {
        json!({
            "model":      model,
            "system":     system_prompt,
            "messages":   [{ "role": "user", "content": user_prompt }],
            "max_tokens": max_output_token.map(|v| v as u64).unwrap_or(10240),
        })
    }

    fn extract_classify_text<'a>(&self, native: &'a Value) -> Option<&'a str> {
        native.get("content")?.get(0)?.get("text")?.as_str()
    }

    fn needs_sse_transform(&self) -> bool { true }

    fn transform_stream_chunk(&self, chunk: &str) -> String {
        crate::adapters::llm::anthropic::anthropic_sse_to_openai_pub(chunk)
    }

    fn extract_usage(&self, resp: &Value) -> (Option<i32>, Option<i32>) {
        if let Some(usage) = resp.get("usage") {
            let tin  = usage.get("input_tokens").and_then(|v| v.as_u64()).map(|v| v as i32);
            let tout = usage.get("output_tokens").and_then(|v| v.as_u64()).map(|v| v as i32);
            return (tin, tout);
        }
        (None, None)
    }
}
