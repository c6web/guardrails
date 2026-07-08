//! Pipeline result types shared across all submodules.

use axum::{body::Bytes, http::{HeaderMap, StatusCode}, response::{IntoResponse, Response}};
use reqwest::Client;
use serde::Serialize;

use crate::agents::cache::store::ResponseCacheStore;
use crate::agents::classification::ClassifyResult;
use crate::agents::classification::t2_analyzer::T2Analysis;
use crate::policy::{DetectorStore, ProviderConfig};
use crate::tools::log_writer::LogWriter;
use crate::tools::provider_meter::ProviderMeter;

// ── Dialect / MutationLedger ──────────────────────────────────────────────────

/// The API wire format a client or upstream speaks.
#[derive(Clone, Debug, PartialEq)]
pub enum Dialect {
    /// OpenAI chat completions (`/v1/chat/completions`)
    OpenAiChat,
    /// Anthropic Messages API (`/v1/messages`)
    AnthropicMessages,
    /// Ollama native API (`/api/chat`)
    OllamaNative,
    /// Google Gemini native API (`/v1beta/models/{model}:generateContent`)
    GeminiGenerateContent,
}

impl Dialect {
    /// Determine the upstream dialect from a vendor + endpoint pair.
    pub fn from_vendor(vendor: &str, endpoint: &str) -> Self {
        match vendor {
            "anthropic" => Dialect::AnthropicMessages,
            "ollama" if !endpoint.contains("/v1") => Dialect::OllamaNative,
            "gemini" => Dialect::GeminiGenerateContent,
            _ => Dialect::OpenAiChat,
        }
    }
}

/// A single logged policy-mandated mutation.
#[derive(Debug, serde::Serialize)]
pub struct MutationEntry {
    pub field:  String,
    pub reason: String,
    pub before: String,
    pub after:  String,
}

/// Accumulates every byte the gateway changed and why.
/// Empty ledger ⇒ safe to use Raw passthrough.
#[derive(Debug, Default, serde::Serialize)]
pub struct MutationLedger {
    pub mutations: Vec<MutationEntry>,
}

impl MutationLedger {
    pub fn is_empty(&self) -> bool { self.mutations.is_empty() }

    pub fn add(&mut self, field: &str, reason: &str, before: &str, after: &str) {
        self.mutations.push(MutationEntry {
            field:  field.to_string(),
            reason: reason.to_string(),
            before: before.to_string(),
            after:  after.to_string(),
        });
    }
}

/// Single threat-knowledge semantic match hit.
#[derive(Clone, Debug, Serialize)]
pub struct SemanticMatch {
    pub id:       String,
    pub name:     String,
    pub similarity: f32, // cosine similarity [0..1], scaled to percentage in UI
}

/// A single stage entry in the pipeline trace, serialized to the pipeline_trace JSONB column.
#[derive(Clone, Debug, Default, Serialize)]
pub struct TraceStage {
    pub stage:      String,
    pub decision:   String,
    pub ms:         i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detector: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub framework_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason:   Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub matches:  Vec<SemanticMatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub threshold: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enforced: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub would_block: Option<bool>,
}

/// Result from a single layer scan.
#[derive(Clone, Debug)]
pub enum LayerResult {
    /// Threat detected — includes detector name, confidence, and reason.
    Hit {
        detector:      String,
        mode:          String,
        confidence:    Option<f32>,
        reason:        Option<String>,
        excerpt:       Option<String>,

        framework_id:  String,   // detection framework ID (e.g. "owasp-2025-llm01")
        /// Populated only for regex hits with mode="redact"; None for keyword/semantic/LLM hits.
        /// Presence signals that span-based redaction is possible for this hit.
        placeholder:   Option<String>,
    },
    /// No threat detected — proceed to next layer.
    Safe,
}

/// Combined results from all pipeline layers for logging and routing decisions.
#[derive(Clone)]
pub struct ScanSummary {
    pub hit:              Option<LayerResult>,
    pub semantic_matches: Vec<SemanticMatch>, // structured matches with id, name, similarity
    pub emb_threshold:    f32,                 // embedding threshold used for search
    pub classifier_result: Option<ClassifyResult>,
    pub false_positive_candidates: bool, // LLM safe but threat knowledge matched
    pub trace_stages:     Vec<TraceStage>,
    pub final_decision:   String,         // "allow" | "block"
    pub blocked_stage:    Option<String>, // "keyword_regex" | "semantic_llm" | "t2_intent"
    pub t2_result:        Option<T2Analysis>, // T2 intent analysis result (if run)

