use crate::tools::auth::CachedApp;
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::RwLock;

#[derive(sqlx::FromRow)]
struct ApiKeyRow {
    key_hash:             String,
    app_id:               String,
    api_key_prefix:       String,
    app_name:             String,
    app_mode:             String,
    primary_provider_id:  Option<String>,
    backup1_provider_id:  Option<String>,
    backup2_provider_id:  Option<String>,
    classifier_threshold:  Option<f32>,
    classifier_prompt:     Option<String>,
    max_tokens:            Option<i64>,
    max_payload_size:      Option<i64>,
    enable_t2:             Option<bool>,
    enable_knowledge_dev:  Option<bool>,
    enable_content_quality_scan:    Option<bool>,
    content_quality_scan_mode:      Option<String>,
    content_quality_scan_threshold: Option<f32>,
    quota_mode:            Option<String>,
    quota_limit:           Option<i64>,
    quota_warning_limit:   Option<i64>,
    quota_enforcement:     Option<String>,
    quota_reset_day:       Option<i32>,
    quota_period_start:    Option<chrono::DateTime<chrono::Utc>>,
    app_created_at:              chrono::DateTime<chrono::Utc>,
    enable_response_cache:       Option<bool>,
    cache_ttl_seconds:           Option<i32>,
    multi_turn_semantic_enabled: Option<bool>,
}

pub(super) async fn load_api_keys(
    pool: &PgPool,
    cache: &RwLock<HashMap<String, CachedApp>>,
) {
    super::load_into_cache_map::<ApiKeyRow, String, CachedApp>(
        pool,
        r#"
    SELECT ak.key_hash,
          ca.id::text                          AS app_id,
          ak.key_prefix                        AS api_key_prefix,
          ca.name                              AS app_name,
          ca.mode                              AS app_mode,
          ca.primary_provider_id::text         AS primary_provider_id,
          ca.backup1_provider_id::text         AS backup1_provider_id,
          ca.backup2_provider_id::text         AS backup2_provider_id,
          ca.classifier_threshold::FLOAT4      AS classifier_threshold,
          ca.classifier_prompt                 AS classifier_prompt,
          ca.max_tokens                        AS max_tokens,
          ca.max_payload_size                  AS max_payload_size,
          ca.enable_t2                         AS enable_t2,
          ca.enable_knowledge_dev              AS enable_knowledge_dev,
          ca.enable_content_quality_scan       AS enable_content_quality_scan,
          ca.content_quality_scan_mode         AS content_quality_scan_mode,
          ca.content_quality_scan_threshold::FLOAT4 AS content_quality_scan_threshold,
          ca.quota_mode                        AS quota_mode,
          ca.quota_limit::BIGINT               AS quota_limit,
          ca.quota_warning_limit::BIGINT       AS quota_warning_limit,
          ca.quota_enforcement                 AS quota_enforcement,
          ca.quota_reset_day::INT4             AS quota_reset_day,
          ca.quota_period_start                AS quota_period_start,
          ca.created_at                          AS app_created_at,
          ca.enable_response_cache               AS enable_response_cache,
          ca.cache_ttl_seconds                   AS cache_ttl_seconds,
          ca.multi_turn_semantic_enabled         AS multi_turn_semantic_enabled
         FROM api_keys ak
         JOIN connected_apps ca ON ak.app_id = ca.id
         WHERE ak.status = 'active'
        "#,
        "API keys",
        |r| {
            let app = CachedApp {
                app_id:              r.app_id,
                api_key_prefix:      r.api_key_prefix,
                app_name:            r.app_name,
                app_mode:            r.app_mode,
                primary_provider_id: r.primary_provider_id,
                backup1_provider_id: r.backup1_provider_id,
                backup2_provider_id: r.backup2_provider_id,
                classifier_threshold: r.classifier_threshold,
                classifier_prompt:    r.classifier_prompt,
                max_tokens:           r.max_tokens.map(|v| v as i32),
                max_payload_size:     r.max_payload_size,
                enable_t2:            r.enable_t2.unwrap_or(true),
                enable_knowledge_dev: r.enable_knowledge_dev.unwrap_or(false),
                enable_content_quality_scan:    r.enable_content_quality_scan.unwrap_or(false),
                content_quality_scan_mode:      r.content_quality_scan_mode,
                content_quality_scan_threshold: r.content_quality_scan_threshold,
                quota_mode:           r.quota_mode.unwrap_or_else(|| "unlimited".to_string()),
                quota_limit:          r.quota_limit,
                quota_warning_limit:  r.quota_warning_limit,
                quota_enforcement:    r.quota_enforcement.unwrap_or_else(|| "hard".to_string()),
                quota_reset_day:      r.quota_reset_day,
                quota_period_start:   r.quota_period_start,
                app_created_at:              r.app_created_at,
                enable_response_cache:       r.enable_response_cache.unwrap_or(false),
                cache_ttl_seconds:           r.cache_ttl_seconds,
                multi_turn_semantic_enabled: r.multi_turn_semantic_enabled.unwrap_or(false),
            };
            Some((r.key_hash, app))
        },
        cache,
    )
    .await;
}
