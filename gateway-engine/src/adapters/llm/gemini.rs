//! Google Gemini native adapter (Tier-2).
//!
//! Implements the Gemini `generateContent` / `streamGenerateContent` API.
//! Path: `POST /v1beta/models/{model}:generateContent`
//! Auth: `x-goog-api-key` header.
//!
//! Use vendor `"gemini"` in the provider DB to activate this adapter.
//! For the OpenAI-compatible Tier-1 approach (simpler, via Google's compat layer),
//! keep vendor `"google-gemini"` — that uses the generic OpenAI adapter instead.

use serde_json::{json, Value};

use crate::adapters::{gemini_usage, google_headers, json_headers, push_sse_event, sse_data_payloads};
use super::{LlmAdapter, OpenAiContentBlock, parse_openai_content};
use crate::policy::ProviderConfig;

pub struct GeminiAdapter {
    model:       String,
    chat_path:   String,   // /v1beta/models/{model}:generateContent
    stream_path: String,   // /v1beta/models/{model}:streamGenerateContent?alt=sse
}

impl GeminiAdapter {
    pub fn new(model: &str) -> Self {
        Self {
            model: model.to_string(),
            chat_path:   format!("/v1beta/models/{}:generateContent", model),
            stream_path: format!("/v1beta/models/{}:streamGenerateContent?alt=sse", model),
        }
    }
}

impl LlmAdapter for GeminiAdapter {
    fn vendor(&self) -> &'static str { "gemini" }

    fn chat_path(&self) -> &str { &self.chat_path }

    fn stream_path(&self) -> &str { &self.stream_path }

    fn build_headers(&self, p: &ProviderConfig) -> Vec<(String, String)> {
        let key = p.api_key.as_deref().unwrap_or("");
        let hm = if key.is_empty() { json_headers() } else { google_headers(key) };
        (&hm).into_iter().map(|(k, v)| (k.to_string(), v.to_str().unwrap().to_string())).collect()
    }

    fn to_upstream_request(&self, canonical: Value) -> Value {
        openai_to_gemini(canonical)
    }

    fn parse_upstream_response(&self, native: Value) -> Value {
        gemini_to_openai(native, &self.model)
    }

    fn needs_sse_transform(&self) -> bool { true }

    fn transform_stream_chunk(&self, chunk: &str) -> String {
        gemini_sse_to_openai(chunk)
    }

    fn extract_usage(&self, resp: &Value) -> (Option<i32>, Option<i32>) {
        let (p, c) = gemini_usage(resp);
        (Some(p), Some(c))
    }

    fn build_classify_request(&self, _model: &str, system_prompt: &str, user_prompt: &str, max_output_token: Option<i32>) -> Value {
        // Gemini: model is in the URL path (chat_path), not in the request body.
        json!({
            "systemInstruction": { "parts": [{ "text": system_prompt }] },
            "contents": [{ "role": "user", "parts": [{ "text": user_prompt }] }],
            "generationConfig": { "maxOutputTokens": max_output_token.unwrap_or(10240), "temperature": crate::constants::CLASSIFICATION_TEMPERATURE },
        })
    }

    fn extract_classify_text<'a>(&self, native: &'a Value) -> Option<&'a str> {
        native.pointer("/candidates/0/content/parts/0/text")?.as_str()
    }
}

// ── OpenAI canonical → Gemini request ────────────────────────────────────────

