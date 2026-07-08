//! Handler for POST /v1/completions — legacy OpenAI completions endpoint.
//!
//! Translates the legacy request (prompt field) to chat format, runs the shared
//! security pipeline, then translates the chat response back to completions format.
//! The completions→chat translation covers both the request body and the streaming
//! / non-streaming response.

use axum::{
    body::Body,
    extract::{ConnectInfo, Request as AxumRequest, State},
    http::StatusCode,
    response::Response,
};
use axum::body::Bytes;
use futures::Stream;
use serde_json::Value;
use std::net::SocketAddr;
use std::pin::Pin;
use std::task::{Context, Poll};

use crate::pipeline_types::AppError;
use crate::request_handler::pipeline::run_security_pipeline;
use crate::request_handler::preamble::prepare;

// ── SSE translation ───────────────────────────────────────────────────────────

fn translate_sse_event(event: &str) -> String {
    let data = match event.strip_prefix("data: ") {
        Some(d) => d.trim(),
        None => return event.to_string(),
    };
    if data == "[DONE]" {
        return "data: [DONE]\n\n".to_string();
    }

    match serde_json::from_str::<Value>(data) {
        Ok(mut v) => {
            let obj = v.as_object_mut().unwrap();

            if let Some(obj_type) = obj.get("object").and_then(|o| o.as_str())
                && obj_type == "chat.completion.chunk"
            {
                obj.insert(
                    "object".to_string(),
                    Value::String("text_completion".to_string()),
                );
            }

            if let Some(id_val) = obj.get("id").and_then(|i| i.as_str())
                && let Some(rest) = id_val.strip_prefix("chatcmpl-")
            {
                obj.insert("id".to_string(), Value::String(format!("cmpl-{}", rest)));
            }

            if let Some(choices) = obj.get_mut("choices").and_then(|c| c.as_array_mut()) {
                for choice in choices {
                    let co = choice.as_object_mut().unwrap();
                    if let Some(delta) = co.remove("delta")
                        && let Some(content) = delta.get("content").cloned()
                    {
                        co.insert("text".to_string(), content);
                    }
                }
            }

            format!(
                "data: {}\n\n",
                serde_json::to_string(&v).unwrap_or_default()
            )
        }
        Err(_) => event.to_string(),
    }
}

// ── Completion response transformation ─────────────────────────────────────────

fn transform_chat_to_completion(mut chat: Value) -> Value {
    let obj = chat.as_object_mut().unwrap();

    obj.insert(
        "object".to_string(),
        Value::String("text_completion".to_string()),
    );

    if let Some(id_val) = obj.get("id").and_then(|i| i.as_str())
        && let Some(rest) = id_val.strip_prefix("chatcmpl-")
    {
        obj.insert("id".to_string(), Value::String(format!("cmpl-{}", rest)));
    }

    if let Some(choices) = obj.get_mut("choices").and_then(|c| c.as_array_mut()) {
        for choice in choices {
            let co = choice.as_object_mut().unwrap();
            if let Some(msg) = co.remove("message")
                && let Some(content) = msg.get("content").cloned()
            {
                co.insert("text".to_string(), content);
            }
        }
    }

    chat
}

// ── Streaming SSE wrapper ─────────────────────────────────────────────────────

struct CompletionSseStream<S> {
    inner: S,
    buffer: String,
}

impl<S> Stream for CompletionSseStream<S>
where
    S: Stream<Item = Result<Bytes, axum::Error>> + Unpin,
{
    type Item = Result<Bytes, axum::Error>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        loop {
            if let Some(eob) = self.buffer.find("\n\n") {
                let event = self.buffer[..eob + 2].to_string();
                self.buffer = self.buffer[eob + 2..].to_string();
                let translated = translate_sse_event(&event);
                return Poll::Ready(Some(Ok(Bytes::from(translated))));
            }

            match Pin::new(&mut self.inner).poll_next(cx) {
                Poll::Ready(Some(Ok(chunk))) => {
                    let text = String::from_utf8_lossy(&chunk);
                    self.buffer.push_str(&text);
                }
                Poll::Ready(Some(Err(e))) => return Poll::Ready(Some(Err(e))),
                Poll::Ready(None) => {
                    if !self.buffer.is_empty() {
                        let remaining = std::mem::take(&mut self.buffer);
                        return Poll::Ready(Some(Ok(Bytes::from(remaining))));
                    }
                    return Poll::Ready(None);
                }
                Poll::Pending => return Poll::Pending,
            }
        }
    }
}

// ── Completion body helpers ────────────────────────────────────────────────────

fn completions_to_chat_body(completion: &Value) -> Value {
    let model = completion
        .get("model")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");
    let stream = completion
        .get("stream")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let prompt = completion.get("prompt").cloned().unwrap_or(Value::Null);
    let messages = match &prompt {
        Value::Array(arr) => arr
            .iter()
            .map(|p| serde_json::json!({"role": "user", "content": p}))
            .collect::<Vec<_>>(),
        _ => vec![serde_json::json!({"role": "user", "content": prompt})],
    };

    let mut chat = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": stream,
    });
    let chat_obj = chat.as_object_mut().unwrap();

    for field in &[
        "max_tokens",
        "max_completion_tokens",
        "temperature",
        "top_p",
        "n",
        "stop",
        "frequency_penalty",
        "presence_penalty",
        "logprobs",
        "echo",
        "user",
        "seed",
        "suffix",
        "best_of",
        "logit_bias",
    ] {
        if let Some(v) = completion.get(field).cloned() {
            chat_obj.insert(field.to_string(), v);
        }
    }

    chat
}

