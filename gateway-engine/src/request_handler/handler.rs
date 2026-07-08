//! Thin wrapper: calls `prepare()` then delegates to the shared security pipeline.

use axum::{
    extract::{ConnectInfo, Request as AxumRequest, State},
    response::Response,
};
use std::net::SocketAddr;

use crate::pipeline_types::AppError;
use crate::request_handler::pipeline::run_security_pipeline;
use crate::request_handler::preamble::prepare;

/// Execute the full request handler with pipeline-based scanning.
#[tracing::instrument(skip_all, fields(request_id, app_id, route))]
pub async fn handle_request(
    state: State<crate::GatewayState>,
    req: AxumRequest,
    connect_info: Option<ConnectInfo<SocketAddr>>,
    is_anthropic: bool,
) -> Result<Response, AppError> {
    let prep = match prepare(&state, req, connect_info, "req", is_anthropic, None).await {
        Ok(p) => p,
        Err(resp) => return Ok(resp),
    };

    let prompt_text       = prep.prompt_text.clone();
    let user_prompt       = prep.user_prompt.clone();
    let body_for_dispatch = prep.req_json.clone();
    let is_anthropic_val  = prep.is_anthropic;
    let is_multipart_val  = prep.is_multipart;

    run_security_pipeline(
        &state,
        prep,
        prompt_text,
        user_prompt,
        body_for_dispatch,
        None,             // upstream_path_override
        is_anthropic_val,
        is_multipart_val,
        "request",
        None,             // forward_body_override
    )
    .await
}
