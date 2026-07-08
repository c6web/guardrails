//! OpenAI → Anthropic request conversion functions and helpers.
//!
//! Handles the vendor-side direction: canonical OpenAI chat request → Anthropic Messages request.

use serde_json::{json, Value};

use super::super::{OpenAiContentBlock, parse_openai_content};
use super::adapters::DEFAULT_MAX_TOKENS;

// ── Vendor-side transforms (canonical OpenAI → Anthropic) ────────────────────

/// Canonical OpenAI chat request → Anthropic Messages request.
pub fn openai_request_to_anthropic(openai_req: Value) -> Value {
    let mut system_content = String::new();
    let mut messages: Vec<Value> = Vec::new();

    if let Some(msgs) = openai_req.get("messages").and_then(|v| v.as_array()) {
        for msg in msgs {
            let role = msg.get("role").and_then(|r| r.as_str()).unwrap_or("");
            match role {
                "system" => {
                    if let Some(content) = msg.get("content") {
                        if let Some(s) = content.as_str() {
                            if !system_content.is_empty() {
                                system_content.push_str("\n\n");
                            }
                            system_content.push_str(s);
                        } else if let Some(arr) = content.as_array() {
                            for item in arr {
                                if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                                    if !system_content.is_empty() {
                                        system_content.push_str("\n\n");
                                    }
                                    system_content.push_str(text);
                                } else if let Some(s) = item.as_str() {
                                    if !system_content.is_empty() {
                                        system_content.push_str("\n\n");
                                    }
                                    system_content.push_str(s);
                                }
                            }
                        }
                    }
                }
                "user" | "assistant" => {
                    let content = msg.get("content").cloned().unwrap_or(json!(""));
                    let anthropic_content = translate_openai_message_content_to_anthropic(&content);

                    let mut anth_msg = json!({ "role": role, "content": anthropic_content });

                    if role == "assistant"
                        && let Some(tool_calls) = msg.get("tool_calls").and_then(|v| v.as_array()) {
                            let mut anthropic_tool_uses: Vec<Value> = Vec::new();
                            for tc in tool_calls {
                                if let Some(func) = tc.get("function") {
                                    let id = tc.get("id").and_then(|i| i.as_str()).unwrap_or("");
                                    let name = func.get("name").and_then(|n| n.as_str()).unwrap_or("");
                                    let input_str = func.get("arguments").and_then(|a| a.as_str()).unwrap_or("{}");
                                    let input: Value = serde_json::from_str(input_str).unwrap_or(json!({}));
                                    anthropic_tool_uses.push(json!({
                                        "type": "tool_use",
                                        "id": id,
                                        "name": name,
                                        "input": input,
                                    }));
                                }
                            }
                            if !anthropic_tool_uses.is_empty()
                                && let Some(current_content) = anth_msg.get("content") {
                                    if current_content.as_str().map(|s| s.is_empty()).unwrap_or(true) {
                                        anth_msg["content"] = json!(anthropic_tool_uses);
                                    } else {
                                        let mut all_blocks: Vec<Value> = Vec::new();
                                        if let Some(text) = current_content.as_str() {
                                            if !text.is_empty() {
                                                all_blocks.push(json!({ "type": "text", "text": text }));
                                            }
                                        } else if let Some(arr) = current_content.as_array() {
                                            for b in arr {
                                                if let Some(t) = b.get("type").and_then(|t| t.as_str())
                                                    && (t != "text" || b.get("text").and_then(|t| t.as_str()).map(|s| !s.is_empty()).unwrap_or(false)) {
                                                        all_blocks.push(b.clone());
                                                    }
                                            }
                                        }
                                        for tu in &anthropic_tool_uses {
                                            all_blocks.push(tu.clone());
                                        }
                                        anth_msg["content"] = json!(all_blocks);
                                    }
                                }
                        }

                    messages.push(anth_msg);
                }
                "tool_use" | "function" => {
                    let name = msg.get("name").and_then(|n| n.as_str()).unwrap_or("");
                    let input = msg.get("input").cloned().unwrap_or(json!({}));
                    let id = msg.get("id").and_then(|i| i.as_str()).unwrap_or("");
                    messages.push(json!({
                        "role": role,
                        "content": json!({ "type": "tool_use", "id": id, "name": name, "input": input }),
                    }));
                }
                "tool" => {
                    let tool_call_id = msg.get("tool_call_id").and_then(|i| i.as_str()).unwrap_or("");
                    let content = msg.get("content").and_then(|c| c.as_str()).unwrap_or("");
                    messages.push(json!({
                        "role": "user",
                        "content": [{
                            "type": "tool_result",
                            "tool_use_id": tool_call_id,
                            "content": content,
                        }]
                    }));
                }
                "developer" => {
                    if let Some(content) = msg.get("content")
                        && let Some(s) = content.as_str()
                    {
                        if !system_content.is_empty() {
                            system_content.push_str("\n\n");
                        }
                        system_content.push_str(s);
                    }
                }
                _ => {}
            }
        }
    }

    let remaining: [&str; 4] = [
        "temperature", "top_p", "top_k", "stream",
    ];

    let max_tokens = openai_req.get("max_tokens").and_then(|v| v.as_u64()).unwrap_or(DEFAULT_MAX_TOKENS);

    let mut out = json!({
        "messages":   messages,
        "max_tokens": max_tokens,
    });
    if let Some(model) = openai_req.get("model") {
        out["model"] = model.clone();
    }
    if !system_content.is_empty() {
        out["system"] = json!(system_content);
    }
    if let Some(val) = openai_req.get("stop") {
        out["stop_sequences"] = val.clone();
    }
    for key in &remaining {
        if let Some(val) = openai_req.get(*key) {
            out[*key] = val.clone();
        }
    }
    if let Some(tools) = openai_req.get("tools") {
        out["tools"] = translate_openai_tools_to_anthropic(tools.clone());
    }
    if let Some(tc) = openai_req.get("tool_choice") {
        out["tool_choice"] = translate_openai_tool_choice_to_anthropic(tc);
    }
    // Anthropic doesn't support response_format, seed, user, or logit_bias — drop them
    out
}

