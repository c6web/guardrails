//! Per-vendor AI LLM provider adapters.
//!
//! An "AI LLM provider" is a single concept; "classifier provider" and
//! "upstream provider" are just *roles* the same provider plays. Both flow
//! through the same per-vendor adapter here.
//!
//! Each vendor lives in its own file and implements [`LlmAdapter`]. Adding a
//! new provider means adding one file and one match arm in [`adapter_for`] —
//! mirroring the embedding adapter arrangement in `embedding_adapters/`.
//!
//! ## Format boundaries
//!
//! The gateway's internal canonical chat format is **OpenAI chat completions**.
//! An adapter owns the *vendor* boundary only:
//!   - [`LlmAdapter::to_upstream_request`]   canonical (OpenAI) → vendor request
//!   - [`LlmAdapter::from_upstream_response`] vendor response   → canonical (OpenAI)
//!
//! The *client/route* boundary (Anthropic clients on `/v1/messages`) is handled
//! separately by `request_handler` / `forwarding` using the shared converters in
//! [`anthropic`], which are the inverse direction of the adapter's transforms.

use serde_json::Value;

use crate::policy::ProviderConfig;

pub mod anthropic;
pub mod gemini;
pub mod ollama;
pub mod openai;
pub mod openai_compatible;
pub mod openrouter;

/// One adapter per AI LLM provider vendor. Methods cover both provider roles:
/// proxying chat traffic (upstream) and running classification (classifier).
pub trait LlmAdapter: Send + Sync {
    /// Stable vendor key, for logging/diagnostics.
    fn vendor(&self) -> &'static str;

    /// Path appended to `provider.endpoint` for chat/completion requests.
    fn chat_path(&self) -> &str;

    /// HTTP headers (auth, content-type, version) for this vendor.
    fn build_headers(&self, p: &ProviderConfig) -> Vec<(String, String)>;

    /// Transform a canonical (OpenAI-shaped) chat request into this vendor's
    /// upstream request format. Identity for OpenAI-compatible vendors.
    fn to_upstream_request(&self, canonical: Value) -> Value {
        canonical
    }

    /// Transform this vendor's upstream response back into the canonical
    /// (OpenAI-shaped) response. Identity for OpenAI-compatible vendors.
    fn parse_upstream_response(&self, native: Value) -> Value {
        native
    }

    /// Build a classification request body (system + user prompt).
    /// `max_output_token` is the provider's configured limit (`ProviderConfig.max_output_token`), if set.
    fn build_classify_request(&self, model: &str, system_prompt: &str, user_prompt: &str, max_output_token: Option<i32>) -> Value;

    /// Extract the raw assistant text from a classification response.
    fn extract_classify_text<'a>(&self, native: &'a Value) -> Option<&'a str>;

    /// Path appended to `provider.endpoint` for **streaming** requests.
    /// Default: same as `chat_path` (correct for most vendors).
    /// Override for vendors that use a different streaming endpoint (e.g. Gemini).
    fn stream_path(&self) -> &str {
        self.chat_path()
    }

    /// Whether this adapter's upstream SSE format requires conversion to OpenAI SSE.
    /// False (default) for OpenAI-compatible vendors (passthrough).
    /// True for Anthropic and Gemini native (format differs from OAI).
    fn needs_sse_transform(&self) -> bool {
        false
    }

    /// Transform one **complete** upstream SSE event into the canonical (OpenAI)
    /// SSE shape. Only called when `needs_sse_transform` is true.
    /// Default: passthrough (for OpenAI-compatible vendors).
    fn transform_stream_chunk(&self, chunk: &str) -> String {
        chunk.to_string()
    }

    /// Strict cross-dialect check: return `Err(msg)` for the first request field
    /// that cannot be translated to this vendor's upstream format.
    /// Default: `Ok(())` — identity transforms are always valid.
    fn check_cross_dialect(&self, _canonical: &Value) -> Result<(), String> {
        Ok(())
    }

    /// Extract (tokens_in, tokens_out) from a raw vendor response.
    /// Returns (None, None) when usage fields are absent.
    fn extract_usage(&self, resp: &Value) -> (Option<i32>, Option<i32>) {
        // Default: OpenAI-compatible usage.prompt_tokens / completion_tokens
        if let Some(usage) = resp.get("usage") {
            let tin  = usage.get("prompt_tokens").and_then(|v| v.as_u64()).map(|v| v as i32);
            let tout = usage.get("completion_tokens").and_then(|v| v.as_u64()).map(|v| v as i32);
            return (tin, tout);
        }
        (None, None)
    }
}

