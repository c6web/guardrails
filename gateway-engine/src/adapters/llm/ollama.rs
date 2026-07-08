//! Ollama adapter — two API modes, selected from the endpoint (mirrors the
//! embedding adapter's Ollama handling):
//!   - **compat**: endpoint contains `/v1` → OpenAI-compatible `/chat/completions`.
//!   - **native**: otherwise → Ollama's own `/api/chat` request/response shape.

use serde_json::{json, Value};

use crate::adapters::{is_ollama_compat, json_headers};
use super::{openai_classify_request, openai_extract_text, LlmAdapter, OpenAiContentBlock, parse_openai_content};
use crate::policy::ProviderConfig;

pub struct OllamaAdapter {
    /// True when the endpoint exposes the OpenAI-compatible `/v1` surface.
    compat: bool,
}

impl OllamaAdapter {
    pub fn new(endpoint: &str) -> Self {
        OllamaAdapter { compat: is_ollama_compat(endpoint) }
    }
}

/// Translate OpenAI tool definitions to Ollama native format.
/// OpenAI: [{"type":"function","function":{"name":"get_weather","description":"...","parameters":{...}}}]
/// Ollama: [{"type":"function","function":{"name":"get_weather","description":"...","parameters":{...}}}]
fn translate_openai_tools_to_ollama(openai_tools: Value) -> Value {
    let mut ollama_tools: Vec<Value> = Vec::new();

    if let Some(tools) = openai_tools.as_array() {
        for tool in tools {
            if let Some("function") = tool.get("type").and_then(|t| t.as_str())
                && let Some(func) = tool.get("function") {
                let mut ollama_tool = json!({ "type": "function" });

                if let Some(func_obj) = func.as_object() {
                    for (key, val) in func_obj {
                        ollama_tool["function"][key] = val.clone();
                    }
                }

                if let Some(params) = ollama_tool.get("function").and_then(|f| f.get("parameters"))
                    && !params.get("type").and_then(|t| t.as_str()).map(|s| s == "object").unwrap_or(false) {
                    let mut new_params = params.clone();
                    new_params["type"] = json!("object");
                    ollama_tool["function"]["parameters"] = new_params;
                }

                ollama_tools.push(ollama_tool);
            }
        }
    }

    if ollama_tools.is_empty() {
        json!([])
    } else {
        json!(ollama_tools)
    }
}

/// Translate Ollama tool_use response to OpenAI tool_calls format.
fn translate_ollama_tool_use_to_openai(tool_use: &Value) -> Value {
    let name = tool_use.get("name").and_then(|n| n.as_str()).unwrap_or("");
    let input = tool_use.get("input").cloned().unwrap_or(json!({}));
    let id = format!("ollama_{}", name); // Ollama doesn't provide IDs.
    crate::adapters::make_openai_tool_call(&id, name, &input)
}

