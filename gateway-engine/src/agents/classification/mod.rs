//! Agent: input classification — threat detection via LLM or static detectors.

mod classifier;
pub mod t2_analyzer;

pub use classifier::{classify, llm_complete, ClassifyResult};

/// Parse a classifier verdict JSON blob into (flagged, confidence, reason).
/// Expects fields: "verdict" ("ATTACK"/"SAFE" string), "confidence", "reason".
pub fn parse_verdict(body: &serde_json::Value) -> (bool, Option<f32>, Option<String>) {
    let verdict = body.get("verdict").and_then(|v| v.as_str()).unwrap_or("SAFE");
    let flagged = verdict == "ATTACK" || verdict.to_lowercase() == "attack";
    let confidence = body.get("confidence")
        .and_then(|v| v.as_f64().map(|f| f as f32))
        .or(if flagged { Some(1.0) } else { None });
    let reason = body.get("reason").and_then(|v| v.as_str().map(|s| s.to_string()));
    (flagged, confidence, reason)
}

/// Strip markdown code fences (```json … ```) and leading/trailing whitespace.
pub fn strip_code_fence(s: &str) -> &str {
    let s = s.trim();
    if !s.starts_with("```") {
        return s;
    }
    let after = s.strip_prefix("```").unwrap_or(s);
    let after = after.strip_prefix("json").unwrap_or(after).trim_start_matches('\n').trim_start();
    if let Some(stripped) = after.strip_suffix("\n```") { return stripped.trim(); }
    if let Some(stripped) = after.strip_suffix("```")   { return stripped.trim(); }
    after
}
