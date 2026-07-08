use pgvector::Vector;
use crate::tools::telemetry;
use super::CachedResponse;

#[derive(Debug)]
pub enum CacheWriteOutcome {
    Ok,
    Error,
}

pub async fn write_entry(
    pool: &sqlx::PgPool,
    entry: &CachedResponse,
) -> CacheWriteOutcome {
    let headers_json = entry.response_headers.as_ref()
        .and_then(|h| serde_json::to_value(h).ok());

    let embedding_vec = entry.embedding.as_ref().map(|e| Vector::from(e.clone()));

    let result = sqlx::query(
        r#"
        INSERT INTO response_cache (
            id, app_id, request_hash, model, provider_id, match_mode,
            embedding,
            response_bytes, response_headers,
            tokens_in, tokens_out,
            created_at, expires_at,
            hit_count, last_hit_at,
            system_prompt_hash, end_user_id, turn_index
        ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7,
            $8, $9,
            $10, $11,
            $12, $13,
            0, NULL,
            $14, $15, $16
        )
        ON CONFLICT (app_id, request_hash)
        DO UPDATE SET
            embedding = COALESCE(EXCLUDED.embedding, response_cache.embedding),
            response_bytes = EXCLUDED.response_bytes,
            response_headers = EXCLUDED.response_headers,
            model = EXCLUDED.model,
            provider_id = EXCLUDED.provider_id,
            match_mode = EXCLUDED.match_mode,
            tokens_in = EXCLUDED.tokens_in,
            tokens_out = EXCLUDED.tokens_out,
            expires_at = EXCLUDED.expires_at,
            system_prompt_hash = EXCLUDED.system_prompt_hash,
            end_user_id = EXCLUDED.end_user_id,
            turn_index = EXCLUDED.turn_index,
            hit_count = 0,
            last_hit_at = NULL
        "#,
    )
    .bind(&entry.id)
    .bind(&entry.app_id)
    .bind(&entry.request_hash)
    .bind(&entry.model)
    .bind(&entry.provider_id)
    .bind(&entry.match_mode)
    .bind(&embedding_vec)
    .bind(&entry.response_bytes)
    .bind(&headers_json)
    .bind(entry.tokens_in)
    .bind(entry.tokens_out)
    .bind(entry.created_at)
    .bind(entry.expires_at)
    .bind(&entry.system_prompt_hash)
    .bind(&entry.end_user_id)
    .bind(entry.turn_index)
    .execute(pool)
    .await;

    match result {
        Ok(_) => CacheWriteOutcome::Ok,
        Err(e) => {
            tracing::warn!(error = %e, "Cache write error");
            CacheWriteOutcome::Error
        }
    }
}

/// Fire-and-forget cache write (off the request's critical path).
pub fn spawn_write(pool: sqlx::PgPool, entry: CachedResponse) {
    tokio::spawn(async move {
        let outcome = write_entry(&pool, &entry).await;
        match &outcome {
            CacheWriteOutcome::Ok => {
                if let Some(m) = telemetry::METRICS.get() {
                    m.cache_write_total
                        .with_label_values(&["ok"])
                        .inc();
                }
            }
            CacheWriteOutcome::Error => {
                if let Some(m) = telemetry::METRICS.get() {
                    m.cache_write_total
                        .with_label_values(&["error"])
                        .inc();
                }
            }
        }
    });
}

/// Fire-and-forget cache write with multi-turn semantic embedding.
/// Embeds the latest user message only, sets match_mode = "semantic_multi_turn",
/// and attaches system_prompt_hash, end_user_id, and turn_index.
pub fn spawn_write_semantic_multi_turn(
    pool: sqlx::PgPool,
    client: reqwest::Client,
    emb_providers: Vec<crate::agents::embedding::client::EmbeddingProviderConfig>,
    latest_user_message: String,
    mut entry: CachedResponse,
    system_prompt_hash: Option<String>,
    end_user_id: Option<String>,
    turn_index: Option<i32>,
) {
    tokio::spawn(async move {
        let emb_result = if latest_user_message.is_empty() {
            Err("empty latest_user_message".to_string())
        } else {
            crate::agents::embedding::client::generate_embedding(
                &client, &emb_providers, &latest_user_message,
            ).await
        };

        match emb_result {
            Ok(emb) => {
                entry.embedding = Some(emb);
                entry.match_mode = "semantic_multi_turn".to_string();
                entry.system_prompt_hash = system_prompt_hash;
                entry.end_user_id = end_user_id;
                entry.turn_index = turn_index;
                let outcome = write_entry(&pool, &entry).await;
                match &outcome {
                    CacheWriteOutcome::Ok => {
                        if let Some(m) = telemetry::METRICS.get() {
                            m.cache_write_total
                                .with_label_values(&["ok"])
                                .inc();
                        }
                    }
                    CacheWriteOutcome::Error => {
                        if let Some(m) = telemetry::METRICS.get() {
                            m.cache_write_total
                                .with_label_values(&["error"])
                                .inc();
                        }
                    }
                }
            }
            Err(e) => {
                tracing::warn!(error = %e, "Failed to generate embedding for multi-turn cache write (writing exact-match only)");
                let outcome = write_entry(&pool, &entry).await;
                match &outcome {
                    CacheWriteOutcome::Ok => {
                        if let Some(m) = telemetry::METRICS.get() {
                            m.cache_write_total
                                .with_label_values(&["ok"])
                                .inc();
                        }
                    }
                    CacheWriteOutcome::Error => {
                        if let Some(m) = telemetry::METRICS.get() {
                            m.cache_write_total
                                .with_label_values(&["error"])
                                .inc();
                        }
                    }
                }
            }
        }
    });
}

/// Fire-and-forget cache write with semantic embedding computation.
/// Computes an embedding from `prompt_text` using the embedding providers chain,
/// then writes the entry (with or without embedding depending on success).
pub fn spawn_write_semantic(
    pool: sqlx::PgPool,
    client: reqwest::Client,
    emb_providers: Vec<crate::agents::embedding::client::EmbeddingProviderConfig>,
    prompt_text: String,
    mut entry: CachedResponse,
) {
    tokio::spawn(async move {
        let emb_result = crate::agents::embedding::client::generate_embedding(
            &client, &emb_providers, &prompt_text,
        ).await;

        match emb_result {
            Ok(emb) => {
                entry.embedding = Some(emb);
                entry.match_mode = "semantic_single_turn".to_string();
                let outcome = write_entry(&pool, &entry).await;
                match &outcome {
                    CacheWriteOutcome::Ok => {
                        if let Some(m) = telemetry::METRICS.get() {
                            m.cache_write_total
                                .with_label_values(&["ok"])
                                .inc();
                        }
                    }
                    CacheWriteOutcome::Error => {
                        if let Some(m) = telemetry::METRICS.get() {
                            m.cache_write_total
                                .with_label_values(&["error"])
                                .inc();
                        }
                    }
                }
            }
            Err(e) => {
                tracing::warn!(error = %e, "Failed to generate embedding for cache write (writing exact-match only)");
                let outcome = write_entry(&pool, &entry).await;
                match &outcome {
                    CacheWriteOutcome::Ok => {
                        if let Some(m) = telemetry::METRICS.get() {
                            m.cache_write_total
                                .with_label_values(&["ok"])
                                .inc();
                        }
                    }
                    CacheWriteOutcome::Error => {
                        if let Some(m) = telemetry::METRICS.get() {
                            m.cache_write_total
                                .with_label_values(&["error"])
                                .inc();
                        }
                    }
                }
            }
        }
    });
}