impl LlmAdapter for OllamaAdapter {
    fn vendor(&self) -> &'static str {
        "ollama"
    }

    fn chat_path(&self) -> &str {
        if self.compat { "/chat/completions" } else { "/api/chat" }
    }

    fn build_headers(&self, _p: &ProviderConfig) -> Vec<(String, String)> {
        // Ollama is typically unauthenticated and local.
        let hm = json_headers();
        (&hm).into_iter().map(|(k, v)| (k.to_string(), v.to_str().unwrap().to_string())).collect()
    }

    fn to_upstream_request(&self, canonical: Value) -> Value {
        if self.compat {
            return canonical;
        }
        // Native /api/chat: translate OpenAI fields to Ollama's format.
        
        // Translate messages and extract images.
        let mut ollama_messages: Vec<Value> = Vec::new();
        let mut ollama_images: Vec<Value> = Vec::new();

        if let Some(msgs) = canonical.get("messages").and_then(|v| v.as_array()) {
            for msg in msgs {
                let role = msg.get("role").and_then(|r| r.as_str()).unwrap_or("");
                let content = msg.get("content").cloned().unwrap_or(json!(""));
                
                match role {
                    "system" => {
                        let blocks = parse_openai_content(&content);
                        for block in &blocks {
                            match block {
                                OpenAiContentBlock::Text { text } | OpenAiContentBlock::InputText { text } => {
                                    ollama_messages.push(json!({ "role": "system", "content": text }));
                                }
                                OpenAiContentBlock::ImageUrl { url } => {
                                    ollama_images.push(json!(url));
                                }
                            }
                        }
                    }
                    "user" => {
                        let blocks = parse_openai_content(&content);
                        let mut text_content = String::new();
                        for block in &blocks {
                            match block {
                                OpenAiContentBlock::Text { text } | OpenAiContentBlock::InputText { text } => {
                                    text_content.push_str(text);
                                }
                                OpenAiContentBlock::ImageUrl { url } => {
                                    ollama_images.push(json!(url));
                                }
                            }
                        }
                        let mut msg_obj = json!({ "role": "user", "content": text_content });
                        if !ollama_images.is_empty() {
                            let mut content_arr: Vec<Value> = Vec::new();
                            if !text_content.is_empty() {
                                content_arr.push(json!(text_content));
                            }
                            for img in &ollama_images {
                                content_arr.push(json!({ "type": "image", "image": img }));
                            }
                            msg_obj["content"] = json!(content_arr);
                        }
                        ollama_messages.push(msg_obj);
                    }
                    "assistant" => {
                        let mut assistant_text = String::new();
                        let mut tool_uses: Vec<Value> = Vec::new();
                        
                        if let Some(content_val) = msg.get("content") {
                            let blocks = parse_openai_content(content_val);
                            for block in &blocks {
                                match block {
                                    OpenAiContentBlock::Text { text } | OpenAiContentBlock::InputText { text } => {
                                        assistant_text.push_str(text);
                                    }
                                    _ => {}
                                }
                            }
                            // tool_use blocks in content array (flat shape: {"type":"tool_use","name":...,"input":...})
                            if let Some(arr) = content_val.as_array() {
                                for item in arr {
                                    if item.get("type").and_then(|t| t.as_str()) == Some("tool_use")
                                        && let Some(name) = item.get("name").and_then(|n| n.as_str()) {
                                            let input = item.get("input").cloned().unwrap_or(json!({}));
                                            tool_uses.push(json!({ "tool_use": { "name": name, "input": input } }));
                                        }
                                }
                            }
                        }
                        
                        if let Some(tool_calls) = msg.get("tool_calls").and_then(|v| v.as_array()) {
                            for tc in tool_calls {
                                if let Some(func) = tc.get("function") {
                                    let name = func.get("name").and_then(|n| n.as_str()).unwrap_or("");
                                    let args = func.get("arguments").and_then(|a| a.as_str()).unwrap_or("{}");
                                    let input: Value = serde_json::from_str(args).unwrap_or(json!({}));
                                    tool_uses.push(json!({ "tool_use": { "name": name, "input": input } }));
                                }
                            }
                        }
                        
                        let mut msg_obj = json!({ "role": "assistant" });
                        if !assistant_text.is_empty() && tool_uses.is_empty() {
                            msg_obj["content"] = json!(assistant_text);
                        } else if !tool_uses.is_empty() {
                            msg_obj["content"] = json!(tool_uses);
                        } else {
                            msg_obj["content"] = json!("");
                        }
                        ollama_messages.push(msg_obj);
                    }
                    _ => {}
                }
            }
        }

        // Build the Ollama request body.
        let mut body = json!({
            "messages": ollama_messages,
            "stream":   canonical.get("stream").cloned().unwrap_or(json!(false)),
        });
        
        if let Some(model) = canonical.get("model") {
            body["model"] = model.clone();
        }

        // Map standard OpenAI sampling params → options
        let mut options = json!({});
        if let Some(v) = canonical.get("max_tokens")   { options["num_predict"] = v.clone(); }
        if let Some(v) = canonical.get("temperature")  { options["temperature"] = v.clone(); }
        if let Some(v) = canonical.get("top_p")        { options["top_p"]       = v.clone(); }
        if let Some(v) = canonical.get("top_k")        { options["top_k"]       = v.clone(); }
        if let Some(v) = canonical.get("stop")         { options["stop"]        = v.clone(); }
        if options.as_object().map(|o| !o.is_empty()).unwrap_or(false) {
            body["options"] = options;
        }

        // Pass through tools (translated to Ollama format).
        if let Some(tools) = canonical.get("tools") {
            body["tools"] = translate_openai_tools_to_ollama(tools.clone());
        }

        body
    }

    fn parse_upstream_response(&self, native: Value) -> Value {
        if self.compat {
            return native;
        }
        // Native /api/chat response → canonical OpenAI shape.
        
        let message = native.get("message").and_then(|m| m.as_object());
        let content = message
            .and_then(|m| m.get("content"))
            .and_then(|c| c.as_str())
            .unwrap_or("");
            
        // Check for tool_use in content array.
        let mut tool_calls: Vec<Value> = Vec::new();
        if let Some(content_val) = native.get("message").and_then(|m| m.get("content"))
            && let Some(arr) = content_val.as_array() {
                for item in arr {
                    if let Some(tool_use) = item.get("tool_use") {
                        tool_calls.push(translate_ollama_tool_use_to_openai(tool_use));
                    }
                }
            }

        let prompt_tokens = native.get("prompt_eval_count").and_then(|v| v.as_u64()).unwrap_or(0);
        let completion_tokens = native.get("eval_count").and_then(|v| v.as_u64()).unwrap_or(0);
        
        let mut message_obj = json!({ "role": "assistant", "content": if content.is_empty() && tool_calls.is_empty() { json!("") } else { json!(content) }});
        if !tool_calls.is_empty() {
            message_obj["tool_calls"] = json!(tool_calls);
        }

        json!({
            "object": "chat.completion",
            "model":  native.get("model").cloned().unwrap_or(json!("")),
            "choices": [{
                "index": 0,
                "message": message_obj,
                "finish_reason": if !tool_calls.is_empty() { "tool_calls" } else { "stop" },
            }],
            "usage": {
                "prompt_tokens":     prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens":      prompt_tokens + completion_tokens,
            },
        })
    }

    fn build_classify_request(&self, model: &str, system_prompt: &str, user_prompt: &str, max_output_token: Option<i32>) -> Value {
        if self.compat {
            return openai_classify_request(model, system_prompt, user_prompt, max_output_token);
        }
        let mut body = json!({
            "model":    model,
            "messages": [
                { "role": "system", "content": system_prompt },
                { "role": "user",   "content": user_prompt   },
            ],
            "stream":   false,
        });
        if let Some(max_output_token) = max_output_token {
            body["options"] = json!({ "num_predict": max_output_token });
        }
        body
    }

    fn extract_classify_text<'a>(&self, native: &'a Value) -> Option<&'a str> {
        if self.compat {
            return openai_extract_text(native);
        }
        native.get("message")?.get("content")?.as_str()
    }

    fn check_cross_dialect(&self, canonical: &Value) -> Result<(), String> {
        // Native mode now supports tools via translation.
        if !self.compat {
            // Validate tool definitions for Ollama compatibility.
            if let Some(tools) = canonical.get("tools").and_then(|v| v.as_array()) {
                for tool in tools {
                    match tool.get("type").and_then(|t| t.as_str()) {
                        Some("function") => {
                            // Ollama supports function tools.
                            if let Some(func) = tool.get("function")
                                && func.get("parameters").is_none() {
                                    return Err(
                                        "Ollama native mode requires 'parameters' in tool definitions. \
                                         Use an Ollama endpoint containing '/v1' for full OpenAI compatibility."
                                            .to_string()
                                    );
                                }
                        }
                        _ => {
                            return Err(
                                "Ollama native mode only supports 'function' type tools. \
                                 Use an Ollama endpoint containing '/v1' for other tool types."
                                    .to_string()
                            );
                        }
                    }
                }
            }
        }
        Ok(())
    }

    fn extract_usage(&self, resp: &Value) -> (Option<i32>, Option<i32>) {
        if self.compat {
            // compat mode: standard OpenAI usage fields
            if let Some(usage) = resp.get("usage") {
                let tin  = usage.get("prompt_tokens").and_then(|v| v.as_u64()).map(|v| v as i32);
                let tout = usage.get("completion_tokens").and_then(|v| v.as_u64()).map(|v| v as i32);
                return (tin, tout);
            }
            return (None, None);
        }
        // native /api/chat: prompt_eval_count / eval_count
        let tin  = resp.get("prompt_eval_count").and_then(|v| v.as_u64()).map(|v| v as i32);
        let tout = resp.get("eval_count").and_then(|v| v.as_u64()).map(|v| v as i32);
        (tin, tout)
    }
}
