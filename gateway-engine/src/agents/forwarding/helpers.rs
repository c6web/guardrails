/// Constants and helpers used by the forwarding agent.
/// Headers allowed to pass from client → upstream (F-8).
pub static ALLOWED_CLIENT_HEADERS: &[&str] = &[
    "openai-beta",
    "anthropic-beta",
    "openai-organization",
    "x-idempotency-key",
    "traceparent",
    "tracestate",
];

/// Known upstream paths that should be forwarded verbatim without scanning.
/// These are SDK/framework endpoints (files, audio, images, etc.) that clients
/// expect to hit directly on the upstream provider.
pub static PASSTHROUGH_PATHS: &[&str] = &[
    "/v1/files",
    "/v1/audio",
    "/v1/images",
];

use crate::pipeline_types::Dialect;
use crate::policy::ProviderConfig;
use crate::adapters::llm::{adapter_for_provider, LlmAdapter};
use crate::tools::log_writer::LogWriter;
use super::body_mutation::apply_body_mutations;

// ── Provider attempt preparation (D4 dedup) ──────────────────────────────────

/// Result of preparing a single provider attempt in the fallback chain.
pub struct ProviderAttempt {
    pub adapter: Box<dyn LlmAdapter>,
    pub upstream_body: serde_json::Value,
    pub mutations_json: Option<String>,
    pub effective_model: String,
    pub cross_dialect: bool,
}

/// Prepare a single provider for forwarding: resolves adapter, translates request,
/// applies mutations, and runs cross-dialect checks. Returns `Err(skip_reason)`
/// when the provider should be skipped (continue the loop).
pub async fn prepare_provider_attempt(
    provider: &ProviderConfig,
    i: usize,
    req_body: &serde_json::Value,
    model: &str,
    is_anthropic: bool,
    path_override: Option<&str>,
    _user_prompt: &Option<String>,
    request_id: &str,
    is_streaming: bool,
) -> Result<ProviderAttempt, String> {
    let slot = match i {
        0 => "primary",
        1 => "backup1",
        _ => "backup2",
    };

    let adapter = adapter_for_provider(provider);
    let upstream_body = adapter.to_upstream_request(req_body.clone());

    // Provider input-token ceiling check — skip this provider when estimated
    // input exceeds its configured max_input_token.
    // Estimate from the full serialized request body (system prompt, messages,
    // tool schemas, multimodal content) rather than just user_prompt.
    if let Some(max_input_token) = provider.max_input_token {
        let full_body_str = serde_json::to_string(req_body).unwrap_or_default();
        let approx_input_tokens = crate::tools::token_estimator::estimate_token_count(&full_body_str);
        if approx_input_tokens > (max_input_token as usize) {
            let msg = format!(
                "Provider {} input token limit exceeded ({} > {})",
                provider.name, approx_input_tokens, max_input_token,
            );
            let suffix = if is_streaming { " (streaming)" } else { "" };
            tracing::warn!(
                "[forward] {} {} EXCEEDS_PROVIDER_MAX_INPUT_TOKEN \
                 provider=\"{}\" tokens={} max={}{}",
                request_id, slot, provider.name, approx_input_tokens,
                max_input_token, suffix,
            );
            return Err(msg);
        }
    }

    // F-7: model override + max_tokens clamping with MutationLedger tracking.
    let is_responses_api = path_override == Some(crate::constants::RESPONSES_PATH);
    let (upstream_body, mutations_json) = apply_body_mutations(
        upstream_body,
        provider.max_output_token,
        provider.model.as_deref(),
        adapter.as_ref(),
        is_streaming,
        is_responses_api,
    );

    // Model-missing visibility warning
    if provider.model.is_none() {
        let client_model = upstream_body
            .get("model")
            .and_then(|v| v.as_str())
            .unwrap_or("absent");
        let suffix = if is_streaming { " (streaming)" } else { "" };
        tracing::warn!(
            "[model] {} MODEL_MISSING_PROVIDER_CONFIG {} \
             provider=\"{}\" vendor={} forwarding_client_model=\"{}\"{}",
            request_id, slot, provider.name, adapter.vendor(),
            client_model, suffix,
        );
    }

    let effective_model = upstream_body
        .get("model")
        .and_then(|v| v.as_str())
        .unwrap_or(model)
        .to_string();

    // Adapter contract v2: strict cross-dialect check (F-1 remainder).
    let cross_dialect = !is_same_dialect(is_anthropic, adapter.vendor(), &provider.endpoint);
    if cross_dialect
        && let Err(err_msg) = adapter.check_cross_dialect(req_body) {
            let msg = format!("{} ({}) unsupported feature: {}", slot, provider.name, err_msg);
            let suffix = if is_streaming { " (streaming)" } else { "" };
            tracing::warn!(
                "[adapter] {} {} UNSUPPORTED_FEATURE provider=\"{}\" \
                 — trying next: {}{}",
                request_id, slot, provider.name, err_msg, suffix,
            );
            return Err(msg);
        }

    let suffix = if is_streaming { " (streaming)" } else { "" };
    tracing::info!(
        "[forward] {} trying {} provider: \"{}\" ({}) vendor={}{}",
        request_id, slot, provider.name, provider.endpoint,
        adapter.vendor(), suffix,
    );

    Ok(ProviderAttempt {
        adapter,
        upstream_body,
        mutations_json,
        effective_model,
        cross_dialect,
    })
}