fn openai_to_gemini(openai_req: Value) -> Value {
    let mut contents: Vec<Value>  = Vec::new();
    let mut system_parts: Vec<Value> = Vec::new();

    if let Some(msgs) = openai_req.get("messages").and_then(|v| v.as_array()) {
        for msg in msgs {
            let role    = msg.get("role").and_then(|r| r.as_str()).unwrap_or("");
            let content = msg.get("content").cloned().unwrap_or(json!(""));
            match role {
                "system" => {
                    match content {
                        Value::String(s) => {
                            if !s.is_empty() {
                                system_parts.push(json!({ "text": s }));
                            }
                        }
                        Value::Array(arr) => {
                            for item in arr {
                                if let Some(text) = item.get("text").and_then(|t| t.as_str())
                                    && !text.is_empty()
                                {
                                    system_parts.push(json!({ "text": text }));
                                }
                            }
                        }
                        _ => {}
                    }
                }
                "user"      => contents.push(json!({ "role": "user",  "parts": content_to_parts(content) })),
                "assistant" => {
                    let mut parts = content_to_parts(content);
                    if let Some(tool_calls) = msg.get("tool_calls").and_then(|v| v.as_array()) {
                        for tc in tool_calls {
                            if let Some(func) = tc.get("function") {
                                let name = func.get("name").and_then(|n| n.as_str()).unwrap_or("");
                                let args_str = func.get("arguments").and_then(|a| a.as_str()).unwrap_or("{}");
                                let args: Value = serde_json::from_str(args_str).unwrap_or(json!({}));
                                parts.push(json!({
                                    "functionCall": {
                                        "name": name,
                                        "args": args,
                                    }
                                }));
                            }
                        }
                    }
                    contents.push(json!({ "role": "model", "parts": parts }));
                }
                "tool" => {
                    if let Some(text) = content.as_str() {
                        contents.push(json!({ "role": "user", "parts": [{"text": format!("[Tool result: {}]", text)}] }));
                    }
                }
                _ => {}
            }
        }
    }

    let mut gen_config = json!({});
    if let Some(v) = openai_req.get("max_tokens")  { gen_config["maxOutputTokens"] = v.clone(); }
    if let Some(v) = openai_req.get("temperature") { gen_config["temperature"]     = v.clone(); }
    if let Some(v) = openai_req.get("top_p")       { gen_config["topP"]            = v.clone(); }
    if let Some(v) = openai_req.get("top_k")       { gen_config["topK"]            = v.clone(); }
    if let Some(v) = openai_req.get("stop")        { gen_config["stopSequences"]   = v.clone(); }

    let mut out = json!({ "contents": contents, "generationConfig": gen_config });

    if !system_parts.is_empty() {
        out["systemInstruction"] = json!({ "parts": system_parts });
    }

    // tools: OpenAI function tools → Gemini functionDeclarations
    if let Some(tools) = openai_req.get("tools").and_then(|v| v.as_array()) {
        let fn_decls: Vec<Value> = tools.iter()
            .filter(|t| t.get("type").and_then(|v| v.as_str()) == Some("function"))
            .filter_map(|t| t.get("function").cloned())
            .collect();
        if !fn_decls.is_empty() {
            out["tools"] = json!([{ "functionDeclarations": fn_decls }]);
        }
    }

    out
}

fn content_to_parts(content: Value) -> Vec<Value> {
    let blocks = parse_openai_content(&content);
    if blocks.is_empty() {
        return vec![json!({ "text": "" })];
    }
    blocks.iter().filter_map(|block| match block {
        OpenAiContentBlock::Text { text } => Some(json!({ "text": text })),
        OpenAiContentBlock::ImageUrl { url } => {
            if let Some(rest) = url.strip_prefix("data:") {
                if let Some((mime_and_enc, data)) = rest.split_once(',') {
                    let mime = mime_and_enc.split(';').next().unwrap_or("image/jpeg");
                    Some(json!({ "inlineData": { "mimeType": mime, "data": data } }))
                } else {
                    None
                }
            } else {
                Some(json!({ "fileData": { "mimeType": "image/jpeg", "fileUri": url } }))
            }
        }
        OpenAiContentBlock::InputText { text } => Some(json!({ "text": text })),
    }).collect()
}

// ── Gemini response → canonical OpenAI ───────────────────────────────────────

pub fn gemini_to_openai(gemini_resp: Value, model_fallback: &str) -> Value {
    let mut content    = String::new();
    let mut tool_calls: Vec<Value> = Vec::new();
    let finish_reason;

    if let Some(candidates) = gemini_resp.get("candidates").and_then(|v| v.as_array()) {
        let candidate = candidates.first().cloned().unwrap_or(json!({}));
        finish_reason = candidate
            .get("finishReason")
            .and_then(|r| r.as_str())
            .map(crate::adapters::gemini_finish_to_openai)
            .unwrap_or("stop");
        if let Some(parts) = candidate.pointer("/content/parts").and_then(|v| v.as_array()) {
            for part in parts {
                if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                    content.push_str(text);
                }
                if let Some(fc) = part.get("functionCall") {
                    let name = fc.get("name").and_then(|n| n.as_str()).unwrap_or("");
                    let args = fc.get("args").cloned().unwrap_or(json!({}));
                    let idx  = tool_calls.len();
                    tool_calls.push(
                        crate::adapters::make_openai_tool_call(&format!("call_{}", idx), name, &args)
                    );
                }
            }
        }
    } else {
        finish_reason = "stop";
    }

    let (prompt_tokens, output_tokens) = gemini_usage(&gemini_resp);
    let model = gemini_resp.get("modelVersion").and_then(|v| v.as_str()).unwrap_or(model_fallback);

    let corrected_finish_reason = if !tool_calls.is_empty() && finish_reason == "stop" {
        "tool_calls"
    } else {
        finish_reason
    };

    let mut message = json!({ "role": "assistant", "content": content });
    if !tool_calls.is_empty() {
        message["tool_calls"] = json!(tool_calls);
    }

    json!({
        "object": "chat.completion",
        "model":  model,
        "choices": [{ "index": 0, "message": message, "finish_reason": corrected_finish_reason }],
        "usage": {
            "prompt_tokens":     prompt_tokens,
            "completion_tokens": output_tokens,
            "total_tokens":      prompt_tokens + output_tokens,
        }
    })
}

