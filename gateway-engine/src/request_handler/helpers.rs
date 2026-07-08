use axum::{http::StatusCode, response::Response};
use crate::tools::json_response::json_response;
use crate::pipeline_types::ScanSummary;

pub fn build_firewall_error(message: &str, request_id: &str, is_anthropic: bool, status: StatusCode) -> Response {
    let body = if is_anthropic {
        serde_json::json!({
            "type": "error",
            "error": {
                "type": "firewall_block",
                "message": message,
                "request_id": request_id,
                "hint": "This request was blocked by the AI Firewall Gateway. Contact your administrator with this request ID for details."
            }
        })
    } else {
        serde_json::json!({
            "error": {
                "message": message,
                "type": "firewall_block",
                "code": "blocked_by_policy",
                "request_id": request_id,
                "hint": "This request was blocked by the AI Firewall Gateway. Contact your administrator with this request ID for details."
            }
        })
    };
    json_response(status, &serde_json::to_string(&body).unwrap_or_default())
}

/// Build a 200 OK response shaped like a normal chat-completion, containing the
/// polite decline message. Mirrors the dual-dialect structure of `build_firewall_error`
/// but emits a success body instead of an error.
pub fn build_soft_decline_response(
    message:      &str,
    model:        &str,
    request_id:   &str,
    is_anthropic: bool,
) -> Response {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let body = if is_anthropic {
        serde_json::json!({
            "id": format!("msg_{}", request_id),
            "type": "message",
            "role": "assistant",
            "model": model,
            "content": [
                { "type": "text", "text": message }
            ],
            "stop_reason": "end_turn",
            "usage": { "input_tokens": 0, "output_tokens": 0 }
        })
    } else {
        serde_json::json!({
            "id": format!("chatcmpl-{}", request_id),
            "object": "chat.completion",
            "created": now,
            "model": model,
            "choices": [
                {
                    "index": 0,
                    "message": { "role": "assistant", "content": message },
                    "finish_reason": "stop"
                }
            ],
            "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 }
        })
    };
    json_response(StatusCode::OK, &serde_json::to_string(&body).unwrap_or_default())
}

pub fn trace_json(summary: &ScanSummary) -> Option<String> {
    if summary.trace_stages.is_empty() {
        return None;
    }
    serde_json::to_string(&serde_json::json!({
        "final_decision": summary.final_decision,
        "blocked_stage":  summary.blocked_stage,
        "stages":         summary.trace_stages,
    }))
    .ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::StatusCode;
    use serde_json::Value;
    use crate::pipeline_types::{ScanSummary, TraceStage};

    async fn body_json(resp: Response) -> Value {
        let bytes = axum::body::to_bytes(resp.into_body(), 10_000_000).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[tokio::test]
    async fn build_firewall_error_openai_dialect() {
        let resp = build_firewall_error("Test block message", "req-abc-123", false, StatusCode::FORBIDDEN);
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
        let body = body_json(resp).await;
        assert_eq!(body["error"]["message"], "Test block message");
        assert_eq!(body["error"]["type"], "firewall_block");
        assert_eq!(body["error"]["code"], "blocked_by_policy");
        assert_eq!(body["error"]["request_id"], "req-abc-123");
    }

    #[tokio::test]
    async fn build_firewall_error_anthropic_dialect() {
        let resp = build_firewall_error("Blocked by policy", "req-xyz-789", true, StatusCode::FORBIDDEN);
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
        let body = body_json(resp).await;
        assert_eq!(body["type"], "error");
        assert_eq!(body["error"]["type"], "firewall_block");
        assert_eq!(body["error"]["message"], "Blocked by policy");
        assert_eq!(body["error"]["request_id"], "req-xyz-789");
    }

    #[tokio::test]
    async fn build_firewall_error_payload_too_large() {
        let resp = build_firewall_error("Payload too large", "req-413", false, StatusCode::PAYLOAD_TOO_LARGE);
        assert_eq!(resp.status(), StatusCode::PAYLOAD_TOO_LARGE);
        let body = body_json(resp).await;
        assert_eq!(body["error"]["message"], "Payload too large");
    }

    #[tokio::test]
    async fn soft_decline_openai_dialect() {
        let resp = build_soft_decline_response("I cannot process this request", "gpt-4", "req-soft-1", false);
        assert_eq!(resp.status(), StatusCode::OK);
        let body = body_json(resp).await;
        assert_eq!(body["choices"][0]["message"]["content"], "I cannot process this request");
        assert!(body.get("content").is_none(), "Openai response should not have `content` array");
    }

    #[tokio::test]
    async fn soft_decline_anthropic_dialect() {
        let resp = build_soft_decline_response("I cannot help with that", "claude-3", "req-soft-2", true);
        assert_eq!(resp.status(), StatusCode::OK);
        let body = body_json(resp).await;
        assert_eq!(body["type"], "message");
        assert_eq!(body["content"][0]["text"], "I cannot help with that");
        assert!(body.get("choices").is_none(), "Anthropic response should not have `choices` array");
    }

    #[test]
    fn trace_json_empty_stages_returns_none() {
        let summary = ScanSummary {
            hit: None,
            semantic_matches: Vec::new(),
            emb_threshold: 0.85,
            classifier_result: None,
            false_positive_candidates: false,
            trace_stages: Vec::new(),
            final_decision: "allow".to_string(),
            blocked_stage: None,
            t2_result: None,
            cache_hit: false,
            cache_tier: None,
            cache_provider_id: None,
            cache_tokens_in: None,
            cache_tokens_out: None,
            cache_response_bytes: None,
            cache_response_headers: None,
        };
        assert!(trace_json(&summary).is_none());
    }

    #[test]
    fn trace_json_with_stages_returns_json() {
        let summary = ScanSummary {
            hit: None,
            semantic_matches: Vec::new(),
            emb_threshold: 0.85,
            classifier_result: None,
            false_positive_candidates: false,
            trace_stages: vec![
                TraceStage {
                    stage: "keyword_regex".to_string(),
                    decision: "safe".to_string(),
                    ms: 5,
                    detector: None,
                    framework_id: None,
                    confidence: None,
                    reason: None,
                    matches: Vec::new(),
                    threshold: None,
                    enforced: None,
                    would_block: None,
                },
            ],
            final_decision: "allow".to_string(),
            blocked_stage: None,
            t2_result: None,
            cache_hit: false,
            cache_tier: None,
            cache_provider_id: None,
            cache_tokens_in: None,
            cache_tokens_out: None,
            cache_response_bytes: None,
            cache_response_headers: None,
        };
        let result = trace_json(&summary);
        assert!(result.is_some());
        let parsed: Value = serde_json::from_str(&result.unwrap()).unwrap();
        assert_eq!(parsed["final_decision"], "allow");
        assert!(parsed["stages"].is_array());
        assert_eq!(parsed["stages"][0]["stage"], "keyword_regex");
    }
}