// ── Shared failure-arm logger (D4 dedup) ─────────────────────────────────────

/// Record upstream-failure metrics and write a provider-call log entry.
/// Covers both non-successful responses (4xx/5xx) and unreachable errors.
pub fn log_provider_failure(
    log_writer: &LogWriter,
    request_id: &str,
    app_id: &str,
    app_name: &str,
    provider: &ProviderConfig,
    slot: &str,
    adapter_vendor: &str,
    effective_model: &str,
    pcl_url: &str,
    request_body: &str,
    redacted_response: Option<String>,
    status_code: Option<i16>,
    error_message: Option<&str>,
    elapsed_ms: i64,
) {
    if let Some(m) = crate::tools::telemetry::METRICS.get() {
        let label = match status_code {
            Some(code) if (400..500).contains(&code) => "client_error",
            Some(_) => "server_error",
            None => "unreachable",
        };
        m.upstream_duration_ms
            .with_label_values(&[&provider.name, label])
            .observe(elapsed_ms as f64);
        m.upstream_failures_total
            .with_label_values(&[&provider.name, slot])
            .inc();
    }

    log_writer.log_provider_call(
        Some(request_id),
        "upstream",
        "pipeline",
        Some(app_id),
        Some(app_name),
        Some(provider.id.as_str()),
        Some(provider.name.as_str()),
        Some(adapter_vendor),
        Some(effective_model),
        Some(pcl_url),
        Some(request_body.to_string()),
        redacted_response,
        None,
        None,
        elapsed_ms,
        status_code,
        false,
        error_message,
    );
}

/// Check if a path should be forwarded verbatim without scanning (P4).
pub fn is_passthrough_path(path: &str) -> bool {
    PASSTHROUGH_PATHS
        .iter()
        .any(|p| path.starts_with(*p))
}

// ── SSE event-boundary framing buffer (F-6 fix) ────────────────────────────────

/// Accumulates raw bytes until complete SSE events are available.
/// SSE events end with a blank line (`\n\n`); partial events are held until complete.
pub struct SseFrameBuffer {
    pub(crate) partial: String,
}

impl SseFrameBuffer {
    pub fn new() -> Self { Self { partial: String::new() } }