// ── Gemini SSE → OpenAI SSE ───────────────────────────────────────────────────

/// Convert one complete Gemini SSE event into OpenAI `chat.completion.chunk` lines.
pub fn gemini_sse_to_openai(chunk: &str) -> String {
    let mut out = String::new();
    for payload in sse_data_payloads(chunk) {
        let Ok(evt) = serde_json::from_str::<Value>(payload) else { continue };

        if evt.get("usageMetadata").is_some() {
            let (prompt_tokens, completion_tokens) = gemini_usage(&evt);
            let prompt_tokens_o = (prompt_tokens > 0).then_some(prompt_tokens);
            let completion_tokens_o = (completion_tokens > 0).then_some(completion_tokens);
            if prompt_tokens_o.is_some() || completion_tokens_o.is_some() {
                let usage_evt = json!({
                    "object": "chat.completion.chunk",
                    "choices": [],
                    "usage": {
                        "prompt_tokens":     prompt_tokens_o,
                        "completion_tokens": completion_tokens_o,
                    },
                });
                push_sse_event(&mut out, &usage_evt);
            }
        }

        let Some(candidates) = evt.get("candidates").and_then(|v| v.as_array()) else { continue };
        let Some(candidate) = candidates.first() else { continue };

        let finish_reason = candidate.get("finishReason").and_then(|r| r.as_str());

        if let Some(parts) = candidate.pointer("/content/parts").and_then(|v| v.as_array()) {
            for part in parts {
                if let Some(text) = part.get("text").and_then(|t| t.as_str())
                    && !text.is_empty() {
                        let chunk_evt = json!({
                            "object": "chat.completion.chunk",
                            "choices": [{ "index": 0, "delta": { "content": text }, "finish_reason": Value::Null }]
                        });
                        push_sse_event(&mut out, &chunk_evt);
                    }
            }
        }

        if let Some(reason) = finish_reason
            && matches!(reason, "STOP" | "MAX_TOKENS" | "SAFETY" | "RECITATION" | "OTHER") {
                let oai_reason = crate::adapters::gemini_finish_to_openai(reason);
                let fin_evt = json!({
                    "object": "chat.completion.chunk",
                    "choices": [{ "index": 0, "delta": {}, "finish_reason": oai_reason }]
                });
                push_sse_event(&mut out, &fin_evt);
                out.push_str("data: [DONE]\n\n");
            }
    }
    out
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_openai_to_gemini_basic() {
        let req = json!({
            "model": "gemini-1.5-pro",
            "messages": [
                {"role": "system", "content": "Be helpful."},
                {"role": "user",   "content": "Hello!"}
            ],
            "max_tokens": 512,
            "temperature": 0.7,
            "top_p": 0.9,
            "top_k": 40
        });
        let gemini = openai_to_gemini(req);
        assert_eq!(gemini["systemInstruction"]["parts"][0]["text"], "Be helpful.");
        let contents = gemini["contents"].as_array().unwrap();
        assert_eq!(contents[0]["role"], "user");
        assert_eq!(gemini["generationConfig"]["maxOutputTokens"], 512);
        assert_eq!(gemini["generationConfig"]["temperature"], 0.7);
        assert_eq!(gemini["generationConfig"]["topP"], 0.9);
        assert_eq!(gemini["generationConfig"]["topK"], 40);
    }

    #[test]
    fn test_gemini_to_openai_basic() {
        let resp = json!({
            "candidates": [{
                "content": { "parts": [{"text": "Hi!"}], "role": "model" },
                "finishReason": "STOP"
            }],
            "usageMetadata": { "promptTokenCount": 5, "candidatesTokenCount": 3 },
            "modelVersion": "gemini-1.5-pro"
        });
        let oai = gemini_to_openai(resp, "gemini-1.5-pro");
        assert_eq!(oai["choices"][0]["message"]["content"], "Hi!");
        assert_eq!(oai["choices"][0]["finish_reason"], "stop");
        assert_eq!(oai["usage"]["prompt_tokens"], 5);
        assert_eq!(oai["usage"]["completion_tokens"], 3);
    }

    #[test]
    fn test_gemini_sse_to_openai_text() {
        let chunk = "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Hello\"}],\"role\":\"model\"},\"finishReason\":\"STOP\"}]}\n\n";
        let out = gemini_sse_to_openai(chunk);
        assert!(out.contains("chat.completion.chunk"));
        assert!(out.contains("Hello"));
        assert!(out.contains("[DONE]"));
    }
}
