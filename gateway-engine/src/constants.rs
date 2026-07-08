//! Centralized output-token budgets for the gateway's own internal LLM calls.
//!
//! These are intentionally separate constants (rather than one shared value) so
//! each call type can be tuned independently later by editing this file and
//! rebuilding. They are output-only budgets — distinct from `ProviderConfig.max_output_token`
//! (the model's output-token ceiling) and `ProviderConfig.max_input_token` (the model's
//! input/context-window ceiling, enforced separately in the forwarding and classification
//! paths). These internal constants are only ever used as an outer ceiling, never assigned
//! directly as an output value.

/// Max output tokens requested for the primary OWASP classification LLM call.
pub const CLASSIFICATION_MAX_OUTPUT_TOKENS: i32 = 10240;
/// Max output tokens requested for the T2 intent-analysis LLM call.
pub const T2_ANALYSIS_MAX_OUTPUT_TOKENS: i32 = 10240;
/// Max output tokens requested for the knowledge-development LLM call.
pub const KNOWLEDGE_DEV_MAX_OUTPUT_TOKENS: i32 = 10240;
/// Default output-token request for normal forwarding when the client omits
/// `max_tokens` and the vendor requires one to be present (e.g. Anthropic).
pub const DEFAULT_FORWARD_MAX_OUTPUT_TOKENS: i32 = 10240;

/// Upstream path for the OpenAI Responses API (`/v1/responses`). Shared between the
/// responses handler (path override) and the forwarding layer, which uses it to detect
/// Responses-API requests and skip Chat-Completions-only body mutations (e.g. the
/// `stream_options` injection, which the Responses API rejects).
pub const RESPONSES_PATH: &str = "/responses";

/// Sampling temperature for the gateway's own internal LLM calls (classification,
/// T2 intent analysis, Knowledge Developer). These are deterministic, structured-output
/// tasks (verdict/intent classification, schema-constrained JSON extraction) — zero
/// temperature gives reproducible, auditable results. Never applied to the actual
/// forwarded user-facing request, which always uses the client's own temperature.
/// Max output tokens requested for the refusal-generation LLM call (soft mode).
pub const REFUSAL_GENERATION_MAX_OUTPUT_TOKENS: i32 = 512;

pub const CLASSIFICATION_TEMPERATURE: f64 = 0.0;
