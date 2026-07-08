//! Agent: response forwarding with provider fallback chain.

mod body_mutation;
pub mod content_quality_stage;
mod forward;
mod helpers;
mod meter_check;
mod output_scan;
mod provider_call;
mod response;
mod streaming;

use axum::response::Response;

use crate::pipeline_types::{AppError, ForwardArgs};

pub use forward::{forward_with_fallback, passthrough_forward};
pub use helpers::is_passthrough_path;
pub use output_scan::scan_output_impl;
pub use response::relay_response_headers;

/// Dispatch to streaming or non-streaming forward based on `is_streaming`.
pub async fn forward_or_stream(
    args: ForwardArgs<'_>,
    is_streaming: bool,
) -> Result<Response, AppError> {
    if is_streaming {
        streaming::forward_streaming(args).await
    } else {
        forward::forward_with_fallback(args).await
    }
}