/// Factory: pick the adapter for a vendor string.
/// `endpoint` lets vendors with multiple API modes (e.g. Ollama native vs `/v1`) self-select.
/// `model` is needed for path-templated vendors (e.g. Gemini: `/models/{model}:generateContent`).
/// Unknown vendors fall back to the generic OpenAI-compatible adapter.
pub fn adapter_for(vendor: &str, endpoint: &str, model: Option<&str>) -> Box<dyn LlmAdapter> {
    match vendor {
        "openai"        => Box::new(openai::OpenAiAdapter),
        "anthropic"     => Box::new(anthropic::AnthropicAdapter),
        "openrouter"    => Box::new(openrouter::OpenRouterAdapter),
        "ollama"        => Box::new(ollama::OllamaAdapter::new(endpoint)),
        // Google Gemini Tier-1: explicit vendor arm via Google's OpenAI-compatible surface.
        // Provider endpoint must be set to …/v1beta/openai (see §7.1 upstream_findings.md).
        "google-gemini" => Box::new(openai_compatible::OpenAiCompatibleAdapter),
        // Google Gemini Tier-2: native generateContent API (vendor = "gemini").
        "gemini"        => Box::new(gemini::GeminiAdapter::new(
            model.unwrap_or("gemini-1.5-pro"),
        )),
        _               => Box::new(openai_compatible::OpenAiCompatibleAdapter),
    }
}

/// Convenience: build the adapter for a loaded [`ProviderConfig`].
pub fn adapter_for_provider(p: &ProviderConfig) -> Box<dyn LlmAdapter> {
    adapter_for(&p.vendor, &p.endpoint, p.model.as_deref())
}

// ── Shared types ─────────────────────────────────────────────────────────────

/// Represents a single content block from an OpenAI message.
/// Canonical parser in [`parse_openai_content`].
#[derive(Clone, Debug)]
pub(crate) enum OpenAiContentBlock {
    Text { text: String },
    ImageUrl { url: String },
    InputText { text: String },
}

/// Parse an OpenAI message content (string or array of blocks) into [`OpenAiContentBlock`] variants.
///
/// Handles the common intersection of the OpenAI message content schema that every
/// vendor adapter needs to walk.  Callers map the returned blocks into their own
/// vendor-specific representation.
pub(crate) fn parse_openai_content(content: &Value) -> Vec<OpenAiContentBlock> {
    let mut blocks = Vec::new();

    match content {
        Value::String(s) => {
            if !s.is_empty() {
                blocks.push(OpenAiContentBlock::Text { text: s.clone() });
            }
        }
        Value::Array(arr) => {
            for item in arr {
                if let Some(block) = item.as_object() {
                    match block.get("type").and_then(|t| t.as_str()) {
                        Some("text") => {
                            if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                                blocks.push(OpenAiContentBlock::Text { text: text.to_string() });
                            }
                        }
                        Some("image_url") => {
                            if let Some(url_val) = block.get("image_url") {
                                let url = if let Some(s) = url_val.as_str() {
                                    s.to_string()
                                } else if let Some(obj) = url_val.as_object() {
                                    obj.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string()
                                } else {
                                    url_val.to_string().trim_matches('"').to_string()
                                };
                                blocks.push(OpenAiContentBlock::ImageUrl { url });
                            }
                        }
                        Some("input_text") => {
                            if let Some(text) = block.get("input_text").and_then(|t| t.as_str()) {
                                blocks.push(OpenAiContentBlock::InputText { text: text.to_string() });
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
        _ => {
            if let Some(s) = content.as_str() {
                blocks.push(OpenAiContentBlock::Text { text: s.to_string() });
            }
        }
    }

    blocks
}

// ── Shared helpers ──────────────────────────────────────────────────────────

/// Standard OpenAI classification request body (system + user, temperature 0).
/// `max_output_token` falls back to 10240 when the provider has no configured limit.
pub fn openai_classify_request(model: &str, system_prompt: &str, user_prompt: &str, max_output_token: Option<i32>) -> Value {
    serde_json::json!({
        "model":       model,
        "messages":    [
            { "role": "system", "content": system_prompt },
            { "role": "user",   "content": user_prompt   },
        ],
        "max_tokens":  max_output_token.unwrap_or(10240),
        "temperature": crate::constants::CLASSIFICATION_TEMPERATURE,
    })
}

/// Extract assistant text from a standard OpenAI chat response.
pub fn openai_extract_text(native: &Value) -> Option<&str> {
    native.get("choices")?.get(0)?.get("message")?.get("content")?.as_str()
}
