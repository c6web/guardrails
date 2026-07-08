//! Re-exports for adapter modules — keeps `crate::...` paths stable for callers.

pub mod content_quality;
pub mod embedding;
pub mod llm;

use axum::http::HeaderMap;
use serde_json::Value as JsonValue;

/// Build an OpenAI-style tool_call entry from id, name, and input object.
/// All vendor adapters emit tool_use responses that get normalized to this shape.
pub fn make_openai_tool_call(id: &str, name: &str, input: &JsonValue) -> JsonValue {
    serde_json::json!({
        "id": id,
        "type": "function",
        "function": {
            "name": name,
            "arguments": serde_json::to_string(input).unwrap_or_default()
        }
    })
}

/// OpenRouter attribution constants (openrouter.ai app leaderboard).
pub const OPENROUTER_REFERER: &str = "https://ai-firewall-gateway.local";
pub const OPENROUTER_TITLE: &str = "AI Firewall Gateway";

/// Add OpenRouter attribution headers to a HeaderMap.
pub fn openrouter_headers(headers: &mut HeaderMap) {
    headers.insert("HTTP-Referer", OPENROUTER_REFERER.parse().unwrap());
    headers.insert("X-Title", OPENROUTER_TITLE.parse().unwrap());
}

/// Standard JSON + Bearer auth headers, shared by OpenAI-compatible vendors.
pub fn bearer_headers(api_key: Option<&str>) -> Vec<(String, String)> {
    let mut h = vec![("content-type".to_string(), "application/json".to_string())];
    if let Some(key) = api_key.filter(|k| !k.is_empty()) {
        h.push(("authorization".to_string(), format!("Bearer {}", key)));
    }
    h
}

/// Check if a JSON response body contains a provider-level error.
/// Returns the error message if found.
pub fn check_provider_error(data: &serde_json::Value) -> Option<String> {
    data.get("error")
        .and_then(|e| e.as_str().or_else(|| e.get("message").and_then(|m| m.as_str())))
        .map(|s| s.to_string())
}

/// Google API key headers for Gemini/Google AI.
pub fn google_headers(api_key: &str) -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert("x-goog-api-key", api_key.parse().unwrap());
    headers.insert("content-type", "application/json".parse().unwrap());
    headers
}

/// Standard JSON content-type headers.
pub fn json_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert("content-type", "application/json".parse().unwrap());
    headers
}

/// Detect whether an Ollama endpoint exposes the OpenAI-compatible surface.
pub fn is_ollama_compat(endpoint: &str) -> bool {
    endpoint.contains("/v1")
}

/// Extract Gemini usage stats from a response.
pub fn gemini_usage(data: &serde_json::Value) -> (i32, i32) {
    let usage = data.get("usageMetadata");
    let prompt = usage.and_then(|u| u.get("promptTokenCount")).and_then(|v| v.as_i64()).unwrap_or(0) as i32;
    let completion = usage.and_then(|u| u.get("candidatesTokenCount")).and_then(|v| v.as_i64()).unwrap_or(0) as i32;
    (prompt, completion)
}

/// Push an SSE `data: <json>\n\n` event into a String buffer.
pub fn push_sse_event(out: &mut String, value: &impl serde::Serialize) {
    if let Ok(json) = serde_json::to_string(value) {
        out.push_str("data: ");
        out.push_str(&json);
        out.push_str("\n\n");
    }
}

/// Map Anthropic stop_reason to OpenAI finish_reason.
pub fn anthropic_stop_to_openai_finish(stop_reason: &str) -> &'static str {
    match stop_reason {
        "end_turn" | "stop_sequence" => "stop",
        "max_tokens"                 => "length",
        "tool_use"                   => "tool_calls",
        _                            => "stop",
    }
}

/// Map OpenAI finish_reason to Anthropic stop_reason.
pub fn openai_finish_to_anthropic_stop(finish_reason: &str) -> &'static str {
    match finish_reason {
        "stop"       => "end_turn",
        "length"     => "max_tokens",
        "tool_calls" => "tool_use",
        _            => "end_turn",
    }
}

/// Map Gemini finish reason to OpenAI finish_reason.
pub fn gemini_finish_to_openai(finish: &str) -> &'static str {
    match finish {
        "MAX_TOKENS"        => "length",
        "SAFETY" | "RECITATION" => "content_filter",
        _                   => "stop",
    }
}

/// Iterator over SSE `data:` payload strings in a chunk.
/// Yields the content after each `data: ` prefix, trimmed, ignoring comments.
pub fn sse_data_payloads(chunk: &str) -> impl Iterator<Item = &str> {
    chunk.lines()
        .filter(|line| line.starts_with("data: "))
        .map(|line| line.trim_start_matches("data: ").trim())
        .filter(|payload| !payload.is_empty() && *payload != "[DONE]")
}