/// Translate OpenAI message content to Anthropic format.
fn translate_openai_message_content_to_anthropic(content: &Value) -> Value {
    let openai_blocks = parse_openai_content(content);
    openai_content_to_anthropic(&openai_blocks)
}

/// Translate OpenAI tool definitions to Anthropic format.
pub fn translate_openai_tools_to_anthropic(openai_tools: Value) -> Value {
    let mut anthropic_tools: Vec<Value> = Vec::new();

    if let Some(tools) = openai_tools.as_array() {
        for tool in tools {
            if let Some("function") = tool.get("type").and_then(|t| t.as_str())
                && let Some(func) = tool.get("function") {
                    let name = func.get("name").and_then(|n| n.as_str()).unwrap_or("");
                    let description = func.get("description").and_then(|d| d.as_str()).unwrap_or("");

                    let mut input_schema = func.get("parameters").cloned().unwrap_or(json!({}));

                    if !input_schema.get("type").and_then(|t| t.as_str()).map(|s| s == "object").unwrap_or(false) {
                        input_schema["type"] = json!("object");
                    }

                    let mut block = json!({
                        "name": name,
                        "description": description,
                        "input_schema": input_schema,
                    });

                    if let Some(func_obj) = func.as_object() {
                        for (key, val) in func_obj.iter() {
                            if key != "name" && key != "description" && key != "parameters" {
                                block[key] = val.clone();
                            }
                        }
                    }

                    anthropic_tools.push(block);
                }
        }
    }

    if anthropic_tools.is_empty() {
        json!([])
    } else {
        json!(anthropic_tools)
    }
}

/// Translate OpenAI tool_choice to Anthropic format.
pub fn translate_openai_tool_choice_to_anthropic(openai_tc: &Value) -> Value {
    match openai_tc.as_str() {
        Some("none") => json!("none"),
        Some("auto") => json!("auto"),
        Some("required") | Some("") | None => json!({ "type": "tool", "name": "" }),
        Some(other) if other == "none" || other == "auto" => json!(other),
        _ => {
            if let Some(tc_obj) = openai_tc.as_object() {
                if let Some(func) = tc_obj.get("function") {
                    if let Some(name) = func.get("name").and_then(|n| n.as_str()) {
                        json!({ "type": "tool", "name": name })
                    } else {
                        json!({ "type": "tool", "name": "" })
                    }
                } else if let Some(tc_type) = tc_obj.get("type").and_then(|t| t.as_str()) {
                    if tc_type == "function" {
                        json!("any")
                    } else {
                        json!({ "type": tc_type, "name": "" })
                    }
                } else {
                    json!({ "type": "tool", "name": "" })
                }
            } else {
                json!({ "type": "tool", "name": "" })
            }
        }
    }
}