    /// Feed a raw chunk; returns a list of complete SSE events (each ends with `\n\n`).
    pub fn feed(&mut self, chunk: &str) -> Vec<String> {
        self.partial.push_str(chunk);

        const MAX_PARTIAL_BYTES: usize = 1_048_576; // 1 MiB
        if self.partial.len() > MAX_PARTIAL_BYTES {
            tracing::warn!(
                "[sse] SseFrameBuffer.partial exceeded {} bytes — flushing",
                MAX_PARTIAL_BYTES,
            );
            let overflow = std::mem::take(&mut self.partial);
            let mut events = Vec::new();
            if !overflow.is_empty() {
                events.push(overflow);
            }
            return events;
        }

        let mut events = Vec::new();
        loop {
            match self.partial.find("\n\n") {
                None => break,
                Some(idx) => {
                    let event = self.partial[..idx + 2].to_string();
                    self.partial = self.partial[idx + 2..].to_string();
                    if !event.trim().is_empty() {
                        events.push(event);
                    }
                }
            }
        }
        events
    }
}

// ── Header helpers ─────────────────────────────────────────────────────────────

/// Headers the gateway relays from the upstream response to the client.
pub fn should_relay_response_header(name: &str) -> bool {
    matches!(name,
        "x-ratelimit-limit-requests"      |
        "x-ratelimit-limit-tokens"        |
        "x-ratelimit-remaining-requests"  |
        "x-ratelimit-remaining-tokens"    |
        "x-ratelimit-reset-requests"      |
        "x-ratelimit-reset-tokens"        |
        "retry-after"                     |
        "retry-after-ms"                  |
        "request-id"                      |
        "x-request-id"                    |
        "x-amzn-requestid"                |
        "anthropic-ratelimit-requests-limit"     |
        "anthropic-ratelimit-requests-remaining" |
        "anthropic-ratelimit-requests-reset"     |
        "anthropic-ratelimit-tokens-limit"       |
        "anthropic-ratelimit-tokens-remaining"   |
        "anthropic-ratelimit-tokens-reset"
    )
}

/// Whether client (is_anthropic) and upstream (vendor + endpoint) speak the same wire dialect.
pub fn is_same_dialect(is_anthropic: bool, vendor: &str, endpoint: &str) -> bool {
    let upstream = Dialect::from_vendor(vendor, endpoint);
    let client   = if is_anthropic { Dialect::AnthropicMessages } else { Dialect::OpenAiChat };
    client == upstream
}

// ── Assistant reply formatting ─────────────────────────────────────────────────

/// Format an assistant reply with optional reasoning/thinking content into a
/// human-readable string. Returns `None` when both content and thinking are empty.
pub fn format_reply(content: &str, thinking: &str) -> Option<String> {
    match (!content.is_empty(), !thinking.is_empty()) {
        (true,  true)  => Some(format!("{content}\n\n[thinking]\n{thinking}")),
        (true,  false) => Some(content.to_string()),
        (false, true)  => Some(format!("[no final answer — token limit reached during thinking]\n{thinking}")),
        (false, false) => None,
    }
}

// ── SSE helpers ────────────────────────────────────────────────────────────────

