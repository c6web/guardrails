//! Plugin-agnostic caller for the active Content Quality Provider. Never
//! references a specific vendor (TruLens or otherwise) — only the
//! [`ContentQualityAdapter`] trait and [`ContentQualityScores`] output type.
//! Mirrors the shape of `agents::classification::classifier::llm_complete`,
//! but calls whichever quality-scoring backend is configured instead of a
//! chat-completion endpoint.

use reqwest::Client;

use crate::adapters::content_quality::{adapter_for, ContentQualityScores};
use crate::policy::DetectorStore;
use crate::tools::log_writer::LogWriter;

/// Run a content-quality scan against the active Content Quality Provider.
/// Fails open: returns `None` (never blocks the caller) when the provider is
/// unconfigured, the judge LLM is missing, or the call errors/times out.
pub async fn run_content_quality_scan(
    client:      &Client,
    policy_store: &DetectorStore,
    request_id:  &str,
    app_id:      &str,
    app_name:    &str,
    context:     &str,
    response:    &str,
    log_writer:  &LogWriter,
) -> Option<ContentQualityScores> {
    if response.trim().is_empty() {
        tracing::debug!("[content_quality] {} empty response — skipping scan", request_id);
        return None;
    }

    let cfg = policy_store.content_quality_provider_config.read().unwrap_or_else(|e| e.into_inner()).clone();

    if cfg.vendor == "builtin" {
        return super::builtin::run_builtin_scan(
            client, policy_store, request_id, app_id, app_name, context, response, log_writer,
        ).await;
    }

    if cfg.service_url.trim().is_empty() {
        tracing::debug!("[content_quality] {} no service_url configured — skipping scan", request_id);
        return None;
    }

    let judge_provider = policy_store.content_quality_judge_provider.read().unwrap_or_else(|e| e.into_inner()).clone();
    let Some(judge_provider) = judge_provider else {
        tracing::warn!("[content_quality] {} no judge LLM provider configured — skipping scan", request_id);
        return None;
    };

    // Request-time DNS re-validation to prevent DNS-rebinding SSRF, same precaution
    // llm_complete() applies to admin-configured provider endpoints.
    if !crate::policy::endpoint_validation::revalidate_endpoint(&cfg.service_url).await {
        tracing::warn!("[content_quality] {} service_url failed DNS re-validation (potential SSRF)", request_id);
        return None;
    }

    let adapter = adapter_for(&cfg);
    let metrics = ["groundedness", "relevance", "hallucination"];
    let url = format!("{}{}", cfg.service_url.trim_end_matches('/'), adapter.evaluate_path());
    let body = adapter.build_body(&cfg, context, response, &judge_provider, &metrics);
    let req_str = serde_json::to_string(&body).unwrap_or_default();

    let mut req = client.post(&url).body(serde_json::to_vec(&body).unwrap_or_default());
    for (name, value) in adapter.build_headers(&cfg) {
        req = req.header(name, value);
    }
    let ms = cfg.timeout_ms.clamp(5_000, 600_000);
    req = req.timeout(std::time::Duration::from_millis(ms));

    let call_start = std::time::Instant::now();
    let send_result = req.send().await;

    let resp = match send_result {
        Err(e) => {
            let elapsed = call_start.elapsed().as_millis() as i64;
            let err_str = if e.is_timeout() {
                format!("content quality evaluation timed out after {} ms", ms)
            } else {
                e.to_string()
            };
            tracing::warn!("[content_quality] {} request failed: {} — failing open", request_id, err_str);
            log_writer.log_provider_call(
                Some(request_id), "content_quality", "pipeline",
                Some(app_id), Some(app_name),
                Some(judge_provider.id.as_str()), Some(judge_provider.name.as_str()),
                Some(adapter.vendor()), judge_provider.model.as_deref(),
                Some(url.as_str()),
                Some(req_str.clone()), None,
                None, None, elapsed, None, false,
                Some(&err_str),
            );
            return None;
        }
        Ok(r) => r,
    };

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        let elapsed = call_start.elapsed().as_millis() as i64;
        tracing::warn!("[content_quality] {} service returned HTTP {} — failing open", request_id, status);
        log_writer.log_provider_call(
            Some(request_id), "content_quality", "pipeline",
            Some(app_id), Some(app_name),
            Some(judge_provider.id.as_str()), Some(judge_provider.name.as_str()),
            Some(adapter.vendor()), judge_provider.model.as_deref(),
            Some(url.as_str()),
            Some(req_str.clone()), Some(body_text.clone()),
            None, None, elapsed,
            Some(status.as_u16() as i16), false,
            Some(&format!("HTTP {}", status.as_u16())),
        );
        return None;
    }

    let resp_status = resp.status();
    let resp_bytes = match resp.bytes().await {
        Ok(b) => b,
        Err(e) => {
            let elapsed = call_start.elapsed().as_millis() as i64;
            tracing::warn!("[content_quality] {} failed to read response body: {} — failing open", request_id, e);
            log_writer.log_provider_call(
                Some(request_id), "content_quality", "pipeline",
                Some(app_id), Some(app_name),
                Some(judge_provider.id.as_str()), Some(judge_provider.name.as_str()),
                Some(adapter.vendor()), judge_provider.model.as_deref(),
                Some(url.as_str()),
                Some(req_str.clone()), None,
                None, None, elapsed,
                Some(resp_status.as_u16() as i16), false,
                Some(&format!("failed to read response body: {}", e)),
            );
            return None;
        }
    };
    let elapsed = call_start.elapsed().as_millis() as i64;

    let parsed: serde_json::Value = match serde_json::from_slice(&resp_bytes) {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!("[content_quality] {} invalid JSON response: {} — failing open", request_id, e);
            log_writer.log_provider_call(
                Some(request_id), "content_quality", "pipeline",
                Some(app_id), Some(app_name),
                Some(judge_provider.id.as_str()), Some(judge_provider.name.as_str()),
                Some(adapter.vendor()), judge_provider.model.as_deref(),
                Some(url.as_str()),
                Some(req_str.clone()), None,
                None, None, elapsed, Some(200), false,
                Some(&format!("invalid JSON: {}", e)),
            );
            return None;
        }
    };

    match adapter.parse_response(&parsed) {
        Ok(scores) => {
            log_writer.log_provider_call(
                Some(request_id), "content_quality", "pipeline",
                Some(app_id), Some(app_name),
                Some(judge_provider.id.as_str()), Some(judge_provider.name.as_str()),
                Some(adapter.vendor()), judge_provider.model.as_deref(),
                Some(url.as_str()),
                Some(req_str),
                serde_json::to_string(&parsed).ok(),
                None, None, elapsed,
                Some(200), true, None,
            );
            Some(scores)
        }
        Err(e) => {
            tracing::warn!("[content_quality] {} failed to parse scores: {} — failing open", request_id, e);
            log_writer.log_provider_call(
                Some(request_id), "content_quality", "pipeline",
                Some(app_id), Some(app_name),
                Some(judge_provider.id.as_str()), Some(judge_provider.name.as_str()),
                Some(adapter.vendor()), judge_provider.model.as_deref(),
                Some(url.as_str()),
                Some(req_str),
                serde_json::to_string(&parsed).ok(),
                None, None, elapsed, Some(200), false,
                Some(&e),
            );
            None
        }
    }
}
