//! Handler for POST /v1/moderations — OpenAI moderation endpoint.
//!
//! Runs the security classification pipeline on the input text and returns
//! results in OpenAI moderation format with violation categories and scores.

use axum::{
    extract::{ConnectInfo, Request as AxumRequest, State},
    http::StatusCode,
    response::Response,
};
use serde_json::Value;
use std::net::SocketAddr;

use crate::tools::auth::AuthError;
use crate::tools::acl_check::{is_ip_blocked, resolve_source_ip};
use crate::tools::json_response::json_response;
use crate::pipeline_types::AppError;
use crate::tools::log_writer::LogEntry;
use crate::tools::rate_limiter::RateLimitResult;
use crate::request_handler::helpers::build_firewall_error;

/// Map a detector framework_id or classifier framework_id to OpenAI moderation categories.
fn map_framework_to_categories(framework_id: &str, confidence: f32) -> ModerationCategories {
    let fid = framework_id.to_lowercase();
    ModerationCategories {
        harassment:         fid.contains("llm01") || fid.contains("jailbreak") || fid.contains("prompt_injection"),
        harassment_threatening: fid.contains("llm01"),
        hate:               fid.contains("llm02") || fid.contains("hate") || fid.contains("bias"),
        hate_threatening:   fid.contains("threatening") && fid.contains("hate"),
        self_harm:          fid.contains("self_harm") || fid.contains("self-harm") || fid.contains("suicide"),
        self_harm_intent:   fid.contains("self_harm") && !fid.contains("instructions"),
        self_harm_instructions: fid.contains("instructions") || fid.contains("self_harm_instructions"),
        sexual:             fid.contains("llm06") || fid.contains("sexual"),
        sexual_minors:      fid.contains("minors") || fid.contains("child"),
        violence:           fid.contains("llm07") || fid.contains("violence") || fid.contains("violent"),
        violence_graphic:   fid.contains("graphic") || (fid.contains("violence") && confidence > 0.8),
    }
}

struct ModerationCategories {
    harassment:             bool,
    harassment_threatening: bool,
    hate:                   bool,
    hate_threatening:       bool,
    self_harm:              bool,
    self_harm_intent:       bool,
    self_harm_instructions: bool,
    sexual:                 bool,
    sexual_minors:          bool,
    violence:               bool,
    violence_graphic:       bool,
}

impl ModerationCategories {
    fn to_category_json(&self) -> Value {
        serde_json::json!({
            "harassment":               self.harassment,
            "harassment/threatening":   self.harassment_threatening,
            "hate":                     self.hate,
            "hate/threatening":         self.hate_threatening,
            "self-harm":                self.self_harm,
            "self-harm/intent":         self.self_harm_intent,
            "self-harm/instructions":   self.self_harm_instructions,
            "sexual":                   self.sexual,
            "sexual/minors":            self.sexual_minors,
            "violence":                 self.violence,
            "violence/graphic":         self.violence_graphic,
        })
    }

    fn to_score_json(&self, confidence: f32) -> Value {
        let cat = self.to_category_json();
        if let Value::Object(map) = cat {
            let mut scores = serde_json::Map::new();
            for (key, flagged) in map.iter() {
                let score = if *flagged == Value::Bool(true) {
                    confidence.clamp(0.01, 1.0)
                } else {
                    0.0
                };
                scores.insert(key.clone(), Value::Number(serde_json::Number::from_f64(score as f64).unwrap_or(serde_json::Number::from(0))));
            }
            Value::Object(scores)
        } else {
            serde_json::json!({})
        }
    }
}

fn none_categories() -> ModerationCategories {
    ModerationCategories {
        harassment: false, harassment_threatening: false,
        hate: false, hate_threatening: false,
        self_harm: false, self_harm_intent: false, self_harm_instructions: false,
        sexual: false, sexual_minors: false,
        violence: false, violence_graphic: false,
    }
}

/// Run keyword/regex detection on a single prompt text.
fn keyword_check(prompt: &str, policy_store: &crate::policy::DetectorStore) -> Option<(String, f32)> {
    let detectors = policy_store.detectors.read().unwrap_or_else(|e| e.into_inner()).clone();
    let active: Vec<&crate::policy::DetectorConfig> = detectors
        .iter()
        .filter(|d| d.scanning_scope == "input" || d.scanning_scope == "both")
        .filter(|d| d.mode == "block" || d.mode == "flag")
        .collect();

    for d in active {
        for keyword in &d.keywords {
            if prompt.to_lowercase().contains(&keyword.to_lowercase()) {
                return Some((d.framework_id.clone(), 0.9));
            }
        }
        for (_, re) in &d.compiled_patterns {
            if let Some(re) = re
                && re.is_match(prompt)
            {
                return Some((d.framework_id.clone(), 0.95));
            }
        }
    }
    None
}

