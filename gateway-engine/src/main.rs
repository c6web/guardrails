#![allow(clippy::too_many_arguments)]

use axum::{
    extract::{ConnectInfo, Path, Request as AxumRequest, State},
    http::{HeaderMap, StatusCode},
    response::Response,
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use std::time::Duration;
use tower_http::cors::{Any, CorsLayer};
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::timeout::TimeoutLayer;
use reqwest::Client;
use std::sync::Arc;

macro_rules! gw_info {
    ($($arg:tt)*) => { tracing::info!("{}", format!($($arg)*)) };
}
macro_rules! gw_warn {
    ($($arg:tt)*) => { tracing::warn!("{}", format!($($arg)*)) };
}
macro_rules! gw_error {
    ($($arg:tt)*) => { tracing::error!("{}", format!($($arg)*)) };
}

mod adapters;
mod agents;
mod constants;
mod content;
mod crypto;
mod enforcement;
mod policy;
mod tools;

mod completions_handler;
mod cq_scan_handler;
mod moderations_handler;
mod pipeline_types;
mod provider_test_handler;
mod request_handler;
mod responses_handler;
mod scan_handler;

use ipnet::IpNet;
use pipeline_types::{AppError, LayerResult};
use policy::DetectorStore;
use tools::acl_check::{is_ip_blocked, resolve_source_ip};
use tools::auth::{AuthError, AuthService, check_admin_key, check_gateway_key};
use tools::json_response::json_response;
use crate::request_handler::helpers::build_firewall_error;
use agents::forwarding::{is_passthrough_path, passthrough_forward, relay_response_headers, scan_output_impl};
use agents::orchestrator::scan_keyword_regex;
use adapters::llm::adapter_for_provider;
use tools::log_writer::{LogEntry, LogWriter};
use tools::rate_limiter::{RateLimitResult, RateLimiter, ReloadRateLimiter};
use tools::quota_tracker::QuotaTracker;
use tools::provider_meter::ProviderMeter;
use agents::cache::store::ResponseCacheStore;

#[derive(Clone)]
pub(crate) struct GatewayState {
    pub(crate) client:                Arc<Client>,
    pub(crate) log_writer:            LogWriter,
    pub(crate) policy_store:          DetectorStore,
    pub(crate) auth_service:          AuthService,
    pub(crate) rate_limiter:          RateLimiter,
    pub(crate) preauth_rate_limiter:  RateLimiter,
    pub(crate) reload_rate_limiter:   ReloadRateLimiter,
    pub(crate) quota_tracker:         QuotaTracker,
    pub(crate) provider_meter:        ProviderMeter,
    pub(crate) db_pool:               Arc<sqlx::PgPool>,
    pub(crate) body_limit_bytes:      usize,
    /// Number of trusted reverse-proxy hops; 0 = use TCP socket addr for source IP.
    pub(crate) trusted_proxy_depth:   usize,
    /// IP/CIDR ranges of reverse proxies that are trusted to set X-Forwarded-For.
    /// When `trusted_proxy_depth > 0`, the socket peer IP must match one of these
    /// ranges; otherwise the XFF header is discarded and the socket IP is used.
    pub(crate) trusted_proxy_ips:     Vec<IpNet>,
    /// When true, embedding/classifier errors block the request instead of allowing it.
    pub(crate) scan_fail_closed:      bool,
    /// Gateway instance ID from GATEWAY_INSTANCE_ID env var.
    pub(crate) gateway_instance_id:   String,
    /// Response cache store (L1 in-memory + optional L2 Postgres).
    pub(crate) response_cache_store:  Option<ResponseCacheStore>,
}

/// Return a 401 JSON response for missing/invalid admin keys.
fn admin_key_required(msg: &str) -> Response {
    let body = serde_json::json!({ "error": msg }).to_string();
    let mut resp = Response::new(body.into());
    *resp.status_mut() = StatusCode::UNAUTHORIZED;
    resp.headers_mut().insert("content-type", "application/json".parse().unwrap());
    resp
}

#[axum::debug_handler]
 async fn chat_completion(
    state: State<GatewayState>,
    req: AxumRequest,
) -> Result<Response, AppError> {
    let connect_info = req
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .cloned();
    request_handler::handle_request(state, req, connect_info, false).await
}

async fn anthropic_messages(
    state: State<GatewayState>,
    req: AxumRequest,
) -> Result<Response, AppError> {
    let connect_info = req
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .cloned();
    request_handler::handle_request(state, req, connect_info, true).await
}

async fn openai_responses(
    state: State<GatewayState>,
    req: AxumRequest,
) -> Result<Response, AppError> {
    let connect_info = req.extensions().get::<ConnectInfo<SocketAddr>>().cloned();
    responses_handler::handle_responses_request(state, req, connect_info).await
}

async fn completions(
    state: State<GatewayState>,
    req: AxumRequest,
) -> Result<Response, AppError> {
    let connect_info = req.extensions().get::<ConnectInfo<SocketAddr>>().cloned();
    completions_handler::handle_completions_request(state, req, connect_info).await
}

async fn moderations(
    state: State<GatewayState>,
    req: AxumRequest,
) -> Result<Response, AppError> {
    let connect_info = req.extensions().get::<ConnectInfo<SocketAddr>>().cloned();
    moderations_handler::handle_moderations_request(state, req, connect_info).await
}

async fn embeddings(
    state: State<GatewayState>,
    req: AxumRequest,
) -> Result<Response, AppError> {
    let connect_info = req
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .cloned();
    agents::embedding::handle_embedding_request(state, req, connect_info).await
}

async fn test_upstream(
    state: State<GatewayState>,
    req: AxumRequest,
) -> Result<Response, AppError> {
    let connect_info = req.extensions().get::<ConnectInfo<SocketAddr>>().cloned();
    provider_test_handler::handle_upstream_test(state, req, connect_info).await
}

async fn test_classification(
    state: State<GatewayState>,
    req: AxumRequest,
) -> Result<Response, AppError> {
    let connect_info = req.extensions().get::<ConnectInfo<SocketAddr>>().cloned();
    provider_test_handler::handle_classification_test(state, req, connect_info).await
}

async fn scan(
    state: State<GatewayState>,
    req: AxumRequest,
) -> Result<Response, AppError> {
    let connect_info = req.extensions().get::<ConnectInfo<SocketAddr>>().cloned();
    scan_handler::handle_scan_request(state, req, connect_info).await
}

async fn cq_scan(
    state: State<GatewayState>,
    req: AxumRequest,
) -> Result<Response, AppError> {
    let connect_info = req.extensions().get::<ConnectInfo<SocketAddr>>().cloned();
    cq_scan_handler::handle_cq_scan_request(state, req, connect_info).await
}

async fn health(state: State<GatewayState>) -> Response {
    gw_info!("[health] health check");
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S UTC").to_string();
    let mut data_db_ok = true;
    let mut log_db_ok  = true;

    match sqlx::query("SELECT 1").fetch_one(state.db_pool.as_ref()).await {
        Ok(_) => { gw_info!("[health] data DB is healthy"); }
        Err(e) => {
            gw_warn!("[health] data DB connection check failed");
            gw_error!("[health] data DB error: {}", e);
            data_db_ok = false;
        }
    };

    match sqlx::query("SELECT 1").fetch_one(state.log_writer.pool.as_ref()).await {
        Ok(_) => { gw_info!("[health] log DB is healthy"); }
        Err(e) => {
            gw_warn!("[health] log DB connection check failed");
            gw_error!("[health] log DB error: {}", e);
            log_db_ok = false;
        }
    };

    let cache_loaded_at = *state.policy_store.cache_loaded_at.read().unwrap_or_else(|e| e.into_inner());
    let interval_secs = state.policy_store.cache_reload_interval_secs;
    let next_reload = cache_loaded_at + chrono::Duration::seconds(interval_secs as i64);
    let remaining = next_reload - chrono::Utc::now();
    let secs_remaining = remaining.num_seconds().max(0);
    let mins = secs_remaining / 60;
    let secs = secs_remaining % 60;

    let detection_degraded = *state.policy_store.detection_degraded.read().unwrap_or_else(|e| e.into_inner());
    let healthy = data_db_ok && log_db_ok;
    let body = serde_json::json!({
        "status": if healthy { "healthy" } else { "unhealthy" },
        "timestamp": now,
        "data_db": data_db_ok,
        "log_db": log_db_ok,
        "cache_loaded_at": cache_loaded_at.format("%Y-%m-%d %H:%M:%S UTC").to_string(),
        "cache_next_reload_at": next_reload.format("%Y-%m-%d %H:%M:%S UTC").to_string(),
        "cache_next_reload_in": format!("{}m {}s", mins, secs),
        "detection_degraded": detection_degraded,
    });
    let mut resp = Response::new(body.to_string().into());
    *resp.status_mut() = if healthy { StatusCode::OK } else { StatusCode::SERVICE_UNAVAILABLE };
    resp.headers_mut().insert("content-type", "application/json".parse().unwrap());
    resp
}

async fn list_models(
    state: State<GatewayState>,
    headers: HeaderMap,
) -> Response {
    let now_unix = chrono::Utc::now().timestamp();

    let auth_result = state.auth_service.authenticate(&headers);
    let auth = match auth_result {
        Ok(a) => a,
        Err(AuthError::MissingKey) => {
            return json_response(
                StatusCode::UNAUTHORIZED,
                r#"{"error":"API key required. Provide Authorization: Bearer <key>"}"#,
            );
        }
        Err(AuthError::InvalidKey) => {
            return json_response(
                StatusCode::UNAUTHORIZED,
                r#"{"error":"Invalid or inactive API key"}"#,
            );
        }
    };

    let models: Vec<serde_json::Value> = match auth.primary_provider_id {
        Some(ref pid) => {
            match state.policy_store.resolve_provider(pid) {
                Some(p) => {
                    if p.allowed_models.is_empty() {
                        // Pre-migration provider: fall back to single default model
                        let id = p.model.clone().unwrap_or_else(|| p.name.clone());
                        vec![serde_json::json!({
                            "id": id,
                            "object": "model",
                            "created": now_unix,
                            "owned_by": p.vendor,
                            "default": true,
                        })]
                    } else {
                        p.allowed_models.iter().map(|m| {
                            let is_default = p.model.as_deref() == Some(m.as_str());
                            serde_json::json!({
                                "id": m,
                                "object": "model",
                                "created": now_unix,
                                "owned_by": p.vendor,
                                "default": is_default,
                            })
                        }).collect()
                    }
                }
                None => vec![],
            }
        }
        None => vec![],
    };

    let body = serde_json::json!({
        "object": "list",
        "data": models,
    });
    json_response(StatusCode::OK, &body.to_string())
}

async fn model_detail(
    state: State<GatewayState>,
    headers: HeaderMap,
    Path(model_id): Path<String>,
) -> Response {
    let now_unix = chrono::Utc::now().timestamp();

    let auth_result = state.auth_service.authenticate(&headers);
    let auth = match auth_result {
        Ok(a) => a,
        Err(AuthError::MissingKey) => {
            return json_response(
                StatusCode::UNAUTHORIZED,
                r#"{"error":"API key required. Provide Authorization: Bearer <key>"}"#,
            );
        }
        Err(AuthError::InvalidKey) => {
            return json_response(
                StatusCode::UNAUTHORIZED,
                r#"{"error":"Invalid or inactive API key"}"#,
            );
        }
    };

    match auth.primary_provider_id {
        Some(ref pid) => {
            if let Some(p) = state.policy_store.resolve_provider(pid) {
                if p.allowed_models.is_empty() {
                    // Pre-migration provider: match against single default model
                    let id = p.model.clone().unwrap_or_else(|| p.name.clone());
                    if id == model_id {
                        let body = serde_json::json!({
                            "id": id,
                            "object": "model",
                            "created": now_unix,
                            "owned_by": p.vendor,
                            "default": true,
                        });
                        return json_response(StatusCode::OK, &body.to_string());
                    }
                } else if p.allowed_models.iter().any(|m| m == &model_id) {
                    let is_default = p.model.as_deref() == Some(&model_id);
                    let body = serde_json::json!({
                        "id": model_id,
                        "object": "model",
                        "created": now_unix,
                        "owned_by": p.vendor,
                        "default": is_default,
                    });
                    return json_response(StatusCode::OK, &body.to_string());
                }
            }
        }
        None => {}
    }

    json_response(
        StatusCode::NOT_FOUND,
        &serde_json::json!({
            "error": { "message": format!("Model '{}' not found", model_id), "type": "not_found", "code": "model_not_found" }
        }).to_string(),
    )
}

async fn version(state: State<GatewayState>) -> Response {
    let body = serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "instance_id": state.gateway_instance_id,
        "server": "ai-firewall-gateway",
    });
    let mut resp = Response::new(body.to_string().into());
    *resp.status_mut() = StatusCode::OK;
    resp.headers_mut().insert("content-type", "application/json".parse().unwrap());
    resp
}