    // ── Response cache fields ────────────────────────────────────────────────
    pub cache_hit:              bool,
    pub cache_tier:             Option<String>,   // "l1" | "l2_exact" | ...
    pub cache_provider_id:      Option<String>,
    pub cache_tokens_in:        Option<i32>,
    pub cache_tokens_out:       Option<i32>,
    pub cache_response_bytes:   Option<Vec<u8>>,
    pub cache_response_headers: Option<String>,   // JSON string of header map
}

#[derive(Debug)]
pub struct AppError(pub String);

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        tracing::error!("[error] 500 INTERNAL error={}", self.0);
        let body = serde_json::json!({ "error": "internal error" }).to_string();
        (StatusCode::INTERNAL_SERVER_ERROR, body).into_response()
    }
}

/// Parameters for multi-turn semantic cache lookup/write.
/// Populated from the request body when the app has multi_turn_semantic_enabled.
#[derive(Debug, Clone)]
pub struct MultiTurnCacheParams {
    pub enabled: bool,
    pub system_prompt_hash: String,
    pub end_user_id: String,
    pub turn_index: i32,
    pub latest_user_message: String,
}

/// Arguments shared between forward_with_fallback and forward_streaming.
pub struct ForwardArgs<'a> {
    pub client:                &'a Client,
    pub log_writer:            &'a LogWriter,
    pub request_id:            &'a str,
    pub app_id:                &'a str,
    pub api_key_prefix:        &'a str,
    pub app_name:              &'a str,
    pub model:                 &'a str,
    pub method:                &'a str,
    pub path:                  &'a str,
    pub source_ip:             &'a str,
    pub user_prompt:           &'a Option<String>,
    pub req_body:              serde_json::Value,
    pub providers:             &'a [ProviderConfig],
    pub start_time:            std::time::Instant,
    pub flagged:               bool,
    pub detector:              Option<&'a str>,
    pub confidence:            Option<f32>,
    pub threat_title:          Option<&'a str>,
    pub excerpt:               Option<&'a str>,
    pub action:                Option<String>,
    pub threat_framework_id:   Option<&'a str>,
    pub classifier_id:         Option<&'a str>,
    pub classifier_name:       Option<&'a str>,
    pub policy_store:          &'a DetectorStore,
    pub is_anthropic:          bool,
    pub pipeline_trace:        Option<String>,
    pub final_decision:        Option<String>,
    pub blocked_stage:         Option<String>,
    pub classification_reason: Option<&'a str>,
    pub t2_flagged:            bool,
    pub t2_confidence:         Option<f32>,
    pub t2_reason:             Option<String>,
    pub provider_meter:        Option<&'a ProviderMeter>,
    pub input_redaction_summary: Option<String>,
    pub raw_body:              Option<(Bytes, Option<String>)>,
    pub path_override:         Option<&'a str>,
    pub client_headers:        &'a HeaderMap,
    pub user_agent:            Option<&'a str>,
    pub raw_input_payload:     Option<&'a str>,

    // ── Response cache fields ────────────────────────────────────────────────
    pub cache_store:           Option<&'a ResponseCacheStore>,
    pub cache_request_hash:    Option<&'a str>,
    pub prompt_text:           &'a str,
    pub multi_turn_cache_params: Option<MultiTurnCacheParams>,
    /// Per-app cache TTL override (nullable = use the store's default), clamped
    /// to the store's max TTL ceiling when the entry is written.
    pub cache_ttl_seconds:     Option<i32>,

    // ── Content Quality Scanning fields (per-app opt-in) ─────────────────────
    pub app_enable_content_quality_scan: bool,
    pub app_content_quality_mode:        Option<&'a str>,
    pub app_content_quality_threshold:   Option<f32>,
}

pub fn format_option(s: &Option<String>) -> &str {
    s.as_deref().unwrap_or("none")
}
