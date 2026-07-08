//! JSON response helper — constructs HTTP responses with JSON content type.

use axum::{http::StatusCode, response::Response};

pub fn json_response(status: StatusCode, body: &str) -> Response {
    let mut resp = Response::new(body.to_string().into());
    *resp.status_mut() = status;
    resp.headers_mut().insert("content-type", "application/json".parse().unwrap());
    resp
}
