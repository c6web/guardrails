use pgvector::Vector;
use sqlx::Row;
use tokio::time::timeout;
use std::collections::HashMap;
use crate::tools::telemetry;
use super::CachedResponse;

pub async fn search_semantic_single_turn(
    pool: &sqlx::PgPool,
    app_id: &str,
    embedding: &[f32],
    threshold: f64,
    top_k: usize,
    timeout_ms: u64,
) -> Vec<CachedResponse> {
    let vector = Vector::from(embedding.to_vec());

    let search_future = async {
        let rows = sqlx::query(
            r#"
            SELECT 
                id, app_id, request_hash, model, provider_id, match_mode,
                response_bytes, response_headers,
                tokens_in, tokens_out,
                created_at, expires_at,
                hit_count, last_hit_at,
                system_prompt_hash, end_user_id, turn_index,
                (1 - (embedding <=> $1)) AS similarity
            FROM response_cache
            WHERE app_id = $2
              AND embedding IS NOT NULL
              AND match_mode IN ('exact', 'semantic_single_turn')
              AND expires_at > NOW()
              AND (1 - (embedding <=> $1)) >= $3
            ORDER BY embedding <=> $1
            LIMIT $4
            "#,
        )
        .bind(&vector)
        .bind(app_id)
        .bind(threshold)
        .bind(top_k as i32)
        .fetch_all(pool)
        .await;

        match rows {
            Ok(results) => {
                let entries: Vec<CachedResponse> = results.iter().filter_map(|r| {
                    let similarity: f64 = match r.try_get("similarity") {
                        Ok(v) => v,
                        Err(_) => return None,
                    };
                    if similarity < threshold {
                        return None;
                    }

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
                }).collect();

                if entries.is_empty() {
                    if let Some(m) = telemetry::METRICS.get() {
                        m.cache_decisions_total
                            .with_label_values(&["l2_semantic", "miss"])
                            .inc();
                    }
                } else {
                    if let Some(m) = telemetry::METRICS.get() {
                        m.cache_decisions_total
                            .with_label_values(&["l2_semantic", "hit"])
                            .inc();
                    }

                    let pool = pool.clone();
                    let id = entries[0].id.clone();
                    tokio::spawn(async move {
                        let _ = sqlx::query(
                            "UPDATE response_cache SET hit_count = hit_count + 1, last_hit_at = NOW() WHERE id = $1"
                        )
                        .bind(&id)
                        .execute(&pool)
                        .await;
                    });
                }

                entries
            }
            Err(e) => {
                tracing::warn!(error = %e, "Semantic single-turn search error (treating as miss)");
                if let Some(m) = telemetry::METRICS.get() {
                    m.cache_decisions_total
                        .with_label_values(&["l2_semantic", "error"])
                        .inc();
                }
                Vec::new()
            }
        }
    };

    match timeout(std::time::Duration::from_millis(timeout_ms), search_future).await {
        Ok(result) => result,
        Err(_) => {
            tracing::warn!("Semantic single-turn search timed out after {}ms (treating as miss)", timeout_ms);
            if let Some(m) = telemetry::METRICS.get() {
                m.cache_decisions_total
                    .with_label_values(&["l2_semantic", "error"])
                    .inc();
            }
            Vec::new()
        }
    }
}