/// Reconstruct the assistant reply and token usage from accumulated SSE bytes (OpenAI format).
/// Usage may arrive on any chunk (e.g. a dedicated final chunk per `stream_options.include_usage`,
/// or split across multiple chunks as with the Anthropic/Gemini adapter transforms) — the most
/// recent non-null value seen for each of prompt/completion tokens is kept.
pub fn extract_sse_reply(sse: &[u8]) -> (Option<String>, Option<i32>, Option<i32>) {
    let Ok(text) = std::str::from_utf8(sse) else { return (None, None, None) };
    let mut content     = String::new();
    let mut thinking     = String::new();
    let mut tokens_in:  Option<i32> = None;
    let mut tokens_out: Option<i32> = None;

    for line in text.lines() {
        let data = match line.strip_prefix("data: ") {
            Some(d) => d,
            None    => continue,
        };
        if data == "[DONE]" { continue; }
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(data) {
            if let Some(choices) = v.get("choices").and_then(|c| c.as_array()) {
                for choice in choices {
                    let delta = choice.get("delta");
                    if let Some(c) = delta.and_then(|d| d.get("content")).and_then(|c| c.as_str()) {
                        content.push_str(c);
                    }
                    if let Some(r) = delta.and_then(|d| d.get("reasoning_content")).and_then(|rc| rc.as_str()) {
                        thinking.push_str(r);
                    }
                }
            }
            if let Some(usage) = v.get("usage") {
                if let Some(tin) = usage.get("prompt_tokens").and_then(|v| v.as_u64()) {
                    tokens_in = Some(tin as i32);
                }
                if let Some(tout) = usage.get("completion_tokens").and_then(|v| v.as_u64()) {
                    tokens_out = Some(tout as i32);
                }
            }
        }
    }

    let reply = format_reply(&content, &thinking);

    (reply, tokens_in, tokens_out)
}

// ── Backup-routing trace helper ────────────────────────────────────────────────

/// Append a `routing` stage to the pipeline-trace JSON when a request is served by a
/// non-primary provider (failover). Records the slot, provider, and effective model so
/// backup routing is reviewable in the request log's pipeline trace. Returns the original
/// trace unchanged when `slot` is the primary or the trace is absent/unparseable.
pub fn append_routing_stage(
    trace: &Option<String>,
    slot: &str,
    provider_name: &str,
    model: &str,
) -> Option<String> {
    if slot == "primary" {
        return trace.clone();
    }
    let Some(raw) = trace.as_deref() else { return trace.clone() };
    let Ok(mut v) = serde_json::from_str::<serde_json::Value>(raw) else { return trace.clone() };
    let stage = serde_json::json!({
        "stage": "routing",
        "decision": "failover",
        "slot": slot,
        "provider": provider_name,
        "model": model,
        "ms": 0,
    });
    if let Some(stages) = v.get_mut("stages").and_then(|s| s.as_array_mut()) {
        stages.push(stage);
    }
    serde_json::to_string(&v).ok().or_else(|| trace.clone())
}

/// Append a `content_quality_scan` stage to the pipeline trace JSON, mirroring
/// `append_routing_stage`'s append-in-place pattern. Lets the Traffic page's
/// existing pipeline timeline UI show this stage with no frontend changes.
pub fn append_content_quality_stage(
    trace:  &Option<String>,
    action: &str,
    reason: &Option<String>,
) -> Option<String> {
    let Some(raw) = trace.as_deref() else { return trace.clone() };
    let Ok(mut v) = serde_json::from_str::<serde_json::Value>(raw) else { return trace.clone() };
    let stage = serde_json::json!({
        "stage": "content_quality_scan",
        "decision": action,
        "reason": reason,
        "ms": 0,
    });
    if let Some(stages) = v.get_mut("stages").and_then(|s| s.as_array_mut()) {
        stages.push(stage);
    }
    serde_json::to_string(&v).ok().or_else(|| trace.clone())
}

// ── Dialect-correct gateway error helper ──────────────────────────────────────

use axum::{http::StatusCode, response::Response};
use crate::tools::json_response::json_response;

/// Emit an Anthropic- or OpenAI-shaped gateway error response.
/// Anthropic clients receive `{"type":"error","error":{...}}`; others receive `{"error":{...}}`.
pub fn format_gateway_error(
    msg: &str,
    error_type: &str,
    code: &str,
    request_id: &str,
    is_anthropic: bool,
    status: StatusCode,
) -> Response {
    let body = if is_anthropic {
        serde_json::json!({
            "type": "error",
            "error": { "type": error_type, "message": msg, "request_id": request_id }
        })
    } else {
        serde_json::json!({
            "error": { "message": msg, "type": "firewall_block", "code": code, "request_id": request_id }
        })
    };
    json_response(status, &serde_json::to_string(&body).unwrap_or_default())
}