/// Convert OpenAI content blocks to Anthropic message content.
fn openai_content_to_anthropic(blocks: &[OpenAiContentBlock]) -> Value {
    if blocks.is_empty() {
        return json!("");
    }

    let all_text = blocks.iter().all(|b| matches!(b, OpenAiContentBlock::Text { .. }));
    if all_text {
        let text: Vec<String> = blocks
            .iter()
            .filter_map(|b| match b {
                OpenAiContentBlock::Text { text } => Some(text.clone()),
                _ => None,
            })
            .collect();
        return json!(text.join("\n\n"));
    }

    let mut anthropic_blocks: Vec<Value> = Vec::new();

    for block in blocks {
        match block {
            OpenAiContentBlock::Text { text } => {
                if !text.is_empty() {
                    anthropic_blocks.push(json!({ "type": "text", "text": text }));
                }
            }
            OpenAiContentBlock::ImageUrl { url, .. } => {
                let (data_or_url, mime, is_data_uri) = parse_image_url(url);
                if is_data_uri {
                    anthropic_blocks.push(json!({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": mime.clone(),
                            "data": data_or_url.clone(),
                        }
                    }));
                } else {
                    anthropic_blocks.push(json!({
                        "type": "image",
                        "source": {
                            "type": "url",
                            "url": data_or_url.clone(),
                        }
                    }));
                }
            }
            OpenAiContentBlock::InputText { text } => {
                if !text.is_empty() {
                    anthropic_blocks.push(json!({ "type": "text", "text": text }));
                }
            }
        }
    }

    json!(anthropic_blocks)
}

