//! Loads the **Content Quality Provider** singleton — the connection details for
//! whichever content-quality plugin backend is active (TruLens by default), plus
//! the judge LLM it uses internally. Mirrors `providers::load_classifier`'s shape:
//! a single-row config lookup joined to `ai_providers` for the judge LLM.

use super::{DetectorStore, ProviderConfig};
use sqlx::PgPool;

/// Connection details for the active Content Quality Provider plugin backend.
/// Passed to `adapters::content_quality::adapter_for()` (dispatch on `vendor`)
/// and into `ContentQualityAdapter::build_headers`/`build_body`.
#[derive(Clone, Debug, Default)]
pub(crate) struct ContentQualityProviderConfig {
    pub vendor:          String,
    pub service_url:     String,
    pub service_api_key: Option<String>,
    pub timeout_ms:      u64,
}

#[derive(sqlx::FromRow)]
struct ContentQualityProviderRow {
    vendor:          String,
    service_url:     Option<String>,
    service_api_key: Option<String>,
    timeout_ms:      i32,
}

#[derive(sqlx::FromRow)]
struct JudgeProviderRow {
    id:               String,
    name:             String,
    endpoint:         String,
    model:            Option<String>,
    api_key:          Option<String>,
    timeout_ms:       i32,
    vendor:           String,
    max_output_token: Option<i32>,
    max_input_token:  Option<i32>,
}

pub(super) async fn load_content_quality_provider(store: &DetectorStore, pool: &PgPool) {
    match sqlx::query_as::<_, ContentQualityProviderRow>(
        "SELECT vendor, service_url, service_api_key, timeout_ms FROM content_quality_provider_config WHERE id = 1"
    )
    .fetch_optional(pool)
    .await
    {
        Ok(Some(row)) => {
            let service_api_key = row.service_api_key.as_deref()
                .and_then(crate::crypto::decrypt_content_quality_service_key);
            let cfg = ContentQualityProviderConfig {
                vendor:          row.vendor,
                service_url:     row.service_url.unwrap_or_default(),
                service_api_key,
                timeout_ms:      row.timeout_ms as u64,
            };
            tracing::info!(
                "[content_quality_provider] loaded vendor={} url={}",
                cfg.vendor,
                if cfg.service_url.is_empty() { "(unset)" } else { &cfg.service_url }
            );
            *store.content_quality_provider_config.write().unwrap_or_else(|e| e.into_inner()) = cfg;
        }
        Ok(None) => {
            tracing::info!("[content_quality_provider] no config row found — content quality scanning inert");
        }
        Err(e) => {
            tracing::warn!("[content_quality_provider] config query failed (keeping existing): {}", e);
        }
    }

    let judge_result = sqlx::query_as::<_, JudgeProviderRow>(
        r#"
        SELECT ap.id::text, ap.name, ap.endpoint, ap.model, ap.api_key, ap.timeout_ms,
               COALESCE(ap.vendor, 'openai') AS vendor, ap.max_output_token, ap.max_input_token
        FROM content_quality_provider_config cqpc
        JOIN ai_providers ap ON ap.id::text = cqpc.provider_id
        WHERE cqpc.id = 1 AND ap.status != 'unhealthy'
        LIMIT 1
        "#,
    )
    .fetch_optional(pool)
    .await;

    match judge_result {
        Ok(Some(row)) => {
            if !super::validate_endpoint(&row.endpoint).await {
                tracing::warn!(
                    "[content_quality_provider] judge provider \"{}\" has invalid endpoint \"{}\" — content quality scanning disabled",
                    row.name, row.endpoint
                );
                *store.content_quality_judge_provider.write().unwrap_or_else(|e| e.into_inner()) = None;
            } else {
                let api_key = row.api_key.as_deref().and_then(|k| crate::crypto::decrypt_provider_key(k, &row.name));
                let p = ProviderConfig::without_meter(
                    row.id,
                    row.name.clone(),
                    row.endpoint.clone(),
                    row.model,
                    api_key,
                    row.timeout_ms as u64,
                    row.vendor,
                    row.max_output_token,
                    row.max_input_token,
                );
                tracing::info!("[content_quality_provider] judge LLM: {} @ {}", p.name, p.endpoint);
                *store.content_quality_judge_provider.write().unwrap_or_else(|e| e.into_inner()) = Some(p);
            }
        }
        Ok(None) => {
            *store.content_quality_judge_provider.write().unwrap_or_else(|e| e.into_inner()) = None;
        }
        Err(e) => {
            tracing::warn!("[content_quality_provider] judge provider query failed (keeping existing): {}", e);
        }
    }
}