pub async fn search_semantic_multi_turn(
    pool: &sqlx::PgPool,
    app_id: &str,
    embedding: &[f32],
    threshold: f64,
    system_prompt_hash: &str,
    end_user_id: &str,
    turn_index: Option<i32>,
    top_k: usize,
    timeout_ms: u64,
) -> Vec<CachedResponse> {
    let vector = Vector::from(embedding.to_vec());

    let search_future = async {
        let rows = match turn_index {
            Some(ti) => {
                sqlx::query(
                    r#"
                    SELECT 
                        id, app_id, request_hash, model, provider_id, match_mode,
                        response_bytes, response_headers,
                        tokens_in, tokens_out,
                        created_at, expires_at,
                        hit_count, last_hit_at,
                        system_prompt_hash, end_user_id, turn_index,
                        (1 - (embedding <=> $1)) AS similarity
                    FROM response_cache
                    WHERE app_id = $2
                      AND embedding IS NOT NULL
                      AND match_mode = 'semantic_multi_turn'
                      AND expires_at > NOW()
                      AND system_prompt_hash = $3
                      AND end_user_id = $4
                      AND turn_index BETWEEN $5 AND $6
                      AND (1 - (embedding <=> $1)) >= $7
                    ORDER BY embedding <=> $1
                    LIMIT $8
                    "#,
                )
                .bind(&vector)
                .bind(app_id)
                .bind(system_prompt_hash)
                .bind(end_user_id)
                .bind(ti.saturating_sub(1))
                .bind(ti + 1)
                .bind(threshold)
                .bind(top_k as i32)
                .fetch_all(pool)
                .await
            }
            None => {
                sqlx::query(
                    r#"
                    SELECT 
                        id, app_id, request_hash, model, provider_id, match_mode,
                        response_bytes, response_headers,
                        tokens_in, tokens_out,
                        created_at, expires_at,
                        hit_count, last_hit_at,
                        system_prompt_hash, end_user_id, turn_index,
                        (1 - (embedding <=> $1)) AS similarity
                    FROM response_cache
                    WHERE app_id = $2
                      AND embedding IS NOT NULL
                      AND match_mode = 'semantic_multi_turn'
                      AND expires_at > NOW()
                      AND system_prompt_hash = $3
                      AND end_user_id = $4
                      AND (1 - (embedding <=> $1)) >= $5
                    ORDER BY embedding <=> $1
                    LIMIT $6
                    "#,
                )
                .bind(&vector)
                .bind(app_id)
                .bind(system_prompt_hash)
                .bind(end_user_id)
                .bind(threshold)
                .bind(top_k as i32)
                .fetch_all(pool)
                .await
            }
        };

        match rows {
            Ok(results) => {
                let entries: Vec<CachedResponse> = results.iter().filter_map(|r| {
                    let similarity: f64 = match r.try_get("similarity") {
                        Ok(v) => v,
                        Err(_) => return None,
                    };
                    if similarity < threshold {
                        return None;
                    }

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
                }).collect();

                if entries.is_empty() {
                    if let Some(m) = telemetry::METRICS.get() {
                        m.cache_decisions_total
                            .with_label_values(&["l2_multi_turn_semantic", "miss"])
                            .inc();
                    }
                } else {
                    if let Some(m) = telemetry::METRICS.get() {
                        m.cache_decisions_total
                            .with_label_values(&["l2_multi_turn_semantic", "hit"])
                            .inc();
                    }

                    let pool = pool.clone();
                    let id = entries[0].id.clone();
                    tokio::spawn(async move {
                        let _ = sqlx::query(
                            "UPDATE response_cache SET hit_count = hit_count + 1, last_hit_at = NOW() WHERE id = $1"
                        )
                        .bind(&id)
                        .execute(&pool)
                        .await;
                    });
                }

                entries
            }
            Err(e) => {
                tracing::warn!(error = %e, "Multi-turn semantic search error (treating as miss)");
                if let Some(m) = telemetry::METRICS.get() {
                    m.cache_decisions_total
                        .with_label_values(&["l2_multi_turn_semantic", "error"])
                        .inc();
                }
                Vec::new()
            }
        }
    };

    match timeout(std::time::Duration::from_millis(timeout_ms), search_future).await {
        Ok(result) => result,
        Err(_) => {
            tracing::warn!("Multi-turn semantic search timed out after {}ms (treating as miss)", timeout_ms);
            if let Some(m) = telemetry::METRICS.get() {
                m.cache_decisions_total
                    .with_label_values(&["l2_multi_turn_semantic", "error"])
                    .inc();
            }
            Vec::new()
        }
    }
}
