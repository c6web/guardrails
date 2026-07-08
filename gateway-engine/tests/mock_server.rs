//! Mock upstream server for Phase 0 compatibility testing.
//!
//! Records incoming requests/responses verbatim. Supports both JSON and SSE streaming responses.
//! Must emit SSE chunks incrementally (not buffered) to verify TTFT and real-time pipe behavior.

use axum::{
    body::Bytes,
    extract::{Request, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Router,
};
use std::sync::Arc;
use tokio::sync::Mutex;

/// Recorded request data from the mock server.
#[derive(Debug, Clone)]
pub struct RecordedRequest {
    pub method: String,
    pub path: String,
    pub headers: serde_json::Value,
    pub body: Vec<u8>,
}

/// Recorded response data from the mock server.
#[derive(Debug, Clone)]
pub struct RecordedResponse {
    pub status: u16,
    pub headers: serde_json::Value,
    pub body: Vec<u8>,
}

/// Shared state for the mock server.
#[derive(Clone)]
pub struct MockState {
    requests: Arc<Mutex<Vec<RecordedRequest>>>,
    responses: Arc<Mutex<Vec<RecordedResponse>>>,
}

impl Default for MockState {
    fn default() -> Self {
        Self {
            requests: Arc::new(Mutex::new(Vec::new())),
            responses: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

impl MockState {
    pub fn new() -> Self {
        Self::default()
    }
}

/// Reset all recorded data.
pub async fn reset_recordings(state: &MockState) {
    let mut reqs = state.requests.lock().await;
    reqs.clear();
    let mut resps = state.responses.lock().await;
    resps.clear();
}

/// Get recorded requests.
pub async fn get_recorded_requests(state: &MockState) -> Vec<RecordedRequest> {
    state.requests.lock().await.clone()
}

/// Get recorded responses.
pub async fn get_recorded_responses(state: &MockState) -> Vec<RecordedResponse> {
    state.responses.lock().await.clone()
}

/// Record a request and return a JSON response echoing back the received data.
async fn echo_json_handler(
    State(state): State<MockState>,
    request: Request,
) -> Response {
    let method = request.method().clone();
    let path = request.uri().path().to_string();

    // Convert to http::Request and extract body using pattern matching
    let http_request: http::Request<axum::body::Body> = request;
    let headers_map: serde_json::Map<String, serde_json::Value> = http_request
        .headers()
        .clone()
        .into_iter()
        .filter_map(|(name, value)| {
            name.map(|n| (n.to_string(), serde_json::Value::String(value.to_str().unwrap_or("").to_string())))
        })
        .collect();

    // Take ownership of the body by destructuring the request
    let parts = http_request.into_parts();
    let body_bytes = axum::body::to_bytes(parts.1, 1024 * 1024).await.unwrap();

    // Record the request
    let recorded = RecordedRequest {
        method: method.to_string(),
        path,
        headers: serde_json::Value::Object(headers_map),
        body: body_bytes.to_vec(),
    };

    state.requests.lock().await.push(recorded.clone());

    // Return a JSON response with the recorded data
    let resp_body = serde_json::json!({
        "status": "ok",
        "received_method": recorded.method,
        "received_path": recorded.path,
        "body_length": recorded.body.len(),
    });

    let response_body = serde_json::to_string(&resp_body).unwrap();
    let mut response: Response = axum::body::Body::from(response_body.clone()).into_response();
    *response.status_mut() = StatusCode::OK;
    response.headers_mut().insert(
        http::header::CONTENT_TYPE,
        "application/json".parse().unwrap(),
    );

    // Record the response headers
    {
        let resp_headers: serde_json::Map<String, serde_json::Value> = response
            .headers()
            .clone()
            .into_iter()
            .filter_map(|(name, value)| {
                name.map(|n| (n.to_string(), serde_json::Value::String(value.to_str().unwrap_or("").to_string())))
            })
            .collect();

        state.responses.lock().await.push(RecordedResponse {
            status: response.status().as_u16(),
            headers: serde_json::Value::Object(resp_headers),
            body: response_body.into_bytes(),
        });
    }

    response
}

/// Record a request and return an SSE streaming response.
async fn echo_streaming_handler(
    State(state): State<MockState>,
    request: Request,
) -> Response {
    let _method = request.method().clone();
    let _path = request.uri().path().to_string();

    // Convert to http::Request and extract body (we don't use it but need to consume it)
    let http_request: http::Request<axum::body::Body> = request;
    let parts = http_request.into_parts();
    let _body_bytes = axum::body::to_bytes(parts.1, 1024 * 1024).await.unwrap();

    // Build SSE streaming response with incremental chunks
    let sse_data = vec![
        "data: {\"content\": \"Hello\", \"index\": 0}",
        "data: {\"content\": \" world\", \"index\": 1}",
        "data: [DONE]",
    ];

    let body_stream = futures::stream::iter(sse_data.into_iter().map(|chunk| {
        Ok::<_, std::convert::Infallible>(Bytes::from(chunk))
    }));

    let mut response = Response::new(axum::body::Body::from_stream(body_stream));
    *response.status_mut() = StatusCode::OK;
    response.headers_mut().insert(
        http::header::CONTENT_TYPE,
        "text/event-stream".parse().unwrap(),
    );

    state.responses.lock().await.push(RecordedResponse {
        status: 200,
        headers: serde_json::Value::Object(serde_json::Map::new()),
        body: String::from("data: {\"content\": \"Hello\", \"index\": 0}\ndata: {\"content\": \" world\", \"index\": 1}\ndata: [DONE]").into_bytes(),
    });

    response
}

/// Create a mock server router.
pub fn create_mock_router(state: MockState) -> Router {
    Router::new()
        .route("/v1/chat/completions", post(echo_json_handler))
        .route("/v1/messages", post(echo_json_handler))
        .route("/v1/audio/speech", post(echo_json_handler))
        .route("/v1/embeddings", post(echo_json_handler))
        .route("/v1/models", get(models_handler))
        .route("/v1/streaming", post(echo_streaming_handler))
        .with_state(state)
}

async fn models_handler() -> Response {
    let resp_body = serde_json::json!({
        "object": "list",
        "data": [
            {"id": "gpt-4", "object": "model", "created": 1680, "owned_by": "openai"},
        ]
    });
    let response_body = serde_json::to_string(&resp_body).unwrap();
    let mut response: Response = axum::body::Body::from(response_body).into_response();
    *response.status_mut() = StatusCode::OK;
    response.headers_mut().insert(
        http::header::CONTENT_TYPE,
        "application/json".parse().unwrap(),
    );
    response
}

/// Spawn the mock server on a given port and return its state.
pub async fn spawn_mock_server(port: u16) -> MockState {
    let state = MockState::new();
    let app = create_mock_router(state.clone());

    let addr: std::net::SocketAddr = format!("0.0.0.0:{port}").parse().unwrap();
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();

    axum::serve(listener, app).await.unwrap();

    state
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn test_mock_state_creation() {
        let state = MockState::new();
        assert!(get_recorded_requests(&state).await.is_empty());
        assert!(get_recorded_responses(&state).await.is_empty());
    }

    #[tokio::test]
    async fn test_echo_json_handler_integration() -> anyhow::Result<()> {
        // Bind to a random available port
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let port = addr.port();

        let state = MockState::new();
        let app = create_mock_router(state.clone());

        // Spawn the server in background and get abort handle
        let serve_task = tokio::spawn(async {
            axum::serve(listener, app).await
        });

        // Give the server time to start
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Make a request to the mock server
        let url = format!("http://127.0.0.1:{}/v1/chat/completions", port);
        let response = reqwest::Client::new().post(&url).body("test").send().await?;
        assert_eq!(response.status(), 200);

        // Verify recorded data
        let requests = get_recorded_requests(&state).await;
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].method, "POST");

        // Abort the server task to prevent hanging
        serve_task.abort();

        Ok(())
    }

    #[tokio::test]
    async fn test_sse_streaming_integration() -> anyhow::Result<()> {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let port = addr.port();

        let state = MockState::new();
        let app = create_mock_router(state.clone());

        let serve_task = tokio::spawn(async {
            axum::serve(listener, app).await
        });

        tokio::time::sleep(Duration::from_millis(100)).await;

        let url = format!("http://127.0.0.1:{}/v1/streaming", port);
        let response = reqwest::Client::new().post(&url).body("test").send().await?;
        assert_eq!(response.status(), 200);

        let responses = get_recorded_responses(&state).await;
        assert_eq!(responses.len(), 1);
        assert_eq!(responses[0].status, 200);

        serve_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn test_reset_recordings() -> anyhow::Result<()> {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let port = addr.port();

        let state = MockState::new();
        let app = create_mock_router(state.clone());

        let serve_task = tokio::spawn(async {
            axum::serve(listener, app).await
        });

        tokio::time::sleep(Duration::from_millis(100)).await;

        // Make two requests
        let url = format!("http://127.0.0.1:{}/v1/chat/completions", port);
        reqwest::Client::new().post(&url).body("test1").send().await?;
        reqwest::Client::new().post(&url).body("test2").send().await?;

        let requests = get_recorded_requests(&state).await;
        assert_eq!(requests.len(), 2);

        // Reset recordings
        reset_recordings(&state).await;

        let requests_after = get_recorded_requests(&state).await;
        assert_eq!(requests_after.len(), 0);

        serve_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn test_models_endpoint() -> anyhow::Result<()> {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let port = addr.port();

        let state = MockState::new();
        let app = create_mock_router(state.clone());

        let serve_task = tokio::spawn(async {
            axum::serve(listener, app).await
        });

        tokio::time::sleep(Duration::from_millis(100)).await;

        let url = format!("http://127.0.0.1:{}/v1/models", port);
        let response = reqwest::Client::new().get(&url).send().await?;
        assert_eq!(response.status(), 200);

        serve_task.abort();
        Ok(())
    }
}