async fn metrics_handler(
    state: State<GatewayState>,
    req: AxumRequest,
) -> Response {
    match check_admin_key(req.headers(), &state.policy_store.admin_key_cache) {
        Some(prefix) => gw_info!("[metrics] access granted key_prefix={}", prefix),
        None => {
            gw_warn!("[metrics] 401 UNAUTHORIZED — admin key required");
            return admin_key_required("Admin API key required to access /metrics");
        }
    }
    let body = tools::telemetry::render_metrics();
    let mut resp = Response::new(body.into());
    *resp.status_mut() = StatusCode::OK;
    resp.headers_mut().insert(
        "content-type",
        "text/plain; version=0.0.4; charset=utf-8".parse().unwrap(),
    );
    resp
}

async fn gateway_id_handler(
    state: State<GatewayState>,
    req: AxumRequest,
) -> Response {
    match check_admin_key(req.headers(), &state.policy_store.admin_key_cache) {
        Some(prefix) => gw_info!("[id] access granted key_prefix={}", prefix),
        None => {
            gw_warn!("[id] 401 UNAUTHORIZED — admin key required");
            return admin_key_required("Admin API key required to access /id");
        }
    }
    let body = serde_json::json!({ "instance_id": state.gateway_instance_id });
    let mut resp = Response::new(body.to_string().into());
    *resp.status_mut() = StatusCode::OK;
    resp.headers_mut().insert("content-type", "application/json".parse().unwrap());
    resp
}

