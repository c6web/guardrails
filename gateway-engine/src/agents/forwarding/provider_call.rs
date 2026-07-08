/// Provider request helper — builds and sends a request to an upstream LLM provider.
use axum::body::Bytes;
use axum::http::HeaderMap;
use reqwest::Client;
use serde_json::Value;

use crate::adapters::llm::LlmAdapter;
use crate::policy::ProviderConfig;

use super::helpers::ALLOWED_CLIENT_HEADERS;

/// Send a single request to an upstream provider.
pub(super) async fn try_provider(
    client:        &Client,
    provider:      &ProviderConfig,
    adapter:       &dyn LlmAdapter,
    body:          &Value,
    raw_bytes:     Option<&Bytes>,
    content_type:  Option<&str>,
    is_streaming:  bool,
    path_override: Option<&str>,
    client_headers: &HeaderMap,
) -> Result<reqwest::Response, reqwest::Error> {
    let path = path_override.unwrap_or_else(|| {
        if is_streaming { adapter.stream_path() } else { adapter.chat_path() }
    });
    let url = format!("{}{}", provider.endpoint.trim_end_matches('/'), path);

    let body_payload: Bytes = match raw_bytes {
        Some(raw) => raw.clone(),
        None      => Bytes::from(serde_json::to_vec(body).unwrap_or_default()),
    };
    let mut req = client.post(&url).body(body_payload);

    // Apply adapter headers; replace content-type when an override is provided
    for (name, value) in adapter.build_headers(provider) {
        if name == "content-type" {
            req = req.header("content-type", content_type.unwrap_or(&value));
        } else {
            req = req.header(name, value);
        }
    }

    // F-8: pass through allowed client headers (openai-beta, anthropic-beta, tracing, etc.)
    for hname in ALLOWED_CLIENT_HEADERS {
        if let Some(val) = client_headers.get(*hname) {
            req = req.header(*hname, val);
        }
    }

    if provider.timeout_ms > 0 {
        req = req.timeout(std::time::Duration::from_millis(provider.timeout_ms));
    }
    req.send().await
}
