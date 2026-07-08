use reqwest::Client;
use serde_json::Value;

use crate::adapters::content_quality::ContentQualityScores;
use crate::agents::classification::llm_complete;
use crate::policy::content_quality_prompt::DEFAULT_CONTENT_QUALITY_SYSTEM_PROMPT;
use crate::policy::DetectorStore;
use crate::tools::log_writer::LogWriter;

pub const CQ_JSON_CONTRACT: &str = "\n\nYou will be given CONTEXT (the full prompt sent \
to the AI) and RESPONSE (the AI's reply to score). Reply with JSON only — no markdown, \
no text outside the JSON:\
{\"groundedness\":0.0-1.0,\"relevance\":0.0-1.0,\"reason\":\"one or two sentences citing the weakest claim\"}";

pub async fn run_builtin_scan(
    client: &Client,
    policy_store: &DetectorStore,
    request_id: &str,
    _app_id: &str,
    _app_name: &str,
    context: &str,
    response: &str,
    log_writer: &LogWriter,
) -> Option<ContentQualityScores> {
    if response.trim().is_empty() {
        tracing::debug!("[content_quality::builtin] {} empty response — skipping", request_id);
        return None;
    }

    let judge_provider = policy_store.content_quality_judge_provider.read().unwrap_or_else(|e| e.into_inner()).clone();
    let Some(judge_provider) = judge_provider else {
        tracing::warn!("[content_quality::builtin] {} no judge LLM provider configured — skipping", request_id);
        return None;
    };

    let raw_prompt = policy_store.content_quality_system_prompt.read().unwrap_or_else(|e| e.into_inner()).clone();
    let prompt = if raw_prompt.trim().is_empty() {
        DEFAULT_CONTENT_QUALITY_SYSTEM_PROMPT
    } else {
        raw_prompt.as_str()
    };
    let effective_prompt = format!("{}\n\n{}", prompt, CQ_JSON_CONTRACT);

    let max_tokens = *policy_store.content_quality_max_output_tokens.read().unwrap_or_else(|e| e.into_inner());
    let user_prompt = format!("CONTEXT:\n{context}\n\nRESPONSE:\n{response}");

    let raw = llm_complete(
        client, &judge_provider, &effective_prompt, &user_prompt,
        "content_quality", log_writer, Some(request_id), policy_store, max_tokens,
    ).await;

    let text = match raw {
        Ok(t) => t,
        Err(e) => {
            tracing::warn!("[content_quality::builtin] {} LLM call failed: {} — failing open", request_id, e);
            return None;
        }
    };

    match parse_cq_response(&text) {
        Ok(scores) => Some(scores),
        Err(e) => {
            tracing::warn!("[content_quality::builtin] {} parse error: {} — failing open", request_id, e);
            None
        }
    }
}

fn parse_cq_response(content: &str) -> Result<ContentQualityScores, String> {
    let stripped = crate::agents::classification::strip_code_fence(content);
    let j: Value = serde_json::from_str(stripped)
        .map_err(|e| format!("content quality JSON parse error: {}", e))?;

    let groundedness = j.get("groundedness")
        .and_then(|v| v.as_f64())
        .map(|v| v as f32)
        .map(|v| v.clamp(0.0, 1.0));
    let relevance = j.get("relevance")
        .and_then(|v| v.as_f64())
        .map(|v| v as f32)
        .map(|v| v.clamp(0.0, 1.0));
    let reason = j.get("reason")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let hallucination = groundedness.map(|g| (1.0 - g).clamp(0.0, 1.0));

    Ok(ContentQualityScores {
        groundedness,
        relevance,
        hallucination,
        reason,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(s: &str) -> Result<ContentQualityScores, String> {
        parse_cq_response(s)
    }

    #[test]
    fn valid_json_full_scores() {
        let r = parse(r#"{"groundedness":0.95,"relevance":0.87,"reason":"Minor detail not in context"}"#).unwrap();
        assert!((r.groundedness.unwrap() - 0.95).abs() < 0.001);
        assert!((r.relevance.unwrap() - 0.87).abs() < 0.001);
        assert!((r.hallucination.unwrap() - 0.05).abs() < 0.001);
        assert_eq!(r.reason.as_deref(), Some("Minor detail not in context"));
    }

    #[test]
    fn valid_json_code_fenced() {
        let r = parse("```json\n{\"groundedness\":0.5,\"relevance\":0.6,\"reason\":\"Some hallucinated claims\"}\n```").unwrap();
        assert!((r.groundedness.unwrap() - 0.5).abs() < 0.001);
        assert!((r.relevance.unwrap() - 0.6).abs() < 0.001);
        assert!((r.hallucination.unwrap() - 0.5).abs() < 0.001);
    }

    #[test]
    fn code_fence_with_lang_no_newline() {
        let r = parse("```json\n{\"groundedness\":0.8,\"relevance\":0.9,\"reason\":\"Good\"}\n```").unwrap();
        assert!((r.groundedness.unwrap() - 0.8).abs() < 0.001);
    }

    #[test]
    fn scores_clamped_to_range() {
        let r = parse(r#"{"groundedness":1.5,"relevance":-0.3,"reason":"clamp test"}"#).unwrap();
        assert!((r.groundedness.unwrap() - 1.0).abs() < 0.001);
        assert!((r.relevance.unwrap() - 0.0).abs() < 0.001);
        assert!((r.hallucination.unwrap() - 0.0).abs() < 0.001);
    }

    #[test]
    fn malformed_json_returns_err() {
        assert!(parse("not json at all").is_err());
    }

    #[test]
    fn missing_field_returns_none_for_that_field() {
        let r = parse(r#"{"groundedness":0.8}"#).unwrap();
        assert!((r.groundedness.unwrap() - 0.8).abs() < 0.001);
        assert!(r.relevance.is_none());
        assert!((r.hallucination.unwrap() - 0.2).abs() < 0.001);
    }

    #[test]
    fn all_fields_missing_defaults() {
        let r = parse(r#"{}"#).unwrap();
        assert!(r.groundedness.is_none());
        assert!(r.relevance.is_none());
        assert!(r.hallucination.is_none());
        assert!(r.reason.is_none());
    }

    #[test]
    fn hallucination_derived_correctly() {
        let r = parse(r#"{"groundedness":0.3,"relevance":0.9,"reason":"low groundedness"}"#).unwrap();
        assert!((r.hallucination.unwrap() - 0.7).abs() < 0.001);
    }

    #[test]
    fn code_fence_without_json_tag() {
        let r = parse("```\n{\"groundedness\":0.4,\"relevance\":0.5,\"reason\":\"test\"}\n```").unwrap();
        assert!((r.groundedness.unwrap() - 0.4).abs() < 0.001);
    }


}
