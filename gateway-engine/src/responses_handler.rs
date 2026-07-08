//! Handler for POST /v1/responses — OpenAI Responses API, passthrough-with-scan.
//!
//! Extracts text from `input` and `instructions` fields for the security scan
//! pipeline, then forwards the original raw bytes verbatim to the upstream provider.
//!
//! Thin wrapper: calls `prepare()`, re-extracts Responses-specific prompt text,
//! appends tool definitions, then delegates to the shared security pipeline.

use axum::{
    extract::{ConnectInfo, Request as AxumRequest, State},
    response::Response,
};
use std::net::SocketAddr;

use crate::constants::RESPONSES_PATH;
use crate::pipeline_types::AppError;
use crate::request_handler::pipeline::run_security_pipeline;
use crate::request_handler::preamble::prepare;

/// Handle POST /v1/responses: run the full security pipeline, forward raw bytes.
#[tracing::instrument(skip_all, fields(request_id, app_id))]
pub async fn handle_responses_request(
    state: State<crate::GatewayState>,
    req: AxumRequest,
    connect_info: Option<ConnectInfo<SocketAddr>>,
) -> Result<Response, AppError> {
    let prep = match prepare(&state, req, connect_info, "req", false, None).await {
        Ok(p) => p,
        Err(resp) => return Ok(resp),
    };

    // Override content extraction with Responses API-specific extraction
    // (input/instructions fields instead of messages), then append tool definitions.
    let (mut prompt_text, user_prompt) =
        crate::content::extraction::extract_responses_text(&prep.req_json);
    let tools_text = crate::content::extraction::extract_tools(&prep.req_json);
    if !tools_text.is_empty() {
        prompt_text.push_str("\n\n");
        prompt_text.push_str(&tools_text);
    }

    // Clone before moving `prep` into the pipeline function
    let body_for_dispatch = prep.req_json.clone();

    run_security_pipeline(
        &state,
        prep,
        prompt_text,
        user_prompt,
        body_for_dispatch,
        Some(RESPONSES_PATH), // upstream_path_override
        false,                // is_anthropic — Responses API uses OpenAI dialect
        false,                // is_multipart — /v1/responses has no multipart support
        "responses",
        None,                 // forward_body_override
    )
    .await
}
