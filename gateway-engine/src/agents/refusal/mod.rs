//! Polite LLM-generated decline for the `soft` app mode.
//!
//! When a request is blocked under `soft` mode, the gateway asks the
//! classifier provider to write a short, friendly refusal instead of
//! returning a hard error. The generated message tells the user their
//! request can't be helped with, gives a brief non-technical reason,
//! and invites them to rephrase or change topic.

use crate::agents::classification::llm_complete;
use crate::policy::DetectorStore;
use crate::tools::log_writer::LogWriter;

/// System prompt instructing the LLM how to write the refusal.
///
/// It must never reveal detector names, OWASP IDs, confidence scores,
/// system-prompt internals, or that a firewall/scanner exists.
pub const REFUSAL_SYSTEM_PROMPT: &str = "You are a helpful, polite assistant. \
The user's previous message was blocked by a content safety check. \
Write a short, warm, non-judgmental reply (1-3 sentences) telling the \
user that their request can't be assisted with, giving a brief \
non-technical reason, and inviting them to rephrase or pick another \
topic. Do NOT mention firewalls, scanners, detectors, OWASP, confidence \
scores, or any technical details. Reply with the message text only \
— no preamble, no JSON, no quotes.";

/// Static fallback message used when the LLM call fails or no provider
/// is configured.
pub const REFUSAL_FALLBACK: &str = "I'm sorry, but I can't help with that request. \
It looks like it may go against usage guidelines. Please rephrase your \
question or try a different topic, and I'll be glad to help.";

/// Generate a polite refusal message using the classifier provider.
///
/// 1. Resolves the classifier provider from the policy store.
/// 2. Calls `llm_complete()` with `REFUSAL_SYSTEM_PROMPT` and `call_type="refusal_generation"`.
/// 3. On any failure (no provider, LLM error, empty output) returns the static fallback.
pub async fn generate_refusal(
    client:       &reqwest::Client,
    policy_store: &DetectorStore,
    request_id:   &str,
    threat_reason: Option<&str>,
    user_prompt:  &str,
    log_writer:   &LogWriter,
) -> String {
    let provider = {
        let guard = policy_store.classifier_provider.read().unwrap_or_else(|e| e.into_inner());
        guard.clone()
    };

    let Some(ref provider) = provider else {
        tracing::warn!("[refusal] {} no classifier provider configured — using fallback", request_id);
        return REFUSAL_FALLBACK.to_string();
    };

    // Optionally prepend the internal reason so the LLM can tailor tone,
    // but never echo it verbatim to the user. Use the context to inform
    // the brief non-technical reason the system prompt asks for.
    let enriched_prompt = match threat_reason {
        Some(reason) if !reason.is_empty() => {
            format!("[Context: this request was deemed unsafe because: {}]\n\nUser message:\n{}", reason, user_prompt)
        }
        _ => user_prompt.to_string(),
    };

    match llm_complete(
        client,
        provider,
        REFUSAL_SYSTEM_PROMPT,
        &enriched_prompt,
        "refusal_generation",
        log_writer,
        Some(request_id),
        policy_store,
        crate::constants::REFUSAL_GENERATION_MAX_OUTPUT_TOKENS,
    )
    .await
    {
        Ok(text) if !text.trim().is_empty() => {
            tracing::info!("[refusal] {} generated refusal ({} chars)", request_id, text.len());
            text
        }
        Ok(_) => {
            tracing::warn!("[refusal] {} classifier returned empty refusal — using fallback", request_id);
            REFUSAL_FALLBACK.to_string()
        }
        Err(e) => {
            tracing::warn!("[refusal] {} LLM call failed: {} — using fallback", request_id, e);
            REFUSAL_FALLBACK.to_string()
        }
    }
}
