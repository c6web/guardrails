//! Anthropic ↔ OpenAI SSE (Server-Sent Events) stream transformers.

use serde_json::{json, Value};

use crate::adapters::{push_sse_event, sse_data_payloads};

/// Anthropic Messages SSE → OpenAI `chat.completion.chunk` SSE lines.
/// Handles text deltas, tool-use deltas, stop events, and usage.
pub fn anthropic_sse_to_openai_pub(chunk: &str) -> String {
    let mut out = String::new();
    for payload in sse_data_payloads(chunk) {
        let Ok(evt) = serde_json::from_str::<Value>(payload) else { continue; };
        match evt.get("type").and_then(|t| t.as_str()) {
            Some("content_block_delta") => {
                let delta_type = evt.pointer("/delta/type").and_then(|t| t.as_str());
                match delta_type {
                    Some("text_delta") => {
                        if let Some(text) = evt.pointer("/delta/text").and_then(|t| t.as_str()) {
                            let openai = json!({
                                "object": "chat.completion.chunk",
                                "choices": [{ "index": 0, "delta": { "content": text }, "finish_reason": Value::Null }],
                            });
                            push_sse_event(&mut out, &openai);
                        }
                    }
                    Some("input_json_delta") => {
                        if let Some(partial) = evt.pointer("/delta/partial_json").and_then(|v| v.as_str()) {
                            let index = evt.get("index").and_then(|v| v.as_u64()).unwrap_or(0);
                            let openai = json!({
                                "object": "chat.completion.chunk",
                                "choices": [{ "index": 0, "delta": {
                                    "tool_calls": [{ "index": index, "function": { "arguments": partial } }]
                                }, "finish_reason": Value::Null }],
                            });
                            push_sse_event(&mut out, &openai);
                        }
                    }
                    _ => {}
                }
            }
            Some("content_block_start") => {
                if let Some(cb) = evt.get("content_block")
                    && cb.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                        let index = evt.get("index").and_then(|v| v.as_u64()).unwrap_or(0);
                        let name  = cb.get("name").and_then(|n| n.as_str()).unwrap_or("");
                        let id    = cb.get("id").and_then(|i| i.as_str()).unwrap_or("");
                        let openai = json!({
                            "object": "chat.completion.chunk",
                            "choices": [{ "index": 0, "delta": {
                                "tool_calls": [{ "index": index, "id": id, "type": "function",
                                    "function": { "name": name, "arguments": "" } }]
                            }, "finish_reason": Value::Null }],
                        });
                        push_sse_event(&mut out, &openai);
                    }
            }
            Some("message_start") => {
                let input_tokens = evt.pointer("/message/usage/input_tokens").and_then(|v| v.as_u64());
                if let Some(input_tokens) = input_tokens {
                    let openai = json!({
                        "object": "chat.completion.chunk",
                        "choices": [],
                        "usage": { "prompt_tokens": input_tokens },
                    });
                    push_sse_event(&mut out, &openai);
                }
            }
            Some("message_delta") => {
                let stop_reason = evt.pointer("/delta/stop_reason").and_then(|r| r.as_str());
                let finish_reason = stop_reason
                    .map(crate::adapters::anthropic_stop_to_openai_finish)
                    .unwrap_or("stop");
                let usage = evt.get("usage");
                let output_tokens = usage.and_then(|u| u.get("output_tokens")).and_then(|v| v.as_u64()).unwrap_or(0);
                let openai = json!({
                    "object": "chat.completion.chunk",
                    "choices": [{ "index": 0, "delta": {}, "finish_reason": finish_reason }],
                    "usage": { "completion_tokens": output_tokens },
                });
                push_sse_event(&mut out, &openai);
            }
            Some("message_stop") => {
                out.push_str("data: [DONE]\n\n");
            }
            _ => {}
        }
    }
    out
}

// ── OpenAI SSE → Anthropic SSE (for streaming to Anthropic clients) ───────────

/// Stateful translator that converts an OpenAI SSE stream into an Anthropic SSE stream.
pub struct OpenAiToAnthropicSse {
    sent_preamble: bool,
    msg_id:        String,
    model:         String,
}

impl OpenAiToAnthropicSse {
    pub fn new(msg_id: impl Into<String>, model: impl Into<String>) -> Self {
        Self { sent_preamble: false, msg_id: msg_id.into(), model: model.into() }
    }