/// Parse an image URL and return (data_or_url, mime_type, is_data_uri).
pub fn parse_image_url(url: &str) -> (String, String, bool) {
    if url.starts_with("data:") {
        let parts: Vec<&str> = url.split(',').collect();
        if parts.len() == 2 {
            let mime_part = parts[0];
            let base64_data = parts[1].to_string();
            let mime = mime_part
                .split(';')
                .next()
                .and_then(|m| m.rsplit(':').next())
                .unwrap_or("image/jpeg")
                .to_string();
            (base64_data, mime, true)
        } else {
            ("".to_string(), "image/jpeg".to_string(), true)
        }
    } else {
        (url.to_string(), "image/jpeg".to_string(), false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_openai_request_to_anthropic() {
        let openai_req = json!({
            "model": "claude-3-5-sonnet",
            "messages": [
                {"role": "system", "content": "Be terse."},
                {"role": "user", "content": "Hi"}
            ],
            "max_tokens": 256,
            "temperature": 0.2
        });
        let anthropic = openai_request_to_anthropic(openai_req);
        assert_eq!(anthropic["system"], "Be terse.");
        assert_eq!(anthropic["max_tokens"], 256);
        assert_eq!(anthropic["temperature"], 0.2);
        let msgs = anthropic["messages"].as_array().unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0]["role"], "user");
    }

    #[test]
    fn test_openai_request_to_anthropic_default_max_tokens() {
        let openai_req = json!({
            "model": "claude-3",
            "messages": [{"role": "user", "content": "Hi"}]
        });
        let anthropic = openai_request_to_anthropic(openai_req);
        assert_eq!(anthropic["max_tokens"], 4096);
        assert!(anthropic.get("system").is_none());
    }

    #[test]
    fn golden_openai_to_anthropic_stop_sequences() {
        let req = json!({
            "model": "claude-3-5-sonnet",
            "messages": [{"role": "user", "content": "Hi"}],
            "stop": ["END", "STOP"]
        });
        let anth = openai_request_to_anthropic(req);
        assert_eq!(anth["stop_sequences"], json!(["END", "STOP"]));
        assert!(anth.get("stop").is_none(), "raw 'stop' must not be passed to Anthropic");
    }

    #[test]
    fn golden_openai_to_anthropic_tool_definitions() {
        let req = json!({
            "model": "claude-3-5-sonnet",
            "messages": [{"role": "user", "content": "What is the weather?"}],
            "tools": [{
                "type": "function",
                "function": {
                    "name": "get_weather",
                    "description": "Get current weather",
                    "parameters": {
                        "type": "object",
                        "properties": { "location": { "type": "string" } },
                        "required": ["location"]
                    }
                }
            }]
        });
        let anth = openai_request_to_anthropic(req);
        let tools = anth["tools"].as_array().expect("tools must be array");
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0]["name"], "get_weather");
        assert_eq!(tools[0]["description"], "Get current weather");
        assert_eq!(tools[0]["input_schema"]["type"], "object");
        assert_eq!(tools[0]["input_schema"]["properties"]["location"]["type"], "string");
        assert!(tools[0].get("type").map(|v| v != "function").unwrap_or(true));
    }

    #[test]
    fn golden_openai_to_anthropic_image_url_content() {
        let req = json!({
            "model": "claude-3-5-sonnet",
            "messages": [{
                "role": "user",
                "content": [
                    { "type": "image_url", "image_url": { "url": "https://example.com/photo.png" } },
                    { "type": "text", "text": "Describe this image." }
                ]
            }]
        });
        let anth = openai_request_to_anthropic(req);
        let msgs = anth["messages"].as_array().unwrap();
        let content = msgs[0]["content"].as_array().unwrap();
        let img_block = content.iter().find(|b| b.get("type").and_then(|v| v.as_str()) == Some("image"));
        assert!(img_block.is_some(), "must have an Anthropic image block");
        assert_eq!(img_block.unwrap()["source"]["type"], "url", "remote URL must use type 'url'");
        assert_eq!(img_block.unwrap()["source"]["url"], "https://example.com/photo.png");
        let text_block = content.iter().find(|b| b.get("type").and_then(|v| v.as_str()) == Some("text"));
        assert!(text_block.is_some(), "must have a text block");
        assert_eq!(text_block.unwrap()["text"], "Describe this image.");
    }

    #[test]
    fn golden_openai_to_anthropic_data_uri_image() {
        let req = json!({
            "model": "claude-3-5-sonnet",
            "messages": [{
                "role": "user",
                "content": [
                    { "type": "image_url", "image_url": { "url": "data:image/png;base64,iVBORw0KGgo=" } }
                ]
            }]
        });
        let anth = openai_request_to_anthropic(req);
        let msgs = anth["messages"].as_array().unwrap();
        let content = msgs[0]["content"].as_array().unwrap();
        let img_block = content.iter().find(|b| b.get("type").and_then(|v| v.as_str()) == Some("image"));
        assert!(img_block.is_some(), "must have an Anthropic image block");
        assert_eq!(img_block.unwrap()["source"]["type"], "base64", "data URI must use type 'base64'");
        assert_eq!(img_block.unwrap()["source"]["media_type"], "image/png");
        assert_eq!(img_block.unwrap()["source"]["data"], "iVBORw0KGgo=");
    }

    #[test]
    fn golden_openai_to_anthropic_tool_choice_auto() {
        let req = json!({
            "model": "claude-3-5-sonnet",
            "messages": [{"role": "user", "content": "Help"}],
            "tools": [{"type":"function","function":{"name":"f","description":"d","parameters":{"type":"object"}}}],
            "tool_choice": "auto"
        });
        let anth = openai_request_to_anthropic(req);
        assert_eq!(anth["tool_choice"], "auto");
    }

    #[test]
    fn golden_openai_to_anthropic_assistant_tool_calls() {
        let req = json!({
            "model": "claude-3-5-sonnet",
            "messages": [
                {"role": "user", "content": "Get the weather in Tokyo"},
                {
                    "role": "assistant",
                    "content": null,
                    "tool_calls": [{
                        "id": "call_abc",
                        "type": "function",
                        "function": { "name": "get_weather", "arguments": "{\"location\":\"Tokyo\"}" }
                    }]
                }
            ]
        });
        let anth = openai_request_to_anthropic(req);
        let msgs = anth["messages"].as_array().unwrap();
        let asst_msg = msgs.iter().find(|m| m["role"] == "assistant").expect("assistant message");
        let content = asst_msg["content"].as_array().expect("content must be array for tool_use");
        let tu = content.iter().find(|b| b.get("type").and_then(|v| v.as_str()) == Some("tool_use"))
            .expect("must have tool_use block");
        assert_eq!(tu["id"], "call_abc");
        assert_eq!(tu["name"], "get_weather");
        assert_eq!(tu["input"]["location"], "Tokyo");
    }

    #[test]
    fn byte_stable_openai_request_fields_survive_round_trip() {
        let original = json!({
            "model": "gpt-4o",
            "messages": [
                {"role": "system", "content": "Be concise."},
                {"role": "user",   "content": "What is 2+2?"}
            ],
            "temperature": 0.3,
            "max_tokens": 100
        });
        let anthropic_req = openai_request_to_anthropic(original.clone());
        assert_eq!(anthropic_req["system"], "Be concise.");
        assert_eq!(anthropic_req["messages"][0]["content"], "What is 2+2?");
        assert_eq!(anthropic_req["temperature"], 0.3);
        assert_eq!(anthropic_req["max_tokens"], 100);
    }
}
