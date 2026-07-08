use super::{DetectorStore, ProviderConfig};
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::RwLock;

#[derive(sqlx::FromRow)]
struct AllProviderRow {
    id:                  String,
    name:                String,
    endpoint:            String,
    model:               Option<String>,
    api_key:             Option<String>,
    timeout_ms:          i32,
    vendor:              String,
    max_output_token:    Option<i32>,
    max_input_token:     Option<i32>,
    meter_mode:          Option<String>,
    meter_metric:        Option<String>,
    meter_limit:         Option<f64>,
    meter_warning_limit: Option<f64>,
    meter_enforcement:   Option<String>,
    meter_reset_day:     Option<i32>,
    price_per_1m_input:  Option<f64>,
    price_per_1m_output: Option<f64>,
    meter_period_start:  Option<chrono::DateTime<chrono::Utc>>,
}

pub(super) async fn load_all_providers(
    pool: &PgPool,
    cache: &RwLock<HashMap<String, ProviderConfig>>,
) {
    let sql = r#"
        SELECT id::text, name, endpoint, model, api_key, timeout_ms,
               COALESCE(vendor, 'openai') AS vendor, max_output_token, max_input_token,
               meter_mode, meter_metric,
               meter_limit::FLOAT8         AS meter_limit,
               meter_warning_limit::FLOAT8 AS meter_warning_limit,
               meter_enforcement,
               meter_reset_day::INT4        AS meter_reset_day,
               price_per_1m_input::FLOAT8  AS price_per_1m_input,
               price_per_1m_output::FLOAT8 AS price_per_1m_output,
               meter_period_start
        FROM ai_providers
        WHERE status != 'unhealthy'
    "#;

    match sqlx::query_as::<_, AllProviderRow>(sql).fetch_all(pool).await {
        Ok(rows) => {
            let mut items = HashMap::with_capacity(rows.len());
            for r in rows {
                if !super::validate_endpoint(&r.endpoint).await {
                    tracing::warn!("[detector_loader] skipping provider \"{}\" — invalid endpoint \"{}\"", r.name, r.endpoint);
                    continue;
                }
                let api_key = r.api_key.as_deref().and_then(|k| crate::crypto::decrypt_provider_key(k, &r.name));
                let cfg = ProviderConfig {
                    id:                  r.id.clone(),
                    name:                r.name,
                    endpoint:            r.endpoint,
                    model:               r.model,
                    api_key,
                    timeout_ms:          r.timeout_ms as u64,
                    vendor:              r.vendor,
                    max_output_token:    r.max_output_token,
                    max_input_token:     r.max_input_token,
                    meter_mode:          r.meter_mode.unwrap_or_else(|| "unlimited".to_string()),
                    meter_metric:        r.meter_metric.unwrap_or_else(|| "requests".to_string()),
                    meter_limit:         r.meter_limit,
                    meter_warning:       r.meter_warning_limit,
                    meter_enforcement:   r.meter_enforcement.unwrap_or_else(|| "soft".to_string()),
                    meter_reset_day:     r.meter_reset_day.map(|d| d as u32),
                    price_per_1m_input:  r.price_per_1m_input.unwrap_or(0.0),
                    price_per_1m_output: r.price_per_1m_output.unwrap_or(0.0),
                    meter_period_start:  r.meter_period_start,
                };
                items.insert(r.id, cfg);
            }
            let count = items.len();
            *cache.write().unwrap_or_else(|e| e.into_inner()) = items;
            tracing::info!("[cache] loaded AI providers cache ({} entries)", count);
        }
        Err(e) => {
            tracing::warn!("[cache] failed to load AI providers: {} — keeping existing cache", e);
        }
    }
}

#[derive(sqlx::FromRow)]
struct ClassifierRow {
    id:         String,
    name:       String,
    endpoint:   String,
    model:      Option<String>,
    api_key:    Option<String>,
    timeout_ms: i32,
    vendor:     String,
    max_output_token: Option<i32>,
    max_input_token:  Option<i32>,
}

#[derive(sqlx::FromRow)]
struct ClassifierSettingsRow {
    confidence_threshold: f32,
    system_prompt:        String,
}

pub(super) async fn load_classifier(store: &DetectorStore, pool: &PgPool) {
    let provider_result = sqlx::query_as::<_, ClassifierRow>(
        r#"
        SELECT ap.id::text, ap.name, ap.endpoint, ap.model, ap.api_key, ap.timeout_ms, COALESCE(ap.vendor, 'openai') AS vendor, ap.max_output_token, ap.max_input_token
        FROM classifier_config cc
        JOIN ai_providers ap ON ap.id::text = cc.primary_id
        WHERE cc.id = 1 AND ap.status != 'unhealthy'
        LIMIT 1
        "#,
    )
    .fetch_optional(pool)
    .await;

    match provider_result {
        Ok(Some(row)) => {
            if !super::validate_endpoint(&row.endpoint).await {
                tracing::warn!("[detector_loader] classifier provider \"{}\" has invalid endpoint \"{}\" — classifier disabled", row.name, row.endpoint);
                *store.classifier_provider.write().unwrap_or_else(|e| e.into_inner()) = None;
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
            tracing::info!("[detector_loader] classifier: {} @ {}", p.name, p.endpoint);
            *store.classifier_provider.write().unwrap_or_else(|e| e.into_inner()) = Some(p);
            }
        }
        Ok(None) => {
            tracing::info!("[detector_loader] no classifier configured — LLM classification disabled");
            *store.classifier_provider.write().unwrap_or_else(|e| e.into_inner()) = None;
        }
        Err(e) => {
            tracing::warn!("[detector_loader] classifier provider query failed (keeping existing): {}", e);
        }
    }

    match sqlx::query_as::<_, ClassifierSettingsRow>(
        "SELECT confidence_threshold::FLOAT4 AS confidence_threshold, system_prompt FROM classifier_config WHERE id = 1",
    )
    .fetch_optional(pool)
    .await
    {
        Ok(Some(row)) => {
            tracing::info!("[detector_loader] classifier threshold={:.2} prompt_len={}", row.confidence_threshold, row.system_prompt.len());
            *store.classifier_threshold.write().unwrap_or_else(|e| e.into_inner()) = row.confidence_threshold;
            if !row.system_prompt.trim().is_empty() {
                *store.classifier_system_prompt.write().unwrap_or_else(|e| e.into_inner()) = row.system_prompt;
            }
        }
        Ok(None) => {}
        Err(e) => {
            tracing::warn!("[detector_loader] classifier settings query failed (keeping existing): {}", e);
        }
    }

    // Update detection_degraded signal: degraded when no classifier or no embedding providers
    let has_classifier = store.classifier_provider.read().unwrap_or_else(|e| e.into_inner()).is_some();
    let has_embeddings = !store.embedding_providers.read().unwrap_or_else(|e| e.into_inner()).is_empty();
    *store.detection_degraded.write().unwrap_or_else(|e| e.into_inner()) = !has_classifier || !has_embeddings;
}
