//! Generic OpenAI-compatible adapter — the fallback for any vendor that speaks
//! the OpenAI chat API but isn't explicitly modelled (vLLM, LM Studio, Groq,
//! Mistral, Together, local proxies, …). Identity transforms, Bearer auth.

use serde_json::Value;

use crate::adapters::bearer_headers;
use super::{openai_classify_request, openai_extract_text, LlmAdapter};
use crate::policy::ProviderConfig;

pub struct OpenAiCompatibleAdapter;

impl LlmAdapter for OpenAiCompatibleAdapter {
    fn vendor(&self) -> &'static str {
        "openai_compatible"
    }

    fn chat_path(&self) -> &str {
        "/chat/completions"
    }

    fn build_headers(&self, p: &ProviderConfig) -> Vec<(String, String)> {
        bearer_headers(p.api_key.as_deref())
    }

    fn build_classify_request(&self, model: &str, system_prompt: &str, user_prompt: &str, max_output_token: Option<i32>) -> Value {
        openai_classify_request(model, system_prompt, user_prompt, max_output_token)
    }

    fn extract_classify_text<'a>(&self, native: &'a Value) -> Option<&'a str> {
        openai_extract_text(native)
    }
}
