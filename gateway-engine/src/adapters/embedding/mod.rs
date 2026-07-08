//! Per-vendor embedding adapters — one adapter, one file.
//!
//! Each vendor lives in its own file and implements [`EmbeddingAdapter`]. Adding
//! a new embedding provider means adding one file and one match arm in
//! [`adapter_for`] — the same arrangement as the LLM adapters in `llm_adapters/`.
//!
//! An adapter knows how to build the request URL, headers and body for its
//! provider, and how to parse the embedding vector out of the response.

use serde_json::{json, Value};

use crate::adapters::check_provider_error;
use crate::agents::embedding::client::EmbeddingProviderConfig;

pub mod google;
pub mod ollama;
pub mod openai;
pub mod openai_compatible;
pub mod openrouter;

// ── Default models per vendor ─────────────────────────────────────────────────

pub const DEFAULT_MODEL_OPENAI: &str = "text-embedding-3-small";
pub const DEFAULT_MODEL_OLLAMA: &str = "nomic-embed-text";
pub const DEFAULT_MODEL_GOOGLE: &str = "text-embedding-004";

// ── Adapter trait ──────────────────────────────────────────────────────────────

/// One adapter per embedding provider vendor.
pub trait EmbeddingAdapter: Send + Sync {
    /// Stable vendor key, for logging/diagnostics.
    fn vendor(&self) -> &'static str;

    /// Path appended to `provider.endpoint` for the embeddings request.
    fn endpoint_path(&self, p: &EmbeddingProviderConfig) -> String;

    /// HTTP headers (auth + content-type) for this vendor.
    fn build_headers(&self, p: &EmbeddingProviderConfig) -> Vec<(String, String)>;

    /// Build the JSON request body for this vendor.
    fn build_body(&self, p: &EmbeddingProviderConfig, input: &str) -> Value;

    /// Parse the JSON response body into a flat embedding vector.
    fn parse_response(&self, data: &Value) -> Result<Vec<f32>, String>;
}

/// Factory: pick the adapter for a loaded embedding provider. Unknown vendors
/// fall back to the generic OpenAI-compatible adapter.
pub fn adapter_for(p: &EmbeddingProviderConfig) -> Box<dyn EmbeddingAdapter> {
    match p.vendor.as_str() {
        "openai" => Box::new(openai::OpenAiEmbeddingAdapter),
        "openrouter" => Box::new(openrouter::OpenRouterEmbeddingAdapter),
        "ollama" => Box::new(ollama::OllamaEmbeddingAdapter::new(&p.endpoint)),
        "google" => Box::new(google::GoogleEmbeddingAdapter),
        _ => Box::new(openai_compatible::OpenAiCompatibleEmbeddingAdapter),
    }
}

// ── Shared helpers ──────────────────────────────────────────────────────────────

/// Build the standard OpenAI-style embedding body: `input` + optional `model`
/// + optional `dimensions`. Shared by the OpenAI-compatible vendor family.
pub fn standard_body(p: &EmbeddingProviderConfig, input: &str) -> Value {
    let model = p.model.as_deref().or_else(|| default_model(&p.vendor));
    let mut body = json!({ "input": input });
    if let Some(m) = model {
        body["model"] = json!(m);
    }
    if let Some(d) = p.dimensions {
        body["dimensions"] = json!(d);
    }
    body
}

/// Parse an OpenAI-format embedding response (`data[0].embedding`), with detailed
/// error hints and error-in-200-body detection.
pub fn parse_openai_response(data: &Value) -> Result<Vec<f32>, String> {
    // Some providers (e.g. OpenRouter) return HTTP 200 with an error body
    if let Some(msg) = check_provider_error(data) {
        return Err(format!("provider error: {}", msg));
    }

    let arr = data["data"][0]["embedding"].as_array().ok_or_else(|| {
        if data.get("data").is_none() {
            "response has no \"data\" field".to_string()
        } else if data["data"].as_array().map(|a| a.is_empty()).unwrap_or(true) {
            "\"data\" array is empty".to_string()
        } else {
            "\"data[0].embedding\" is null or not an array".to_string()
        }
    })?;

    extract_f32(arr, "data[0].embedding")
}

/// Default embedding model per vendor.
pub fn default_model(vendor: &str) -> Option<&'static str> {
    match vendor {
        "openai" | "openrouter" => Some(DEFAULT_MODEL_OPENAI),
        "ollama" => Some(DEFAULT_MODEL_OLLAMA),
        _ => None,
    }
}

/// Convert a JSON array of numbers into a `Vec<f32>`, erroring on empty arrays.
pub fn extract_f32(arr: &[Value], field: &str) -> Result<Vec<f32>, String> {
    if arr.is_empty() {
        return Err(format!("\"{}\" is an empty array", field));
    }
    Ok(arr.iter().map(|v| v.as_f64().unwrap_or(0.0) as f32).collect())
}
