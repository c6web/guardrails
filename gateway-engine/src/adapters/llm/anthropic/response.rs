//! Anthropic → OpenAI response conversion functions and helpers.
//!
//! Handles the gateway-side direction: Anthropic Messages response → canonical OpenAI chat response,
//! and the route/client-side transforms (Anthropic request → canonical OpenAI for internal processing).

use serde_json::{json, Value};

use super::adapters::ContentBlock;

// ── Gateway-side transforms (Anthropic → OpenAI) ─────────────────────────────

/// Convert Anthropic ContentBlocks to OpenAI message content.
fn anthropic_blocks_to_openai(blocks: &[ContentBlock]) -> Value {
    let mut text_parts: Vec<String> = Vec::new();
    let mut has_non_text = false;

    for block in blocks {
        match block {
            ContentBlock::Text { text } => {
                text_parts.push(text.clone());
            }
            ContentBlock::Thinking => {
                // Thinking blocks are excluded from visible content.
                // In a real OpenAI response they'd go into `reasoning_content`.
            }
            _ => {
                has_non_text = true;
            }
        }
    }

    // If all blocks are text or thinking (both rendered as text), concatenate.
    if !has_non_text && !text_parts.is_empty() {
        return json!(text_parts.join(""));
    }

    // Otherwise build an array of parts (for mixed content).
    let mut openai_parts: Vec<Value> = Vec::new();

    for block in blocks {
        match block {
            ContentBlock::Text { text } => {
                if !text.is_empty() {
                    openai_parts.push(json!({ "type": "text", "text": text }));
                }
            }
            ContentBlock::Image { source_data, .. } => {
                let url = if source_data.starts_with("data:") {
                    source_data.clone()
                } else {
                    format!("data:image/png;base64,{}", source_data)
                };
                openai_parts.push(json!({ "type": "image_url", "image_url": { "url": url } }));
            }
            ContentBlock::Thinking => {
                // Thinking content is excluded from visible output.
                // OpenAI responses emit this via reasoning_content when applicable.
            }
        }
    }

    if openai_parts.len() <= 1 {
        if let Some(first) = openai_parts.into_iter().next() {
            first.get("text").map(|t| json!(t.as_str().unwrap_or(""))).unwrap_or(json!(""))
        } else {
            json!("")
        }
    } else {
        json!(openai_parts)
    }
}

/// Translate an Anthropic tool_use block to OpenAI tool_call format.
fn anthropic_tool_use_to_openai(block: &Value) -> Value {
    let id = block.get("id").and_then(|i| i.as_str()).unwrap_or("");
    let name = block.get("name").and_then(|n| n.as_str()).unwrap_or("");
    let input = block.get("input").cloned().unwrap_or(json!({}));
    crate::adapters::make_openai_tool_call(id, name, &input)
}

/// Anthropic Messages response → canonical OpenAI chat response.
pub fn anthropic_response_to_openai(anthropic_resp: Value) -> Value {
    let mut tool_calls: Vec<Value> = Vec::new();
    let mut content_blocks: Vec<ContentBlock> = Vec::new();

    if let Some(blocks) = anthropic_resp.get("content").and_then(|v| v.as_array()) {
        for block in blocks {
            match block.get("type").and_then(|t| t.as_str()) {
                Some("text") => {
                    if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                        content_blocks.push(ContentBlock::Text { text: text.to_string() });
                    }
                }
                Some("tool_use") => {
                    tool_calls.push(anthropic_tool_use_to_openai(block));
                }
                Some("thinking") => {
                    if let Some(_text) = block.get("thinking").and_then(|t| t.as_str()) {
                        content_blocks.push(ContentBlock::Thinking);
                    }
                }
                _ => {}
            }
        }
    }

    let content = anthropic_blocks_to_openai(&content_blocks);

    let finish_reason = anthropic_resp
        .get("stop_reason")
        .and_then(|v| v.as_str())
        .map(crate::adapters::anthropic_stop_to_openai_finish)
        .unwrap_or("stop");

    let input_tokens  = anthropic_resp.pointer("/usage/input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
    let output_tokens = anthropic_resp.pointer("/usage/output_tokens").and_then(|v| v.as_u64()).unwrap_or(0);

    let mut message = json!({ "role": "assistant", "content": content });
    if !tool_calls.is_empty() {
        message["tool_calls"] = json!(tool_calls);
    }

    let mut out = json!({
        "object": "chat.completion",
        "choices": [{
            "index": 0,
            "message": message,
            "finish_reason": finish_reason,
        }],
        "usage": {
            "prompt_tokens":     input_tokens,
            "completion_tokens": output_tokens,
            "total_tokens":      input_tokens + output_tokens,
        },
    });
    if let Some(id) = anthropic_resp.get("id") {
        out["id"] = id.clone();
    }
    if let Some(model) = anthropic_resp.get("model") {
        out["model"] = model.clone();
    }
    out
}