    /// Translate one or more OpenAI SSE lines into Anthropic SSE events.
    pub fn translate(&mut self, openai_chunk: &str) -> String {
        let mut out = String::new();
        for payload in sse_data_payloads(openai_chunk) {
            let Ok(evt) = serde_json::from_str::<Value>(payload) else { continue; };

            if !self.sent_preamble {
                self.sent_preamble = true;
                let id    = evt.get("id").and_then(|v| v.as_str()).unwrap_or(&self.msg_id);
                let model = evt.get("model").and_then(|v| v.as_str()).unwrap_or(&self.model);
                let input_tokens = evt.pointer("/usage/prompt_tokens")
                    .or_else(|| evt.pointer("/usage/input_tokens"))
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                out.push_str("event: message_start\n");
                out.push_str(&format!(
                    "data: {{\"type\":\"message_start\",\"message\":{{\"id\":\"{}\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"model\":\"{}\",\"stop_reason\":null,\"stop_sequence\":null,\"usage\":{{\"input_tokens\":{},\"output_tokens\":0}}}}}}\n\n",
                    id.replace('"', ""), model.replace('"', ""), input_tokens
                ));
                out.push_str("event: content_block_start\n");
                out.push_str("data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n");
            }

            if let Some(choices) = evt.get("choices").and_then(|c| c.as_array()) {
                for choice in choices {
                    let delta = choice.get("delta");
                    if let Some(text) = delta.and_then(|d| d.get("content")).and_then(|c| c.as_str())
                        && !text.is_empty() {
                            let escaped = text.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', "\\n").replace('\r', "\\r");
                            out.push_str("event: content_block_delta\n");
                            out.push_str(&format!(
                                "data: {{\"type\":\"content_block_delta\",\"index\":0,\"delta\":{{\"type\":\"text_delta\",\"text\":\"{}\"}}}}\n\n",
                                escaped
                            ));
                        }
                    if let Some(tool_calls) = delta.and_then(|d| d.get("tool_calls")).and_then(|v| v.as_array()) {
                        for tc in tool_calls {
                            let index = tc.get("index").and_then(|v| v.as_u64()).unwrap_or(0);
                            if let Some(tc_id) = tc.get("id").and_then(|v| v.as_str())
                                && !tc_id.is_empty() {
                                    let func = tc.get("function");
                                    let name = func.and_then(|f| f.get("name")).and_then(|n| n.as_str()).unwrap_or("");
                                    out.push_str("event: content_block_start\n");
                                    out.push_str(&format!(
                                        "data: {{\"type\":\"content_block_start\",\"index\":{},\"content_block\":{{\"type\":\"tool_use\",\"id\":\"{}\",\"name\":\"{}\",\"input\":{{}}}}}}\n\n",
                                        index, tc_id, name
                                    ));
                                }
                            if let Some(func) = tc.get("function")
                                && let Some(args_delta) = func.get("arguments").and_then(|a| a.as_str())
                                && !args_delta.is_empty()
                            {
                                let escaped = args_delta.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', "\\n");
                                out.push_str("event: content_block_delta\n");
                                out.push_str(&format!(
                                    "data: {{\"type\":\"content_block_delta\",\"index\":{},\"delta\":{{\"type\":\"input_json_delta\",\"partial_json\":\"{}\"}}}}\n\n",
                                    index, escaped
                                ));
                            }
                        }
                    }
                    if let Some(reason) = choice.get("finish_reason").and_then(|r| r.as_str())
                        && !reason.is_empty() {
                            let stop_reason = crate::adapters::openai_finish_to_anthropic_stop(reason);
                            let output_tokens = choice.get("usage")
                                .or_else(|| evt.get("usage"))
                                .and_then(|u| u.get("completion_tokens"))
                                .and_then(|v| v.as_u64())
                                .unwrap_or(0);
                            out.push_str("event: message_delta\n");
                            out.push_str(&format!(
                                "data: {{\"type\":\"message_delta\",\"delta\":{{\"stop_reason\":\"{}\",\"stop_sequence\":null}},\"usage\":{{\"output_tokens\":{}}}}}\n\n",
                                stop_reason, output_tokens
                            ));
                        }
                }
            }
        }
        // Exact `data: [DONE]` line match — `sse_data_payloads` filters this
        // line out, so it can't be detected from the yielded payloads; a raw
        // substring search over the whole chunk would risk a false match if
        // streamed text content happened to contain the literal "[DONE]".
        let is_done = openai_chunk.lines().any(|line| {
            line.trim().strip_prefix("data:").map(str::trim) == Some("[DONE]")
        });
        if is_done {
            out.push_str("event: content_block_stop\n");
            out.push_str("data: {\"type\":\"content_block_stop\",\"index\":0}\n\n");
            out.push_str("event: message_stop\n");
            out.push_str("data: {\"type\":\"message_stop\"}\n\n");
        }
        out
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_anthropic_sse_to_openai_text_delta() {
        let chunk = "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hi\"}}\n\n";
        let out = anthropic_sse_to_openai_pub(chunk);
        assert!(out.contains("chat.completion.chunk"));
        assert!(out.contains("\"content\":\"Hi\""));
    }

    #[test]
    fn test_anthropic_sse_to_openai_stop() {
        let chunk = "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n";
        let out = anthropic_sse_to_openai_pub(chunk);
        assert!(out.contains("[DONE]"));
    }
}