async fn reload(state: State<GatewayState>, req: AxumRequest) -> Response {
    // Resolve source IP
    let connect_info = req.extensions().get::<ConnectInfo<SocketAddr>>().cloned();
    let xff = req.headers()
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let source_ip = resolve_source_ip(
        connect_info.map(|c| c.0),
        xff.as_deref(),
        state.trusted_proxy_depth,
        &state.trusted_proxy_ips,
    );
    let start = std::time::Instant::now();

    // Check per-gateway control key first; fall back to legacy admin key
    let (granted, granted_by, key_prefix) = check_gateway_key(req.headers(), &state.policy_store.gateway_key_cache)
        .map(|prefix| (true, "gateway_key", prefix.clone()))
        .or_else(|| {
            check_admin_key(req.headers(), &state.policy_store.admin_key_cache)
                .map(|prefix| (true, "admin_key", prefix.clone()))
        })
        .unwrap_or((false, "", String::new()));

    if !granted {
        gw_warn!("[reload] 401 UNAUTHORIZED — no valid gateway or admin key ip={}", source_ip);
        return admin_key_required("Gateway control key required to access /reload");
    }
    gw_info!("[reload] reload request received from ip={} key_prefix={}", source_ip, key_prefix);

    // Rate limit check: max 3 reloads per 60 seconds
    match state.reload_rate_limiter.check() {
        RateLimitResult::Limited { retry_after_secs } => {
            gw_warn!("[reload] 429 RATE_LIMITED ip={} retry_after={}s", source_ip, retry_after_secs);
            state.log_writer.log_reload(granted_by, &key_prefix, &source_ip, "rate_limited",
                Some(&format!("Rate limited, retry after {}s", retry_after_secs)),
                start.elapsed().as_millis() as i64);
            let body = serde_json::json!({
                "status": "error",
                "message": "Too many reload requests",
                "retry_after": retry_after_secs,
                "timestamp": chrono::Local::now().format("%Y-%m-%d %H:%M:%S UTC").to_string()
            });
            let mut resp = Response::new(body.to_string().into());
            *resp.status_mut() = StatusCode::TOO_MANY_REQUESTS;
            resp.headers_mut().insert("retry-after", retry_after_secs.to_string().parse().unwrap());
            resp.headers_mut().insert("content-type", "application/json".parse().unwrap());
            return resp;
        }
        RateLimitResult::Allowed { remaining } => {
            gw_info!("[reload] rate limit OK remaining={}", remaining);
        }
    }

    // Check DB connection health with a simple query
    match sqlx::query("SELECT 1").fetch_one(state.db_pool.as_ref()).await {
        Err(e) => {
            gw_error!("[reload] DB connection check failed: {} ip={}", e, source_ip);
            state.log_writer.log_reload(granted_by, &key_prefix, &source_ip, "error",
                Some(&format!("DB connection failed: {}", e)),
                start.elapsed().as_millis() as i64);
            let body = serde_json::json!({
                "status": "error",
                "message": "Database connection failed",
                "timestamp": chrono::Local::now().format("%Y-%m-%d %H:%M:%S UTC").to_string()
            });
            let mut resp = Response::new(body.to_string().into());
            *resp.status_mut() = StatusCode::SERVICE_UNAVAILABLE;
            resp.headers_mut().insert("content-type", "application/json".parse().unwrap());
            return resp;
        }
        Ok(_) => {
            gw_info!("[reload] DB connection OK");
        }
    }

    // DB is healthy — refetch all cached data using existing safe refetch approach
    // Each loader logs its own errors and keeps existing cache on failure
    policy::reload_cache(&state.policy_store, state.db_pool.as_ref()).await;

    state.log_writer.log_reload(granted_by, &key_prefix, &source_ip, "success", None,
        start.elapsed().as_millis() as i64);

    let body = serde_json::json!({
        "status": "success",
        "message": "Cache reload triggered. Check logs for detailed status.",
        "timestamp": chrono::Local::now().format("%Y-%m-%d %H:%M:%S UTC").to_string()
    });
    let mut resp = Response::new(body.to_string().into());
    *resp.status_mut() = StatusCode::OK;
    resp.headers_mut().insert("content-type", "application/json".parse().unwrap());
    resp
}

