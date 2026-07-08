//! Dedicated content-quality scan stage. Extracted from the inline block in
//! `forward.rs` so the same logic serves both inline (block/redact modes) and
//! async (flag/monitor modes) paths.

use crate::adapters::content_quality::ContentQualityScores;
use crate::policy::DetectorStore;
use crate::tools::log_writer::LogWriter;

use super::helpers;

/// Outcome returned by the inline content quality scan.
pub struct CqInlineOutcome {
    pub scanned: bool,
    pub scores: Option<Vec<f32>>,
    pub flagged: bool,
    pub action: Option<String>,
    pub reason: Option<String>,
    pub blocked: bool,
    pub redact_message: Option<String>,
}

/// Context required for an async (background) content quality scan task.
pub struct CqAsyncCtx {
    pub client: reqwest::Client,
    pub policy_store: DetectorStore,
    pub log_writer: LogWriter,
    pub request_id: String,
    pub app_id: String,
    pub app_name: String,
    pub prompt_text: String,
    pub assistant_reply: String,
    pub mode: Option<String>,
    pub threshold: Option<f32>,
    pub base_trace: Option<String>,
}

/// Run a content quality scan inline (block/redact modes).
/// Returns the full outcome struct with action, blocked, and redact_message set.
/// The caller must check `outcome.blocked` / `outcome.redact_message` and handle
/// accordingly.
pub async fn run_inline(
    client: &reqwest::Client,
    policy_store: &DetectorStore,
    request_id: &str,
    app_id: &str,
    app_name: &str,
    prompt_text: &str,
    assistant_reply: &str,
    log_writer: &LogWriter,
    app_content_quality_mode: Option<&str>,
    app_content_quality_threshold: Option<f32>,
) -> CqInlineOutcome {
    let Some(scores) = crate::agents::content_quality::client::run_content_quality_scan(
        client, policy_store, request_id, app_id, app_name, prompt_text, assistant_reply, log_writer,
    ).await else {
        return CqInlineOutcome {
            scanned: false,
            scores: None,
            flagged: false,
            action: None,
            reason: None,
            blocked: false,
            redact_message: None,
        };
    };

    let outcome = build_outcome(&scores, app_content_quality_mode, app_content_quality_threshold, policy_store);
    CqInlineOutcome {
        scanned: true,
        scores: Some(vec![
            scores.groundedness.unwrap_or(0.0),
            scores.relevance.unwrap_or(0.0),
            scores.hallucination.unwrap_or(0.0),
        ]),
        flagged: outcome.flag,
        action: outcome.action.map(|a| a.to_string()),
        reason: scores.reason.clone(),
        blocked: outcome.blocked,
        redact_message: outcome.redact_message,
    }
}

struct InlineDecision {
    flag: bool,
    action: Option<&'static str>,
    blocked: bool,
    redact_message: Option<String>,
}

fn build_outcome(
    scores: &ContentQualityScores,
    mode: Option<&str>,
    threshold: Option<f32>,
    policy_store: &DetectorStore,
) -> InlineDecision {
    use crate::agents::content_quality::rules::ContentQualityEnforcementAction as CQA;

    let Some(action) = crate::agents::content_quality::rules::evaluate_content_quality(
        scores, mode, threshold, policy_store,
    ) else {
        return InlineDecision { flag: false, action: None, blocked: false, redact_message: None };
    };

    match action {
        CQA::Block => InlineDecision {
            flag: true,
            action: Some("blocked"),
            blocked: true,
            redact_message: None,
        },
        CQA::Redact => InlineDecision {
            flag: true,
            action: Some("redacted"),
            blocked: false,
            redact_message: Some(
                crate::agents::content_quality::rules::CONTENT_QUALITY_REDACT_MESSAGE.to_string(),
            ),
        },
        CQA::Flag => InlineDecision {
            flag: true,
            action: Some("flagged"),
            blocked: false,
            redact_message: None,
        },
        CQA::Monitor => InlineDecision {
            flag: true,
            action: Some("monitored"),
            blocked: false,
            redact_message: None,
        },
    }
}

/// Spawn a background task to run the content quality scan and update the log
/// row via `LogWriter::update_content_quality_results`.
///
/// Clones `assistant_reply` before output redaction (same point as today at
/// forward.rs:276) — caller is responsible for passing the pre-redaction value.
///
/// On successful scan, appends a completion stage via `helpers::append_content_quality_stage`
/// onto `base_trace` and writes the result to the DB.
/// On `None` (scan failed / timed out), exits silently — fail-open, the row
/// keeps `scanned=false` + the `"scheduled"` stage already appended.
pub fn spawn_async_scan(ctx: CqAsyncCtx) {
    tokio::spawn(async move {
        let Some(scores) = crate::agents::content_quality::client::run_content_quality_scan(
            &ctx.client, &ctx.policy_store, &ctx.request_id, &ctx.app_id, &ctx.app_name,
            &ctx.prompt_text, &ctx.assistant_reply, &ctx.log_writer,
        ).await else {
            return;
        };

        use crate::agents::content_quality::rules::ContentQualityEnforcementAction as CQA;
        let decision = crate::agents::content_quality::rules::evaluate_content_quality(
            &scores, ctx.mode.as_deref(), ctx.threshold, &ctx.policy_store,
        );

        let (flagged, action_str) = match decision {
            None => (false, None),
            Some(CQA::Monitor) => (true, Some("monitored")),
            Some(_) => (true, Some("flagged")),
        };

        let trace = helpers::append_content_quality_stage(
            &ctx.base_trace,
            action_str.unwrap_or("none"),
            &scores.reason,
        );

        ctx.log_writer.update_content_quality_results(
            ctx.request_id,
            scores.groundedness,
            scores.relevance,
            scores.hallucination,
            flagged,
            action_str.map(|s| s.to_string()),
            scores.reason.clone(),
            trace,
        );
    });
}