// ── Route/client-side transforms (caller speaks Anthropic on /v1/messages) ───

/// Translate an Anthropic Messages request to canonical OpenAI for internal processing.
pub fn translate_anthropic_to_openai(mut anthropic_req: Value) -> Value {
    let mut messages = serde_json::Value::Array(Vec::new());

    let mut system_content = String::new();

    if let Some(sys_val) = anthropic_req.get("system") {
        match sys_val {
            Value::String(s) => {
                if !s.is_empty() {
                    system_content.push_str(s);
                }
            }
            Value::Array(arr) => {
                for block in arr {
                    if let Some("text") = block.get("type").and_then(|t| t.as_str())
                        && let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                            system_content.push_str(text);
                        }
                }
            }
            _ => {
                if let Some(s) = sys_val.as_str() {
                    system_content.push_str(s);
                }
            }
        }
    }

    // Extract any system messages from within the messages array (only when no top-level system field).
    if system_content.is_empty()
        && let Some(msgs) = anthropic_req.get("messages").and_then(|v| v.as_array()) {
            for msg in msgs {
                if let Some(role) = msg.get("role").and_then(|r| r.as_str())
                    && role == "system"
                        && let Some(content) = msg.get("content") {
                            if let Some(s) = content.as_str() {
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
        }

    if !system_content.is_empty() {
        messages.as_array_mut().unwrap().push(serde_json::json!({
            "role": "system",
            "content": system_content,
        }));
    }

    if let Some(anthropic_msgs) = anthropic_req.get("messages").and_then(|v| v.as_array()) {
        for msg in anthropic_msgs {
            let role = msg.get("role").and_then(|r| r.as_str());
            match role {
                Some("user") => {
                    let openai_content = translate_anthropic_user_content_to_openai(msg);
                    if !is_empty_value(&openai_content) {
                        messages.as_array_mut().unwrap().push(serde_json::json!({
                            "role": "user",
                            "content": openai_content,
                        }));
                    }
                }
                Some("assistant") => {
                    let openai_msg = translate_anthropic_assistant_to_openai(msg);
                    messages.as_array_mut().unwrap().push(openai_msg);
                }
                Some("tool_use") | Some("function") => {
                    let name = msg.get("name").and_then(|n| n.as_str()).unwrap_or("");
                    let input = msg.get("input").cloned().unwrap_or(json!({}));
                    let args = serde_json::to_string(&input).unwrap_or_default();
                    messages.as_array_mut().unwrap().push(serde_json::json!({
                        "role": "assistant",
                        "content": null,
                        "tool_calls": [{
                            "id": msg.get("id").and_then(|i| i.as_str()).unwrap_or(""),
                            "type": "function",
                            "function": { "name": name, "arguments": args }
                        }]
                    }));
                }
                Some(_) | None => {}
            }
        }
    }

    if let Some(model) = anthropic_req.get("model").or_else(|| anthropic_req.get("model_name"))
        && let Some(val) = model.as_str() {
            anthropic_req["model"] = serde_json::json!(val);
        }

    for key in &["temperature", "max_tokens", "top_p", "top_k", "stop"] {
        if let Some(val) = anthropic_req.get(*key) {
            anthropic_req[*key] = val.clone();
        }
    }

    if let Some(ss) = anthropic_req.get("stop_sequences") {
        anthropic_req["stop_sequences"] = ss.clone();
    }

    if anthropic_req.get("stream").and_then(|v| v.as_bool()).unwrap_or(false) {
        anthropic_req["stream"] = serde_json::json!(true);
    }

    // Translate Anthropic tools → OpenAI tools (input_schema → parameters, strip type wrapper).
    if let Some(tools) = anthropic_req.get("tools")
        && let Some(arr) = tools.as_array() {
            let mut openai_tools: Vec<Value> = Vec::new();
            for tool in arr {
                if let Some(name) = tool.get("name").and_then(|n| n.as_str()) {
                    let desc = tool.get("description").and_then(|d| d.as_str()).unwrap_or("");
                    let input_schema = tool.get("input_schema").cloned().unwrap_or(json!({}));
                    openai_tools.push(json!({
                        "type": "function",
                        "function": {
                            "name": name,
                            "description": desc,
                            "parameters": input_schema,
                        }
                    }));
                }
            }
            anthropic_req["tools"] = json!(openai_tools);
        }

    if let Some(obj) = anthropic_req.as_object_mut() {
        obj.remove("system");
        obj.remove("stop_sequences");
        obj.remove("top_k");
    }

    anthropic_req["messages"] = messages;
    anthropic_req
}

/// Translate Anthropic user message content to OpenAI format.
fn translate_anthropic_user_content_to_openai(msg: &Value) -> Value {
    let content = msg.get("content");

    match content {
        Some(Value::String(s)) => {
            if !s.is_empty() {
                json!(s)
            } else {
                json!("")
            }
        }
        Some(Value::Array(arr)) => {
            let mut parsed_blocks: Vec<ContentBlock> = Vec::new();

            for item in arr {
                if let Some(block) = item.as_object() {
                    let block_type_str = block.get("type").and_then(|t| t.as_str());
                    match block_type_str {
                        Some("text") => {
                            if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                                parsed_blocks.push(ContentBlock::Text { text: text.to_string() });
                            }
                        }
                        Some("image") => {
                             let source = block.get("source");
                             if let Some(source_obj) = source.and_then(|s| s.as_object()) {
                                 let source_data = source_obj
                                     .get("data")
                                     .and_then(|d| d.as_str())
                                     .unwrap_or("");
                                 parsed_blocks.push(ContentBlock::Image {
                                     source_data: source_data.to_string(),
                                 });
                             } else if let Some(source_val) = source.and_then(|s| s.as_str()) {
                                 parsed_blocks.push(ContentBlock::Image {
                                     source_data: source_val.to_string(),
                                 });
                             }
                         }
                        Some("thinking") => {
                            if let Some(_text) = block.get("thinking").and_then(|t| t.as_str()) {
                                parsed_blocks.push(ContentBlock::Thinking);
                            }
                        }
                        _ => {}
                    }
                }
            }

            anthropic_blocks_to_openai(&parsed_blocks)
        }
        _ => json!(""),
    }
}

/// Translate Anthropic assistant message to OpenAI format.
fn translate_anthropic_assistant_to_openai(msg: &Value) -> Value {
    let content = msg.get("content");

    match content {
        Some(Value::String(s)) => {
            json!({ "role": "assistant", "content": s })
        }
        Some(Value::Array(arr)) => {
            let mut parsed_blocks: Vec<ContentBlock> = Vec::new();

            for item in arr {
                if let Some(block) = item.as_object() {
                    let block_type_str = block.get("type").and_then(|t| t.as_str());
                    match block_type_str {
                        Some("text") => {
                            if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                                parsed_blocks.push(ContentBlock::Text { text: text.to_string() });
                            }
                        }
                        Some("thinking") => {
                            if let Some(_text) = block.get("thinking").and_then(|t| t.as_str()) {
                                parsed_blocks.push(ContentBlock::Thinking);
                            }
                        }
                        _ => {}
                    }
                }
            }

            let openai_content = anthropic_blocks_to_openai(&parsed_blocks);

            let mut tool_calls: Vec<Value> = Vec::new();
            for item in arr {
                if let Some(block) = item.as_object()
                    && block.get("type").and_then(|t| t.as_str()) == Some("tool_use")
                {
                    tool_calls.push(anthropic_tool_use_to_openai(item));
                }
            }

            let mut message = json!({ "role": "assistant", "content": openai_content });
            if !tool_calls.is_empty() {
                message["tool_calls"] = json!(tool_calls);
            }

            message
        }
        _ => json!({ "role": "assistant", "content": null }),
    }
}

