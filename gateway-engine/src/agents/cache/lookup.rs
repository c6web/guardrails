use sqlx::Row;
use tokio::time::timeout;
use std::collections::HashMap;
use crate::tools::telemetry;
use super::CachedResponse;

pub async fn lookup_exact(
    pool: &sqlx::PgPool,
    app_id: &str,
    request_hash: &str,
    timeout_ms: u64,
) -> Option<CachedResponse> {
    let lookup_future = async {
        let row = sqlx::query(
            r#"
            SELECT 
                id, app_id, request_hash, model, provider_id, match_mode,
                response_bytes, response_headers,
                tokens_in, tokens_out,
                created_at, expires_at,
                hit_count, last_hit_at,
                system_prompt_hash, end_user_id, turn_index
            FROM response_cache
            WHERE app_id = $1 
              AND request_hash = $2
              AND expires_at > NOW()
            "#,
        )
        .bind(app_id)
        .bind(request_hash)
        .fetch_optional(pool)
        .await;

        match row {
            Ok(Some(r)) => {
                let pool = pool.clone();
                let id: String = r.get("id");
                tokio::spawn(async move {
                    let _ = sqlx::query(
                        "UPDATE response_cache SET hit_count = hit_count + 1, last_hit_at = NOW() WHERE id = $1"
                    )
                    .bind(&id)
                    .execute(&pool)
                    .await;
                });

                let response_headers: Option<serde_json::Value> = r.get("response_headers");
                let headers_map: Option<HashMap<String, String>> = response_headers.and_then(|v| {
                    serde_json::from_value(v).ok()
                });

                Some(CachedResponse {
                    id: r.get("id"),
                    app_id: r.get("app_id"),
                    request_hash: r.get("request_hash"),
                    model: r.get("model"),
                    provider_id: r.get("provider_id"),
                    match_mode: r.get("match_mode"),
                    response_bytes: r.get("response_bytes"),
                    response_headers: headers_map,
                    tokens_in: r.get("tokens_in"),
                    tokens_out: r.get("tokens_out"),
                    created_at: r.get("created_at"),
                    expires_at: r.get("expires_at"),
                    hit_count: r.get::<i32, _>("hit_count"),
                    last_hit_at: r.get("last_hit_at"),
                    embedding: None,
                    system_prompt_hash: r.get("system_prompt_hash"),
                    end_user_id: r.get("end_user_id"),
                    turn_index: r.get("turn_index"),
                })
            }
            Ok(None) => {
                if let Some(m) = telemetry::METRICS.get() {
                    m.cache_decisions_total
                        .with_label_values(&["l2_exact", "miss"])
                        .inc();
                }
                None
            }
            Err(e) => {
                tracing::warn!(error = %e, "L2 exact-match lookup error (treating as miss)");
                if let Some(m) = telemetry::METRICS.get() {
                    m.cache_decisions_total
                        .with_label_values(&["l2_exact", "error"])
                        .inc();
                }
                None
            }
        }
    };

    match timeout(std::time::Duration::from_millis(timeout_ms), lookup_future).await {
        Ok(result) => result,
        Err(_) => {
            tracing::warn!("L2 exact-match lookup timed out after {}ms (treating as miss)", timeout_ms);
            if let Some(m) = telemetry::METRICS.get() {
                m.cache_decisions_total
                    .with_label_values(&["l2_exact", "error"])
                    .inc();
            }
            None
        }
    }
}
