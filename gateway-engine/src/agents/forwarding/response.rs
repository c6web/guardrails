/// Response formatting and header relay utilities for forwarding.
use axum::body::Bytes;
use axum::response::{IntoResponse, Response};

use super::helpers::should_relay_response_header;

/// Relay selected upstream response headers to the gateway's client response.
pub fn relay_response_headers(upstream: &reqwest::header::HeaderMap, response: &mut Response) {
    for (name, value) in upstream.iter() {
        if should_relay_response_header(name.as_str())
            && let Ok(val_str) = value.to_str()
                && let (Ok(hn), Ok(hv)) = (
                    name.as_str().parse::<axum::http::HeaderName>(),
                    val_str.parse::<axum::http::HeaderValue>(),
                ) {
                    response.headers_mut().insert(hn, hv);
                }
    }
}

/// Wrap bytes in a JSON content-type response.
pub(super) struct FormatJson(Bytes);

impl FormatJson {
    pub(super) fn new(b: Bytes) -> Self { FormatJson(b) }
}

impl IntoResponse for FormatJson {
    fn into_response(self) -> Response {
        let mut response = Response::new(self.0.into());
        response.headers_mut().insert("content-type", "application/json".parse().unwrap());
        response
    }
}