/// Check if a Value is empty (null, empty string, or missing).
fn is_empty_value(v: &Value) -> bool {
    match v {
        Value::Null => true,
        Value::String(s) => s.is_empty(),
        Value::Array(arr) => arr.is_empty(),
        _ => false,
    }
}

/// Translate a canonical OpenAI response back to a spec-valid Anthropic Messages response.
pub fn translate_openai_to_anthropic(openai_resp: Value) -> Value {
    let mut content_blocks: Vec<Value> = Vec::new();
    let mut stop_reason = "end_turn";

    if let Some(choices) = openai_resp.get("choices").and_then(|v| v.as_array()) {
        for choice in choices {
            if let Some(message) = choice.get("message") {
                if let Some(text) = message.get("content").and_then(|c| c.as_str())
                    && !text.is_empty() {
                        content_blocks.push(json!({ "type": "text", "text": text }));
                    }
                if let Some(tool_calls) = message.get("tool_calls").and_then(|v| v.as_array()) {
                    for tc in tool_calls {
                        let tc_id   = tc.get("id").and_then(|i| i.as_str()).unwrap_or("");
                        let func    = tc.get("function");
                        let name    = func.and_then(|f| f.get("name")).and_then(|n| n.as_str()).unwrap_or("");
                        let args_s  = func.and_then(|f| f.get("arguments")).and_then(|a| a.as_str()).unwrap_or("{}");
                        let input: Value = serde_json::from_str(args_s).unwrap_or(json!({}));
                        content_blocks.push(json!({
                            "type":  "tool_use",
                            "id":    tc_id,
                            "name":  name,
                            "input": input,
                        }));
                    }
                }
            }
            if let Some(reason) = choice.get("finish_reason").and_then(|r| r.as_str()) {
                stop_reason = crate::adapters::openai_finish_to_anthropic_stop(reason);
            }
        }
    }

    let input_tokens  = openai_resp.pointer("/usage/prompt_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
    let output_tokens = openai_resp.pointer("/usage/completion_tokens").and_then(|v| v.as_u64()).unwrap_or(0);

    let id    = openai_resp.get("id").and_then(|v| v.as_str()).unwrap_or("msg_gateway");
    let model = openai_resp.get("model").and_then(|v| v.as_str()).unwrap_or("unknown");

    json!({
        "id":            id,
        "type":          "message",
        "role":          "assistant",
        "content":       content_blocks,
        "model":         model,
        "stop_reason":   stop_reason,
        "stop_sequence": null,
        "usage": {
            "input_tokens":  input_tokens,
            "output_tokens": output_tokens,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_translate_basic_anthropic_request() {
        let anthropic_req = json!({
            "model": "claude-sonnet-4-20250514",
            "system": "You are a helpful assistant.",
            "messages": [ {"role": "user", "content": "Hello"} ],
            "max_tokens": 100,
            "temperature": 0.7
        });

        let openai = translate_anthropic_to_openai(anthropic_req);
        let messages = openai["messages"].as_array().unwrap();
        assert_eq!(messages[0]["role"], "system");
        assert_eq!(messages[0]["content"], "You are a helpful assistant.");
        assert_eq!(messages[1]["role"], "user");
        assert_eq!(messages[1]["content"], "Hello");
        assert_eq!(openai["model"], "claude-sonnet-4-20250514");
        assert_eq!(openai["max_tokens"], 100);
        assert_eq!(openai["temperature"], 0.7);
    }

    #[test]
    fn test_translate_system_in_messages() {
        let anthropic_req = json!({
            "model": "claude-3-5-sonnet",
            "messages": [
                {"role": "system", "content": "You are a helpful AI."},
                {"role": "user", "content": "Tell me about Rust"}
            ]
        });
        let openai = translate_anthropic_to_openai(anthropic_req);
        let messages = openai["messages"].as_array().unwrap();
        assert_eq!(messages[0]["role"], "system");
        assert_eq!(messages[0]["content"], "You are a helpful AI.");
        assert_eq!(messages[1]["role"], "user");
        assert_eq!(messages[1]["content"], "Tell me about Rust");
    }

    #[test]
    fn test_translate_system_field_takes_precedence() {
        let anthropic_req = json!({
            "model": "claude-3",
            "system": "You are the primary system.",
            "messages": [
                {"role": "system", "content": "This should be ignored"},
                {"role": "user", "content": "Hello"}
            ]
        });
        let openai = translate_anthropic_to_openai(anthropic_req);
        let messages = openai["messages"].as_array().unwrap();
        assert_eq!(messages[0]["role"], "system");
        assert_eq!(messages[0]["content"], "You are the primary system.");
    }

    #[test]
    fn test_translate_stream_flag() {
        let anthropic_req = json!({
            "model": "claude-3",
            "system": "Be helpful.",
            "messages": [{"role": "user", "content": "Hi"}],
            "stream": true,
            "max_tokens": 500
        });
        let openai = translate_anthropic_to_openai(anthropic_req);
        assert_eq!(openai["stream"], true);
    }

    #[test]
    fn test_translate_multi_content_blocks() {
        let anthropic_req = json!({
            "model": "claude-3",
            "system": "Be helpful.",
            "messages": [
                {"role": "user", "content": [{"type": "text", "text": "Describe this:"}, {"type": "image", "image_url": {"url": "https://img.com/a.png"}}]}
            ]
        });
        let openai = translate_anthropic_to_openai(anthropic_req);
        let messages = openai["messages"].as_array().unwrap();
        assert_eq!(messages[1]["content"], "Describe this:");
    }

    #[test]
    fn test_translate_openai_response_basic() {
        let openai_resp = json!({
            "id": "chatcmpl-abc123",
            "created": 1700000000,
            "model": "gpt-4",
            "choices": [
                {"message": {"role": "assistant", "content": "Hello world"}, "finish_reason": "stop"}
            ],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5}
        });
        let anthropic = translate_openai_to_anthropic(openai_resp);
        assert_eq!(anthropic["id"], "chatcmpl-abc123");
        assert_eq!(anthropic["type"], "message");
        assert_eq!(anthropic["role"], "assistant");
        assert_eq!(anthropic["model"], "gpt-4");
        assert_eq!(anthropic["stop_reason"], "end_turn");
        let blocks = anthropic["content"].as_array().unwrap();
        assert_eq!(blocks[0]["type"], "text");
        assert_eq!(blocks[0]["text"], "Hello world");
        assert_eq!(anthropic["usage"]["input_tokens"], 10);
        assert_eq!(anthropic["usage"]["output_tokens"], 5);
    }

    #[test]
    fn test_translate_openai_no_content() {
        let openai_resp = json!({
            "id": "chatcmpl-abc123",
            "model": "gpt-4",
            "choices": [ {"message": {"role": "assistant"}, "finish_reason": "stop"} ]
        });
        let anthropic = translate_openai_to_anthropic(openai_resp);
        let blocks = anthropic["content"].as_array().unwrap();
        assert!(blocks.is_empty());
    }

    #[test]
    fn test_translate_openai_tool_calls() {
        let openai_resp = json!({
            "id": "chatcmpl-tc1",
            "model": "gpt-4",
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": null,
                    "tool_calls": [{
                        "id": "call_abc",
                        "type": "function",
                        "function": { "name": "get_weather", "arguments": "{\"location\":\"Tokyo\"}" }
                    }]
                },
                "finish_reason": "tool_calls"
            }],
            "usage": {"prompt_tokens": 20, "completion_tokens": 10}
        });
        let anthropic = translate_openai_to_anthropic(openai_resp);
        assert_eq!(anthropic["stop_reason"], "tool_use");
        let blocks = anthropic["content"].as_array().unwrap();
        assert_eq!(blocks[0]["type"], "tool_use");
        assert_eq!(blocks[0]["id"], "call_abc");
        assert_eq!(blocks[0]["name"], "get_weather");
        assert_eq!(blocks[0]["input"]["location"], "Tokyo");
    }

    #[test]
    fn test_anthropic_response_to_openai() {
        let anthropic_resp = json!({
            "id": "msg_123",
            "model": "claude-3-5-sonnet",
            "content": [{"type": "text", "text": "Hello "}, {"type": "text", "text": "world"}],
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 12, "output_tokens": 7}
        });
        let openai = anthropic_response_to_openai(anthropic_resp);
        assert_eq!(openai["id"], "msg_123");
        assert_eq!(openai["choices"][0]["message"]["content"], "Hello world");
        assert_eq!(openai["choices"][0]["finish_reason"], "stop");
        assert_eq!(openai["usage"]["prompt_tokens"], 12);
        assert_eq!(openai["usage"]["completion_tokens"], 7);
        assert_eq!(openai["usage"]["total_tokens"], 19);
    }

    #[test]
    fn golden_anthropic_to_openai_with_tool_definitions() {
        let anthropic_req = json!({
            "model": "claude-3-5-sonnet",
            "system": "Be helpful.",
            "messages": [{"role": "user", "content": "What is the weather?"}],
            "tools": [{
                "name": "get_weather",
                "description": "Get current weather",
                "input_schema": {
                    "type": "object",
                    "properties": { "city": { "type": "string" } },
                    "required": ["city"]
                }
            }]
        });
        let openai = translate_anthropic_to_openai(anthropic_req);
        let tools = openai["tools"].as_array().expect("tools must be array");
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0]["type"], "function");
        assert_eq!(tools[0]["function"]["name"], "get_weather");
        assert_eq!(tools[0]["function"]["parameters"]["properties"]["city"]["type"], "string");
    }
}