/// `POST /cache/flush` — admin-triggered force-expire of the response cache.
/// Body: optional `{"app_id": "..."}` to scope the flush to one app; omit/empty
/// body flushes every app's cached entries (both L1 in-memory and L2 Postgres).
async fn cache_flush(state: State<GatewayState>, req: AxumRequest) -> Response {
    let connect_info = req.extensions().get::<ConnectInfo<SocketAddr>>().cloned();
    let headers = req.headers().clone();
    let xff = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
    let source_ip = resolve_source_ip(
        connect_info.map(|c| c.0),
        xff.as_deref(),
        state.trusted_proxy_depth,
        &state.trusted_proxy_ips,
    );
    let start = std::time::Instant::now();

    let (granted, key_prefix) = check_gateway_key(&headers, &state.policy_store.gateway_key_cache)
        .map(|prefix| (true, prefix.clone()))
        .or_else(|| check_admin_key(&headers, &state.policy_store.admin_key_cache).map(|prefix| (true, prefix.clone())))
        .unwrap_or((false, String::new()));

    if !granted {
        gw_warn!("[cache_flush] 401 UNAUTHORIZED — no valid gateway or admin key ip={}", source_ip);
        return admin_key_required("Gateway control key required to access /cache/flush");
    }

    match state.reload_rate_limiter.check() {
        RateLimitResult::Limited { retry_after_secs } => {
            gw_warn!("[cache_flush] 429 RATE_LIMITED ip={} retry_after={}s", source_ip, retry_after_secs);
            let body = serde_json::json!({
                "status": "error",
                "message": "Too many cache flush requests",
                "retry_after": retry_after_secs,
            });
            let mut resp = Response::new(body.to_string().into());
            *resp.status_mut() = StatusCode::TOO_MANY_REQUESTS;
            resp.headers_mut().insert("retry-after", retry_after_secs.to_string().parse().unwrap());
            resp.headers_mut().insert("content-type", "application/json".parse().unwrap());
            return resp;
        }
        RateLimitResult::Allowed { .. } => {}
    }

    let body_bytes = axum::body::to_bytes(req.into_body(), state.body_limit_bytes).await.unwrap_or_default();
    let app_id: Option<String> = if body_bytes.is_empty() {
        None
    } else {
        serde_json::from_slice::<serde_json::Value>(&body_bytes)
            .ok()
            .and_then(|v| v.get("app_id").and_then(|a| a.as_str()).map(|s| s.to_string()))
    };

    let Some(ref cache_store) = state.response_cache_store else {
        let body = serde_json::json!({
            "status": "success",
            "message": "Response cache is disabled (RESPONSE_CACHE_ENABLED=false) — nothing to flush.",
            "l2_rows_deleted": 0,
        });
        let mut resp = Response::new(body.to_string().into());
        resp.headers_mut().insert("content-type", "application/json".parse().unwrap());
        return resp;
    };

    cache_store.flush_l1(app_id.as_deref());
    let l2_result = cache_store.flush_l2(app_id.as_deref()).await;

    let elapsed = start.elapsed().as_millis() as i64;
    match l2_result {
        Ok(rows_deleted) => {
            gw_info!("[cache_flush] success ip={} key_prefix={} app_id={} l2_rows_deleted={} elapsed={}ms",
                source_ip, key_prefix, app_id.as_deref().unwrap_or("all"), rows_deleted, elapsed);
            let body = serde_json::json!({
                "status": "success",
                "message": if app_id.is_some() { "App cache flushed" } else { "All response cache entries flushed" },
                "app_id": app_id,
                "l2_rows_deleted": rows_deleted,
                "timestamp": chrono::Local::now().format("%Y-%m-%d %H:%M:%S UTC").to_string()
            });
            let mut resp = Response::new(body.to_string().into());
            *resp.status_mut() = StatusCode::OK;
            resp.headers_mut().insert("content-type", "application/json".parse().unwrap());
            resp
        }
        Err(e) => {
            gw_error!("[cache_flush] L2 delete failed: {} ip={}", e, source_ip);
            let body = serde_json::json!({
                "status": "error",
                "message": format!("L1 flushed, but L2 delete failed: {}", e),
            });
            let mut resp = Response::new(body.to_string().into());
            *resp.status_mut() = StatusCode::INTERNAL_SERVER_ERROR;
            resp.headers_mut().insert("content-type", "application/json".parse().unwrap());
            resp
        }
    }
}