fn extract_prompt_text(completion: &Value) -> String {
    match completion.get("prompt") {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| v.as_str())
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

// ── Main handler ──────────────────────────────────────────────────────────────

/// Handle POST /v1/completions: translate to chat, run the shared pipeline, then
/// transform the response back to completions format.
#[tracing::instrument(skip_all, fields(request_id, app_id))]
pub async fn handle_completions_request(
    state: State<crate::GatewayState>,
    req: AxumRequest,
    connect_info: Option<ConnectInfo<SocketAddr>>,
) -> Result<Response, AppError> {
    // 1. Read the body before prepare() consumes the request, then translate to
    //    chat format so prepare() can parse it using its standard chat logic.
    //    Use pre_parsed so prepare() skips its internal body read+parse and uses
    //    the original body_bytes (for correct payload-size check and raw_input_payload
    //    logging) together with the translated chat JSON (for pipeline processing).
    let (parts, body) = req.into_parts();
    let body_bytes = axum::body::to_bytes(body, state.body_limit_bytes)
        .await
        .map_err(|e| AppError(format!("Body extract failed: {}", e)))?;
    let completion_body: Value = serde_json::from_slice(&body_bytes)
        .map_err(|e| AppError(format!("Invalid JSON: {}", e)))?;
    let chat_body = completions_to_chat_body(&completion_body);
    let chat_bytes = axum::body::Bytes::from(serde_json::to_vec(&chat_body).unwrap_or_default());
    let chat_multipart: Option<String> = None;

    // 2. Run the shared preamble with pre_parsed body.  prepare() uses the
    //    original body_bytes for payload-size and logging, and the chat JSON
    //    for pipeline processing (model, stream flag, rate-limit, quota, etc.).
    let prep = match prepare(&state, AxumRequest::from_parts(parts, Body::empty()),
                             connect_info, "cmp", false,
                             Some((body_bytes, chat_body.clone()))).await
    {
        Ok(p) => p,
        Err(resp) => return Ok(resp),
    };

    // 3. Extract prompt text from the original completions body.
    let prompt_text = extract_prompt_text(&completion_body);
    let user_prompt = if prompt_text.is_empty() { None } else { Some(prompt_text.clone()) };

    // 4. Run the shared security pipeline.  forward_body_override provides the
    //    chat-translated bytes so the upstream receives a chat-completions body,
    //    while prepare()'s own raw_forward_body held the original body for logging.
    let resp = run_security_pipeline(
        &state,
        prep,
        prompt_text,
        user_prompt,
        chat_body,
        None,     // upstream_path_override
        false,    // is_anthropic
        false,    // is_multipart
        "request",
        Some((chat_bytes, chat_multipart)), // forward_body_override
    ).await?;

    // 5. Transform the response from chat format back to completions format
    //    (both non-streaming and streaming responses).
    transform_completion_response(resp, state.body_limit_bytes).await
}

async fn transform_completion_response(
    resp: Response,
    body_limit_bytes: usize,
) -> Result<Response, AppError> {
    let status = resp.status();

    if !status.is_success() && status != StatusCode::CREATED {
        return Ok(resp);
    }

    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    if content_type.contains("text/event-stream") {
        let body = resp.into_body();
        let stream = body.into_data_stream();
        let wrapped = CompletionSseStream {
            inner: stream,
            buffer: String::new(),
        };
        let mut new_resp = Response::new(Body::from_stream(wrapped));
        *new_resp.status_mut() = StatusCode::OK;
        new_resp
            .headers_mut()
            .insert("content-type", "text/event-stream".parse().unwrap());
        return Ok(new_resp);
    }

    // Non-streaming: parse and transform
    let body_bytes = axum::body::to_bytes(resp.into_body(), body_limit_bytes)
        .await
        .unwrap_or_default();
    if body_bytes.is_empty() {
        let mut new_resp = Response::new(Body::from(body_bytes));
        *new_resp.status_mut() = StatusCode::OK;
        new_resp
            .headers_mut()
            .insert("content-type", "application/json".parse().unwrap());
        return Ok(new_resp);
    }
    if let Ok(chat_response) = serde_json::from_slice::<Value>(&body_bytes) {
        let completion_response = transform_chat_to_completion(chat_response);
        let new_body = serde_json::to_vec(&completion_response).unwrap_or_default();
        let mut new_resp = Response::new(Body::from(new_body));
        *new_resp.status_mut() = StatusCode::OK;
        new_resp
            .headers_mut()
            .insert("content-type", "application/json".parse().unwrap());
        return Ok(new_resp);
    }

    // Fallback: return raw bytes as-is
    let mut new_resp = Response::new(Body::from(body_bytes));
    *new_resp.status_mut() = StatusCode::OK;
    new_resp
        .headers_mut()
        .insert("content-type", "application/json".parse().unwrap());
    Ok(new_resp)
}