/// Build a single moderation result entry.
fn build_result(
    flagged: bool,
    framework_id: Option<&str>,
    confidence: f32,
) -> Value {
    let cats = if flagged {
        map_framework_to_categories(framework_id.unwrap_or("OTHER"), confidence)
    } else {
        none_categories()
    };
    serde_json::json!({
        "flagged":         flagged,
        "categories":      cats.to_category_json(),
        "category_scores": cats.to_score_json(confidence),
    })
}

#[tracing::instrument(skip_all, fields(request_id, app_id))]
pub async fn handle_moderations_request(
    state: State<crate::GatewayState>,
    req: AxumRequest,
    connect_info: Option<ConnectInfo<SocketAddr>>,
) -> Result<Response, AppError> {
    let policy_store = &state.policy_store;
    let log_writer = &state.log_writer;

    let xff_header = req
        .headers()
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let source_ip = resolve_source_ip(
        connect_info.map(|ci| ci.0),
        xff_header.as_deref(),
        state.trusted_proxy_depth,
        &state.trusted_proxy_ips,
    );

    let request_id = format!("mod_{}", rand::random::<u64>());
    tracing::Span::current().record("request_id", request_id.as_str());

    let (parts, body) = req.into_parts();
    let method = parts.method.to_string();
    let path = parts.uri.path().to_string();
    let headers = parts.headers;
    let user_agent = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    // Layer 0 — Network ACL
    {
        let mode = policy_store.acl_mode.read().unwrap_or_else(|e| e.into_inner()).clone();
        let entries = policy_store.acl_entries.read().unwrap_or_else(|e| e.into_inner()).clone();
        if is_ip_blocked(&source_ip, &mode, &entries) {
            tracing::warn!("[acl] 403 BLOCKED ip={} path={}", source_ip, path);
            log_writer.log_blocked(
                &request_id, "acl", "", "unknown", &method, &path, &source_ip,
                "N/A", 403,
                "Access denied by network ACL",
                None, None,
                user_agent.as_deref(),
            );
            return Ok(build_firewall_error(
                "Access denied by network ACL", &request_id, false, StatusCode::FORBIDDEN,
            ));
        }
    }

    // Pre-auth rate limit
    if let RateLimitResult::Limited { retry_after_secs } =
        state.preauth_rate_limiter.check(&source_ip)
    {
        if let Some(m) = crate::tools::telemetry::METRICS.get() {
            m.preauth_ratelimit_hits_total.inc();
        }
        tracing::warn!(
            "[preauth_rate] 429 RATE_LIMITED ip={} retry_after={}s",
            source_ip,
            retry_after_secs
        );
        let mut resp = json_response(
            StatusCode::TOO_MANY_REQUESTS,
            &format!(
                r#"{{"error":"Too many requests","retry_after":{}}}"#,
                retry_after_secs
            ),
        );
        resp.headers_mut()
            .insert("retry-after", retry_after_secs.to_string().parse().unwrap());
        return Ok(resp);
    }

    let body_bytes = axum::body::to_bytes(body, state.body_limit_bytes)
        .await
        .map_err(|e| {
            tracing::error!("[request] body read failed ip={} error={}", source_ip, e);
            AppError(format!("Body extract failed: {}", e))
        })?;

    let body_json: Value = serde_json::from_slice(&body_bytes).map_err(|e| {
        tracing::warn!("[request] invalid JSON ip={} error={}", source_ip, e);
        AppError(format!("Invalid JSON: {}", e))
    })?;

    let model = body_json
        .get("model")
        .and_then(|v| v.as_str())
        .unwrap_or("c6-guardrails-moderation");

    // Auth
    let auth_result = state.auth_service.authenticate(&headers);
    let auth = match auth_result {
        Ok(a) => a,
        Err(AuthError::MissingKey) => {
            tracing::warn!("[auth] 401 MISSING_KEY ip={}", source_ip);
            return Ok(json_response(
                StatusCode::UNAUTHORIZED,
                r#"{"error":"API key required. Provide Authorization: Bearer <key>"}"#,
            ));
        }
        Err(AuthError::InvalidKey) => {
            tracing::warn!("[auth] 401 INVALID_KEY ip={}", source_ip);
            return Ok(json_response(
                StatusCode::UNAUTHORIZED,
                r#"{"error":"Invalid or inactive API key"}"#,
            ));
        }
    };

    tracing::Span::current().record("app_id", auth.app_id.as_str());

    let app_id = &auth.app_id;
    let app_name = &auth.app_name;
    let api_key_prefix = &auth.api_key_prefix;

    // Rate limit
    match state.rate_limiter.check(app_name) {
        RateLimitResult::Allowed { .. } => {}
        RateLimitResult::Limited { retry_after_secs } => {
            if let Some(m) = crate::tools::telemetry::METRICS.get() {
                m.ratelimit_hits_total.with_label_values(&[app_name]).inc();
            }
            tracing::warn!(
                "[rate] 429 RATE_LIMITED app=\"{}\" ip={} retry_after={}s",
                app_name,
                source_ip,
                retry_after_secs
            );
            let mut resp = json_response(
                StatusCode::TOO_MANY_REQUESTS,
                &format!(
                    r#"{{"error":"Rate limit exceeded","retry_after":{}}}"#,
                    retry_after_secs
                ),
            );
            resp.headers_mut()
                .insert("retry-after", retry_after_secs.to_string().parse().unwrap());
            return Ok(resp);
        }
    }

    // Extract inputs array
    let inputs: Vec<String> = match body_json.get("input") {
        Some(Value::String(s)) => vec![s.clone()],
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect(),
        _ => {
            return Ok(json_response(
                StatusCode::BAD_REQUEST,
                r#"{"error":"Missing or invalid 'input' field"}"#,
            ));
        }
    };

    // Run classification on each input
    let client = &state.client;
    let classifier_available = policy_store
        .classifier_provider
        .read()
        .unwrap()
        .is_some();

    let classifier_provider = {
        policy_store.classifier_provider.read().unwrap_or_else(|e| e.into_inner()).clone()
    };
    // Per-app override (connected_apps.classifier_threshold / classifier_prompt);
    // null on the app falls back to the global classifier config.
    let classifier_threshold = auth.classifier_threshold
        .unwrap_or_else(|| *policy_store.classifier_threshold.read().unwrap_or_else(|e| e.into_inner()));
    let classifier_prompt = auth.classifier_prompt.clone()
        .unwrap_or_else(|| policy_store.classifier_system_prompt.read().unwrap_or_else(|e| e.into_inner()).clone());
    let _scan_fail_closed = state.scan_fail_closed;

    let mut results: Vec<Value> = Vec::new();

    for input_text in &inputs {
        if input_text.is_empty() {
            results.push(build_result(false, None, 0.0));
            continue;
        }

        // 1. Keyword/regex check (fast, always runs)
        if let Some((framework_id, kw_conf)) = keyword_check(input_text, policy_store) {
            results.push(build_result(true, Some(&framework_id), kw_conf.max(0.85)));
            continue;
        }

        // 2. Full classifier check (if available)
        if classifier_available {
            match crate::agents::classification::classify(
                client,
                input_text,
                classifier_provider.as_ref(),
                classifier_threshold,
                &classifier_prompt,
                log_writer,
                Some(&request_id),
                policy_store,
            )
            .await
            {
                Ok(cr) if cr.is_attack => {
                    let framework = if cr.framework_id.is_empty() {
                        "OTHER"
                    } else {
                        &cr.framework_id
                    };
                    results.push(build_result(true, Some(framework), cr.confidence));
                }
                _ => {
                    results.push(build_result(false, None, 0.0));
                }
            }
        } else {
            results.push(build_result(false, None, 0.0));
        }
    }

    // Log moderation request with audit data
    let overall_flagged = results.iter().any(|r| r.get("flagged").and_then(|f| f.as_bool()).unwrap_or(false));
    let mod_framework_id = results.iter().find_map(|r| {
        if r.get("flagged").and_then(|f| f.as_bool()).unwrap_or(false) {
            r.get("categories").and_then(|c| {
                c.as_object().and_then(|o| {
                    o.iter().find(|(_, v)| v.as_bool().unwrap_or(false)).map(|(k, _)| k.clone())
                })
            })
        } else {
            None
        }
    });
    let mod_response = serde_json::json!({
        "id": &request_id,
        "model": model,
        "results": &results,
    });
    let mod_response_str = mod_response.to_string();
    log_writer.log_entry(LogEntry {
        request_id: request_id.clone(),
        app_id: app_id.clone(),
        app_name: app_name.clone(),
        model: model.to_string(),
        method: method.clone(),
        path: path.clone(),
        source_ip: source_ip.clone(),
        app_api_key: api_key_prefix.clone(),
        status_code: 200,
        flagged: overall_flagged,
        framework_id: mod_framework_id.clone(),
        user_prompt: Some(inputs.join("\n")),
        response_body: Some(mod_response_str.clone()),
        user_agent: user_agent.clone(),
        ..Default::default()
    });

    let mut resp = Response::new(axum::body::Body::from(
        serde_json::to_vec(&mod_response).unwrap_or_default(),
    ));
    *resp.status_mut() = StatusCode::OK;
    resp.headers_mut()
        .insert("content-type", "application/json".parse().unwrap());
    Ok(resp)
}