/// `POST /content-quality/evaluate-test` — control endpoint for testing CQ
/// evaluation without an app context.  Authenticated via gateway-control-key
/// or admin-key (same auth pattern as `/cache/flush`).
async fn cq_evaluate_test(
    state: State<GatewayState>,
    req: AxumRequest,
) -> Response {
    let connect_info = req.extensions().get::<ConnectInfo<SocketAddr>>().cloned();
    let headers = req.headers().clone();
    let xff = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
    let source_ip = resolve_source_ip(
        connect_info.map(|c| c.0),
        xff.as_deref(),
        state.trusted_proxy_depth,
        &state.trusted_proxy_ips,
    );

    let (granted, _key_prefix) = check_gateway_key(&headers, &state.policy_store.gateway_key_cache)
        .map(|prefix| (true, prefix.clone()))
        .or_else(|| check_admin_key(&headers, &state.policy_store.admin_key_cache).map(|prefix| (true, prefix.clone())))
        .unwrap_or((false, String::new()));

    if !granted {
        gw_warn!("[cq_evaluate_test] 401 UNAUTHORIZED — no valid gateway or admin key ip={}", source_ip);
        return admin_key_required("Gateway control key required to access /content-quality/evaluate-test");
    }

    let body_bytes = axum::body::to_bytes(req.into_body(), state.body_limit_bytes).await.unwrap_or_default();
    let req_json: serde_json::Value = match serde_json::from_slice(&body_bytes) {
        Ok(v) => v,
        Err(_) => {
            return json_response(StatusCode::BAD_REQUEST, r#"{"error":"Invalid JSON body"}"#);
        }
    };

    let context = req_json.get("context").and_then(|v| v.as_str()).unwrap_or("");
    let response = req_json.get("response").and_then(|v| v.as_str()).unwrap_or("");

    if context.is_empty() || response.is_empty() {
        return json_response(
            StatusCode::BAD_REQUEST,
            r#"{"error":"Both \"context\" and \"response\" fields are required and must be non-empty"}"#,
        );
    }

    let request_id = format!("cqt_{}", rand::random::<u64>());
    let start = std::time::Instant::now();

    let (groundedness, relevance, hallucination, reason) =
        cq_scan_handler::evaluate_for_control(
            &state.client,
            &state.policy_store,
            &state.log_writer,
            &request_id,
            context,
            response,
        ).await;

    let elapsed = start.elapsed().as_millis() as i64;

    let body = serde_json::json!({
        "object": "firewall.cq_evaluate_test",
        "request_id": request_id,
        "groundedness": groundedness,
        "relevance": relevance,
        "hallucination": hallucination,
        "reason": reason,
        "duration_ms": elapsed,
    });

    let mut resp = Response::new(body.to_string().into());
    *resp.status_mut() = StatusCode::OK;
    resp.headers_mut().insert("content-type", "application/json".parse().unwrap());
    resp
}

// ── Entry point ───────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    let _telemetry = tools::telemetry::init();

    // Hard-fail when no encryption secret is configured.
    // Provider API keys are encrypted at rest using PLATFORM_KEY_SECRET.
    // Without it, the gateway would silently store keys as plaintext, which is a security
    // vulnerability. Local providers (Ollama, LM Studio, etc.) that never store API keys in
    // the DB are not affected by this requirement.
    let platform_key = std::env::var("PLATFORM_KEY_SECRET");
    match &platform_key {
        Err(_) => {
            panic!("[startup] PLATFORM_KEY_SECRET is not set — refusing to boot without encryption key. Set PLATFORM_KEY_SECRET to a strong secret (≥32 characters) in the environment. If you use only local providers that store no API keys, you may still set PLATFORM_KEY_SECRET to any non-empty value.");
        }
        Ok(s) if s.is_empty() => {
            panic!("[startup] PLATFORM_KEY_SECRET is set but empty — refusing to boot without encryption key.");
        }
        Ok(s) if s.len() < 32 => {
            panic!("[startup] PLATFORM_KEY_SECRET is only {} chars (≥32 recommended). Refusing to boot with a weak encryption key. Set PLATFORM_KEY_SECRET to a secret of at least 32 characters.", s.len());
        }
        _ => {}
    }

    // GATEWAY_INSTANCE_ID is required: it scopes control-key auth (gateway_api_keys)
    // and attributes log rows. Two instances sharing the same ID (or both falling back
    // to "default") silently break reload-key auth and make logs/metrics ambiguous.
    let gateway_instance_id = std::env::var("GATEWAY_INSTANCE_ID")
        .unwrap_or_default();
    if gateway_instance_id.is_empty() {
        panic!(
            "[startup] GATEWAY_INSTANCE_ID is not set — refusing to boot. \
             Each gateway instance MUST have a unique GATEWAY_INSTANCE_ID to scope \
             control keys and attribute log rows. Set GATEWAY_INSTANCE_ID to a unique \
             value (e.g. hostname, region, or deployment-group ID) in the environment."
        );
    }

    let trusted_proxy_depth: usize = std::env::var("TRUSTED_PROXY_DEPTH")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    let trusted_proxy_ips: Vec<IpNet> = std::env::var("TRUSTED_PROXY_IPS")
        .ok()
        .filter(|s| !s.is_empty())
        .map(|s| {
            s.split(',')
                .map(|part| part.trim().parse::<IpNet>())
                .filter_map(Result::ok)
                .collect()
        })
        .unwrap_or_default();

    if trusted_proxy_depth > 0 && trusted_proxy_ips.is_empty() {
        tracing::warn!(
            "[startup] trusted_proxy_depth={} but TRUSTED_PROXY_IPS is empty — XFF will be ignored. \
             Set TRUSTED_PROXY_IPS to the IP/CIDR of your reverse proxy to enable XFF trust.",
            trusted_proxy_depth
        );
    }

    let scan_fail_closed: bool = std::env::var("SCAN_FAIL_CLOSED")
        .map(|v| v.eq_ignore_ascii_case("true") || v == "1")
        .unwrap_or(true);

    let preauth_rpm: u32 = std::env::var("PREAUTH_RATE_LIMIT_RPM")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(30);

    let response_cache_enabled: bool = std::env::var("RESPONSE_CACHE_ENABLED")
        .map(|v| v.eq_ignore_ascii_case("true") || v == "1")
        .unwrap_or(false);

    let response_cache_max_ttl_seconds: u64 = std::env::var("RESPONSE_CACHE_MAX_TTL_SECONDS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(900);

    let response_cache_default_ttl_seconds: u64 = std::env::var("RESPONSE_CACHE_DEFAULT_TTL_SECONDS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(300);

    let response_cache_cleanup_interval_seconds: u64 = std::env::var("RESPONSE_CACHE_CLEANUP_INTERVAL_SECONDS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(120);

    let response_cache_lookup_timeout_ms: u64 = std::env::var("RESPONSE_CACHE_LOOKUP_TIMEOUT_MS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(50);

    let request_timeout_secs: u64 = std::env::var("GATEWAY_REQUEST_TIMEOUT_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(300);

    let log_writer     = LogWriter::from_env();
    let quota_tracker  = QuotaTracker::new(log_writer.pool.clone());
    let provider_meter = ProviderMeter::new(log_writer.pool.clone());
    let log_writer     = log_writer.with_quota_tracker(quota_tracker.clone());
    let rate_limiter   = RateLimiter::from_env();
    let preauth_rate_limiter = RateLimiter::new(preauth_rpm, 60);
    let (policy_store, policy_pool) = DetectorStore::load_from_env().await;
    let log_writer = log_writer.with_data_pool(policy_pool.clone());

    // Response cache store: entirely `None` (L1 + L2) when the env kill switch is off,
    // not just the L2 pool — otherwise the in-memory L1 cache would keep working even
    // with RESPONSE_CACHE_ENABLED=false, contradicting the documented master switch.
    let response_cache_store = if response_cache_enabled {
        Some(ResponseCacheStore::new(
            Some(log_writer.pool.as_ref().clone()),
            response_cache_max_ttl_seconds,
            response_cache_default_ttl_seconds,
            response_cache_lookup_timeout_ms,
            10_000,
        ))
    } else {
        None
    };

    // Spawn periodic cleanup of stale rate limiter entries (1 hour TTL).
    rate_limiter.clone().spawn_cleanup_task();
    preauth_rate_limiter.clone().spawn_cleanup_task();

    DetectorStore::spawn_refresh(policy_store.clone(), policy_pool.clone());
    DetectorStore::spawn_auth_refresh(policy_store.clone(), policy_pool.clone());
    DetectorStore::spawn_provider_refresh(policy_store.clone(), policy_pool.clone());
    DetectorStore::spawn_acl_dns_refresh(policy_store.clone());
    quota_tracker.clone().spawn_reconcile();
    provider_meter.clone().spawn_reconcile();

    // Spawn periodic cleanup of expired response cache entries.
    if let Some(ref cache_store) = response_cache_store {
        let store = cache_store.clone();
        let interval = std::time::Duration::from_secs(response_cache_cleanup_interval_seconds);
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(interval);
            ticker.tick().await;
            loop {
                ticker.tick().await;
                store.cleanup_expired().await;
                if let Some(m) = crate::tools::telemetry::METRICS.get() {
                    m.cache_l1_size.set(store.l1_size() as f64);
                }
            }
        });
    }

    let auth_service = AuthService::new(policy_store.api_key_cache.clone());
    // admin_key_cache lives in policy_store — accessible via GatewayState.policy_store

    {
        let cl   = policy_store.classifier_provider.read().unwrap_or_else(|e| e.into_inner());
        let pc   = policy_store.providers_by_id.read().unwrap_or_else(|e| e.into_inner());
        let thr  = *policy_store.classifier_threshold.read().unwrap_or_else(|e| e.into_inner());
        let eps  = policy_store.embedding_providers.read().unwrap_or_else(|e| e.into_inner());
        let ethr = *policy_store.embedding_threshold.read().unwrap_or_else(|e| e.into_inner());
        gw_info!("[startup] GatewayEngine listening on 0.0.0.0:8082");
        gw_info!("[startup] instance_id=\"{}\"", gateway_instance_id);
        let trusted_proxy_msg = if trusted_proxy_ips.is_empty() { "none (XFF ignored)".to_string() } else { format!("{} proxies", trusted_proxy_ips.len()) };
        gw_info!("[startup] trusted_proxy={} depth={} scan_fail_closed={} preauth_rpm={}", trusted_proxy_msg, trusted_proxy_depth, scan_fail_closed, preauth_rpm);
        gw_info!("[startup] AI providers loaded: {}", pc.len());
        match cl.as_ref() {
            Some(p) => gw_info!("[startup] Classifier: {} @ {} (model: {}) threshold={:.0}%",
                p.name, p.endpoint, p.model.as_deref().unwrap_or("default"), thr * 100.0),
            None    => gw_warn!("[startup] Classifier not configured — LLM classification disabled"),
        }
        if eps.is_empty() {
            gw_warn!("[startup] Embedding providers not configured — semantic scan disabled");
        } else {
            gw_info!("[startup] Embedding provider: {} @ {} threshold={:.0}%",
                eps[0].name, eps[0].endpoint, ethr * 100.0);
        }
        gw_info!("[startup] Upstream routing: per-app provider chain (primary/backup1/backup2)");
    }

    // Tuned connection pool — shared across all concurrent requests.
    // pool_max_idle_per_host: keep enough warm connections for burst traffic.
    // tcp_keepalive: recycle idle connections before NAT/firewall drops them.
    let http_client = Client::builder()
        .pool_max_idle_per_host(64)
        .tcp_keepalive(std::time::Duration::from_secs(90))
        .pool_idle_timeout(std::time::Duration::from_secs(120))
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
        .expect("Failed to build HTTP client");

    let body_limit: usize = std::env::var("GATEWAY_BODY_LIMIT_MB")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or_else(|| {
            tracing::warn!("[startup] GATEWAY_BODY_LIMIT_MB not set or invalid — defaulting to 8 MB");
            8
        });
    let body_limit_bytes = body_limit * 1024 * 1024;

    let state = GatewayState {
        client: Arc::new(http_client),
        log_writer,
        policy_store,
        auth_service,
        rate_limiter,
        preauth_rate_limiter,
        reload_rate_limiter: ReloadRateLimiter::new(),
        quota_tracker,
        provider_meter,
        db_pool: policy_pool.clone(),
        body_limit_bytes,
        trusted_proxy_depth,
        trusted_proxy_ips,
        scan_fail_closed,
        gateway_instance_id,
        response_cache_store,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/v1/chat/completions", post(chat_completion))
        .route("/v1/completions", post(completions))
        .route("/v1/messages", post(anthropic_messages))
        .route("/v1/responses", post(openai_responses))
        .route("/v1/embeddings", post(embeddings))
        .route("/v1/moderations", post(moderations))
        .route("/v1/models", get(list_models))
        .route("/v1/test/upstream", post(test_upstream))
        .route("/v1/test/classification", post(test_classification))
        .route("/v1/scan", post(scan))
        .route("/v1/cq_scan", post(cq_scan))
        .route("/version", get(version))
        .route("/v1/models/:model", get(model_detail))
        .route("/health", get(health))
        .route("/reload", post(reload))
        .route("/cache/flush", post(cache_flush))
        .route("/content-quality/evaluate-test", post(cq_evaluate_test))
        .route("/metrics", get(metrics_handler))
        .route("/id", get(gateway_id_handler))
        .fallback(not_found)
        .layer(RequestBodyLimitLayer::new(body_limit_bytes))
        .layer(cors)
        .layer(TimeoutLayer::with_status_code(StatusCode::GATEWAY_TIMEOUT, Duration::from_secs(request_timeout_secs)))
        .with_state(state)
        .into_make_service_with_connect_info::<SocketAddr>();

    let addr: SocketAddr = "0.0.0.0:8082".parse().unwrap();
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();

    gw_info!("[startup] ready — accepting connections");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap();

    gw_info!("[shutdown] all connections drained — exiting");
}

/// Extract text from a passthrough request body for security scanning.
/// Supports JSON bodies (prompt, input, text, messages fields) and multipart.
fn extract_passthrough_text(body_bytes: &[u8], headers: &axum::http::HeaderMap) -> String {
    let ct = headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if ct.contains("multipart/form-data") {
        let body_str = String::from_utf8_lossy(body_bytes);
        return crate::content::translation::extract_multipart_text(&body_str);
    }

    if ct.contains("application/json")
        && let Ok(json) = serde_json::from_slice::<serde_json::Value>(body_bytes)
    {
        for key in &["prompt", "input", "text"] {
            if let Some(s) = json.get(key).and_then(|v| v.as_str())
                && !s.is_empty()
            {
                return s.to_string();
            }
        }
        if let Some(messages) = json.get("messages").and_then(|v| v.as_array()) {
            let parts: Vec<&str> = messages
                .iter()
                .filter_map(|m| m.get("content").and_then(|c| c.as_str()))
                .collect();
            return parts.join(" ");
        }
    }

    // Try JSON parsing regardless of content-type (some clients omit it)
    if let Ok(json) = serde_json::from_slice::<serde_json::Value>(body_bytes) {
        for key in &["prompt", "input", "text"] {
            if let Some(s) = json.get(key).and_then(|v| v.as_str())
                && !s.is_empty()
            {
                return s.to_string();
            }
        }
    }

    String::new()
}

/// Catch-all fallback: forward known upstream media endpoints verbatim (P4).
/// Unknown paths still return 404.
async fn not_found(
    state: State<GatewayState>,
    req: AxumRequest,
) -> Response {
    let path   = req.uri().path().to_string();
    let method = req.method().to_string();

    // Layer 0 — Network ACL (before auth)
    let connect_info = req.extensions().get::<ConnectInfo<SocketAddr>>().cloned();
    let xff = req.headers()
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let user_agent = req.headers()
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let source_ip = resolve_source_ip(
        connect_info.map(|c| c.0),
        xff.as_deref(),
        state.trusted_proxy_depth,
        &state.trusted_proxy_ips,
    );
    {
        let mode    = state.policy_store.acl_mode.read().unwrap_or_else(|e| e.into_inner()).clone();
        let entries = state.policy_store.acl_entries.read().unwrap_or_else(|e| e.into_inner()).clone();
        if is_ip_blocked(&source_ip, &mode, &entries) {
            let request_id = format!("u404_{}", rand::random::<u64>());
            state.log_writer.log_blocked(
                &request_id,
                "acl", "", "unknown", &method, &path, &source_ip,
                "N/A", 403,
                "Access denied by network ACL",
                None, None,
                user_agent.as_deref(),
            );
            gw_warn!("[acl] 403 BLOCKED ip={} method={} path={}", source_ip, method, path);
            return build_firewall_error("Access denied by network ACL", &request_id, path.contains("/v1/messages"), StatusCode::FORBIDDEN);
        }
    }

    // Check if this is a known passthrough path (files, audio, images).
    if !is_passthrough_path(&path) {
        gw_warn!("[route] 404 UNKNOWN_PATH method={} path={}", method, path);
        let request_id = format!("u404_{}", rand::random::<u64>());
        state.log_writer.log_blocked(
            &request_id, "unknown", "", "unknown", &method, &path, &source_ip,
            "N/A", 404,
            &format!("Unknown path: {} {}", method, path),
            None, None,
            user_agent.as_deref(),
        );
        let body = serde_json::json!({
            "error": { "message": format!("Unknown path: {} {}", method, path), "type": "not_found", "code": "unknown_path" }
        });
        let mut resp = Response::new(serde_json::to_string(&body).unwrap_or_default().into());
        *resp.status_mut() = StatusCode::NOT_FOUND;
        resp.headers_mut().insert("content-type", "application/json".parse().unwrap());
        return resp;
    }

    // Auth — in-memory cache lookup
    let headers_clone = req.headers().clone();
    let auth_result = state.auth_service.authenticate(req.headers());
    let auth = match auth_result {
        Ok(a) => a,
        Err(AuthError::MissingKey) => {
            gw_warn!("[route] 401 MISSING_KEY path={}", path);
            let resp = json_response(
                StatusCode::UNAUTHORIZED,
                r#"{"error":"API key required. Provide Authorization: Bearer <key>"}"#,
            );
            return resp;
        }
        Err(AuthError::InvalidKey) => {
            gw_warn!("[route] 401 INVALID_KEY path={}", path);
            let resp = json_response(
                StatusCode::UNAUTHORIZED,
                r#"{"error":"Invalid or inactive API key"}"#,
            );
            return resp;
        }
    };

    // Resolve provider chain
    let providers = auth.resolve_provider_chain(&state.policy_store);

    if providers.is_empty() {
        gw_warn!("[route] 503 NO_PROVIDER passthrough path={} app=\"{}\"", path, auth.app_name);
        let body = serde_json::json!({
            "error": { "message": "No upstream provider configured for this app", "type": "service_unavailable", "code": "no_provider" }
        });
        let mut resp = Response::new(serde_json::to_string(&body).unwrap_or_default().into());
        *resp.status_mut() = StatusCode::SERVICE_UNAVAILABLE;
        resp.headers_mut().insert("content-type", "application/json".parse().unwrap());
        return resp;
    }

    // Read request body for forwarding
    let (_parts, body) = req.into_parts();
    let body_bytes = match axum::body::to_bytes(body, state.body_limit_bytes).await {
        Ok(b) => b,
        Err(e) => {
            gw_warn!("[route] passthrough body read failed path={} error={}", path, e);
            let body = serde_json::json!({
                "error": { "message": format!("Body read failed: {}", e), "type": "bad_request" }
            });
            let mut resp = Response::new(serde_json::to_string(&body).unwrap_or_default().into());
            *resp.status_mut() = StatusCode::BAD_REQUEST;
            resp.headers_mut().insert("content-type", "application/json".parse().unwrap());
            return resp;
        }
    };

    // Scan passthrough body text for threats before forwarding
    // Uses full keyword/regex scanner (handles all modes: block, redact, flag, throttle)
    let scan_text = extract_passthrough_text(&body_bytes, &headers_clone);
    if !scan_text.is_empty() {
        let passthrough_request_id = format!("pt_{}", rand::random::<u64>());
        let detectors_guard = state.policy_store.detectors
            .read().unwrap_or_else(|e| e.into_inner());
        let detectors: Vec<&policy::DetectorConfig> = detectors_guard
            .iter()
            .filter(|d| d.scanning_scope == "input" || d.scanning_scope == "both")
            .collect();
        match scan_keyword_regex(&detectors, &scan_text) {
            LayerResult::Hit { detector, mode, framework_id, reason, .. } if mode == "block" => {
                gw_warn!("[passthrough_scan] {} BLOCKED detector=\"{}\" path={} app=\"{}\" reason={:?}",
                    passthrough_request_id, detector, path, auth.app_name, reason);
                state.log_writer.log_entry(LogEntry {
                    request_id: passthrough_request_id.clone(),
                    app_id: auth.app_id.clone(),
                    app_name: auth.app_name.clone(),
                    model: "passthrough".to_string(),
                    method: method.clone(),
                    path: path.clone(),
                    source_ip: source_ip.clone(),
                    app_api_key: auth.api_key_prefix.clone(),
                    status_code: 403,
                    flagged: true,
                    detector: Some(detector.clone()),
                    confidence: None,
                    action: Some("blocked".to_string()),
                    threat_title: reason.clone(),
                    framework_id: Some(framework_id),
                    user_prompt: Some(scan_text.clone()),
                    user_agent: user_agent.clone(),
                    raw_input_payload: Some(String::from_utf8_lossy(&body_bytes).to_string()),
                    ..Default::default()
                });
                return build_firewall_error(
                    &reason.unwrap_or_default(),
                    &passthrough_request_id,
                    path.contains("/v1/messages"),
                    StatusCode::FORBIDDEN,
                );
            }
            LayerResult::Hit { detector, mode, .. } => {
                gw_warn!("[passthrough_scan] {} {} detector=\"{}\" path={} app=\"{}\" (non-block, passthrough continues)",
                    passthrough_request_id, mode, detector, path, auth.app_name);
            }
            LayerResult::Safe => {}
        }
    }

    // Forward to first available provider
    let provider = &providers[0];
    let adapter = adapter_for_provider(provider);
    let request_id = format!("u404_{}", rand::random::<u64>());

    // Request-time DNS re-validation to prevent DNS-rebinding SSRF.
    if !policy::endpoint_validation::revalidate_endpoint(&provider.endpoint).await {
        gw_warn!("[passthrough] SSRF_CHECK provider=\"{}\" endpoint=\"{}\" — endpoint failed DNS re-validation", provider.name, provider.endpoint);
        let mut resp = Response::new(
            r#"{"error":"upstream provider endpoint failed security validation"}"#.into()
        );
        *resp.status_mut() = StatusCode::BAD_GATEWAY;
        resp.headers_mut().insert("content-type", "application/json".parse().unwrap());
        return resp;
    }

    // Vendor-host binding: the endpoint host must match the vendor's domain.
    if !policy::endpoint_validation::verify_vendor_host(&provider.endpoint, &provider.vendor) {
        gw_warn!("[passthrough] VENDOR_HOST_MISMATCH provider=\"{}\" vendor=\"{}\" endpoint=\"{}\" — endpoint host does not match vendor",
            provider.name, provider.vendor, provider.endpoint);
        let mut resp = Response::new(
            r#"{"error":"upstream provider endpoint does not match declared vendor"}"#.into()
        );
        *resp.status_mut() = StatusCode::BAD_GATEWAY;
        resp.headers_mut().insert("content-type", "application/json".parse().unwrap());
        return resp;
    }

    match passthrough_forward(
        &state.client,
        provider,
        adapter.as_ref(),
        body_bytes,
        &path,
        &headers_clone,
    ).await {
        Ok(resp) => {
            let resp_headers = resp.headers().clone();
            let status = resp.status();
            let body_bytes = match resp.bytes().await {
                Ok(b) => b,
                Err(e) => {
                    gw_warn!("[route] passthrough read failed path={} error={}", path, e);
                    return json_response(
                        StatusCode::BAD_GATEWAY,
                        &format!(r#"{{"error":"Response read failed: {}"}}"#, e),
                    );
                }
            };

            // Output scanning for passthrough responses (text/JSON only)
            let mut output_scan_flagged = false;
            let mut output_scan_detector: Option<String> = None;
            let mut output_scan_framework_id: Option<String> = None;
            let mut output_scan_confidence: Option<f32> = None;
            let mut output_blocked = false;
            let response_ct = resp_headers
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");
            if response_ct.contains("application/json") || response_ct.contains("text/") {
                let response_text = extract_passthrough_text(&body_bytes, &resp_headers);
                if !response_text.is_empty() {
                    let scan_result = scan_output_impl(&state.policy_store, &request_id, &auth.app_id, &auth.app_name, &response_text);
                    output_scan_flagged = scan_result.flagged;
                    output_scan_detector = scan_result.detector_name;
                    output_scan_framework_id = scan_result.category;
                    output_scan_confidence = Some(scan_result.confidence);
                    if scan_result.blocked {
                        output_blocked = true;
                        gw_warn!("[passthrough_output_scan] {} BLOCKED detector=\"{}\" path={} app=\"{}\"",
                            request_id, output_scan_detector.as_deref().unwrap_or("unknown"), path, auth.app_name);
                    } else if scan_result.flagged {
                        gw_warn!("[passthrough_output_scan] {} FLAGGED detector=\"{}\" path={} app=\"{}\"",
                            request_id, output_scan_detector.as_deref().unwrap_or("unknown"), path, auth.app_name);
                    }
                }
            }

            if output_blocked {
                state.log_writer.log_entry(LogEntry {
                    request_id: request_id.clone(),
                    app_id: auth.app_id.clone(),
                    app_name: auth.app_name.clone(),
                    model: "passthrough".to_string(),
                    method: method.clone(),
                    path: path.clone(),
                    source_ip: source_ip.clone(),
                    app_api_key: auth.api_key_prefix.clone(),
                    status_code: 403,
                    flagged: true,
                    detector: output_scan_detector.clone(),
                    confidence: output_scan_confidence,
                    action: Some("blocked_output".to_string()),
                    threat_title: Some(format!("Response blocked by output scanning: detector '{}'",
                        output_scan_detector.as_deref().unwrap_or("unknown"))),
                    framework_id: output_scan_framework_id.clone(),
                    upstream_provider_id: Some(provider.id.clone()),
                    upstream_provider_name: Some(provider.name.clone()),
                    output_scan_flagged: true,
                    output_scan_framework_id: output_scan_framework_id.clone(),
                    output_scan_confidence,
                    output_scan_detector: output_scan_detector.clone(),
                    user_agent: user_agent.clone(),
                    raw_output_payload: Some(String::from_utf8_lossy(&body_bytes).to_string()),
                    ..Default::default()
                });
                return build_firewall_error(
                    &format!("Response blocked by output scanning policy (detector: {})",
                        output_scan_detector.as_deref().unwrap_or("unknown")),
                    &request_id,
                    path.contains("/v1/messages"),
                    StatusCode::FORBIDDEN,
                );
            }

            // Log the passthrough request
            state.log_writer.log_entry(LogEntry {
                request_id: request_id.clone(),
                app_id: auth.app_id.clone(),
                app_name: auth.app_name.clone(),
                model: "passthrough".to_string(),
                method: method.clone(),
                path: path.clone(),
                source_ip: source_ip.clone(),
                app_api_key: auth.api_key_prefix.clone(),
                status_code: status.as_u16() as i16,
                action: Some("passthrough".to_string()),
                threat_title: Some(format!("Forwarded to {} {}", provider.name, path)),
                upstream_provider_id: Some(provider.id.clone()),
                upstream_provider_name: Some(provider.name.clone()),
                output_scan_flagged,
                output_scan_framework_id: output_scan_framework_id.clone(),
                output_scan_confidence,
                output_scan_detector: output_scan_detector.clone(),
                flagged: output_scan_flagged,
                user_agent: user_agent.clone(),
                ..Default::default()
            });

        // Return the upstream response with relayed headers
            let mut resp = Response::new(axum::body::Body::from(body_bytes));
            *resp.status_mut() = status;
            relay_response_headers(&resp_headers, &mut resp);
            resp
        }
        Err(e) => {
            gw_warn!("[route] passthrough failed path={} provider=\"{}\" error={}", path, provider.name, e);
            let body = serde_json::json!({
                "error": { "message": format!("Upstream provider {} failed: {}", provider.name, e), "type": "bad_gateway", "code": "upstream_error" }
            });
            let mut resp = Response::new(serde_json::to_string(&body).unwrap_or_default().into());
            *resp.status_mut() = StatusCode::BAD_GATEWAY;
            resp.headers_mut().insert("content-type", "application/json".parse().unwrap());
            resp
        }
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let sigterm = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let sigterm = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c  => { gw_info!("[shutdown] SIGINT received — draining connections...") },
        _ = sigterm => { gw_info!("[shutdown] SIGTERM received — draining connections...") },
    }
}
