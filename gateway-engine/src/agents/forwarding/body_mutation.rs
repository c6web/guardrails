/// Request body mutation: max_tokens clamping with MutationLedger tracking.
use axum::body::Bytes;
use serde_json::Value;

use crate::adapters::llm::LlmAdapter;
use crate::pipeline_types::MutationLedger;

/// OpenAI model families that reject `max_tokens` and require `max_completion_tokens`
/// (reasoning models and newer chat models, e.g. o1/o3/o4/gpt-5*).
fn openai_requires_max_completion_tokens(model: &str) -> bool {
    model.starts_with("o1") || model.starts_with("o3") || model.starts_with("o4") || model.starts_with("gpt-5")
}

/// Apply provider-level request body mutations (model override, output-token clamping).
/// Returns the mutated body and a JSON-serialized MutationLedger.
pub fn apply_body_mutations(
    mut body: Value,
    max_output_token: Option<i32>,
    provider_model: Option<&str>,
    adapter: &dyn LlmAdapter,
    is_streaming: bool,
    is_responses_api: bool,
) -> (Value, Option<String>) {
    let mut ledger = MutationLedger::default();

    // Streaming usage reporting: OpenAI-dialect upstreams only emit a usage-bearing
    // final chunk when stream_options.include_usage is set on the request.
    // The Responses API (`/v1/responses`) rejects `stream_options` as an unknown
    // parameter and always reports usage in its terminal event, so skip it there.
    if is_streaming
        && !is_responses_api
        && body.get("stream").and_then(|v| v.as_bool()) == Some(true)
        && matches!(adapter.vendor(), "openai" | "openrouter" | "openai_compatible" | "ollama")
        && body.get("stream_options").is_none()
    {
        ledger.add("stream_options", "injected to capture token usage in streaming response", "absent", "include_usage=true");
        body["stream_options"] = serde_json::json!({ "include_usage": true });
    }

    // The gateway is the authority on which model is used upstream — the client's
    // requested model is never honored over the app's admin-configured provider model.
    if let Some(model) = provider_model {
        let client_model = body.get("model").and_then(|v| v.as_str());
        if client_model != Some(model) {
            // Model mismatch (or client omitted model) — record for review and warn so it
            // is visible in live logs, not only the persisted request_mutations column.
            tracing::warn!(
                "[model] MODEL_MISMATCH client=\"{}\" overridden_to=\"{}\" vendor={}",
                client_model.unwrap_or("absent"), model, adapter.vendor()
            );
            ledger.add("model", "overridden to provider's configured model", client_model.unwrap_or("absent"), model);
            body["model"] = serde_json::json!(model);
        }
    }

    // `max_output_token` is the model's maximum OUTPUT token capacity (distinct from
    // `max_input_token`, the model's input/context-window ceiling, enforced separately
    // before this function runs) — it's only ever used as an outer ceiling here, never
    // assigned directly as the output value itself (sending the raw ceiling as `max_tokens`
    // can still exceed some vendors' single-call output limits in edge cases, hence the
    // clamp-down behavior).
    if let Some(max_output_token) = max_output_token {
        match body.get("max_tokens").and_then(|v| v.as_i64()) {
            Some(client_val) if client_val > max_output_token as i64 => {
                ledger.add("max_tokens", "clamped to provider's max output token limit", &client_val.to_string(), &max_output_token.to_string());
                body["max_tokens"] = serde_json::json!(max_output_token);
            }
            None if adapter.vendor() == "anthropic" => {
                let default_out = crate::constants::DEFAULT_FORWARD_MAX_OUTPUT_TOKENS.min(max_output_token);
                ledger.add("max_tokens", "injected default (Anthropic requires max_tokens)", "absent", &default_out.to_string());
                body["max_tokens"] = serde_json::json!(default_out);
            }
            _ => {}
        }
    }
    // OpenAI reasoning/newer models reject `max_tokens` outright — rename to the
    // required `max_completion_tokens` field after any clamping above has run.
    if adapter.vendor() == "openai" {
        let resolved_model = body.get("model").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if openai_requires_max_completion_tokens(&resolved_model)
            && let Some(val) = body.get("max_tokens").cloned() {
                ledger.add("max_tokens", "renamed to max_completion_tokens (required by this OpenAI model)", "max_tokens", "max_completion_tokens");
                body["max_completion_tokens"] = val;
                if let Some(obj) = body.as_object_mut() {
                    obj.remove("max_tokens");
                }
            }
    }

    let mutations_json: Option<String> = if ledger.is_empty() { None } else { serde_json::to_string(&ledger).ok() };
    (body, mutations_json)
}

/// Determine whether to use raw passthrough for this request.
/// Raw passthrough is used when: same dialect + no body mutations + raw bytes available.
pub fn should_use_raw_passthrough(
    raw_bytes_opt: Option<&Bytes>,
    cross_dialect: bool,
    ledger_empty: bool,
) -> bool {
    raw_bytes_opt.is_some() && !cross_dialect && ledger_empty
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::llm::openai::OpenAiAdapter;
    use serde_json::json;

    // Streaming chat completion → stream_options.include_usage is injected.
    #[test]
    fn chat_completion_streaming_injects_stream_options() {
        let body = json!({ "model": "gpt-4o", "stream": true });
        let (out, ledger) = apply_body_mutations(body, None, None, &OpenAiAdapter, true, false);
        assert_eq!(out["stream_options"]["include_usage"], json!(true));
        assert!(ledger.is_some(), "ledger should record the stream_options injection");
    }

    // Streaming /v1/responses → stream_options must NOT be injected (Bug C). The Responses
    // API rejects stream_options and reports usage in its terminal event.
    #[test]
    fn responses_api_streaming_skips_stream_options() {
        let body = json!({ "model": "gpt-4o", "stream": true });
        let (out, ledger) = apply_body_mutations(body, None, None, &OpenAiAdapter, true, true);
        assert!(out.get("stream_options").is_none(), "stream_options must not be injected for /v1/responses");
        assert!(ledger.is_none(), "no mutation expected for a streaming responses request with no model override");
    }

    // Provider model override fires regardless of endpoint (still authoritative).
    #[test]
    fn provider_model_override_applies_for_responses() {
        let body = json!({ "model": "client-model", "stream": true });
        let (out, ledger) = apply_body_mutations(body, None, Some("provider-model"), &OpenAiAdapter, true, true);
        assert_eq!(out["model"], json!("provider-model"));
        assert!(out.get("stream_options").is_none());
        assert!(ledger.is_some());
    }
}
