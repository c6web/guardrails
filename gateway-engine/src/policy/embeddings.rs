use crate::agents::embedding::client::EmbeddingProviderConfig;
use super::DetectorStore;
use sqlx::PgPool;

#[derive(sqlx::FromRow)]
struct EmbeddingProviderRow {
    id:              String,
    name:            String,
    endpoint:        String,
    api_key:         Option<String>,
    model:           Option<String>,
    vendor:          String,
    dimensions:      Option<i32>,
    timeout_ms:      i32,
    provider:        Option<String>,
    allow_fallbacks: Option<bool>,
    data_collection: Option<String>,
}

pub(super) async fn load_embedding_providers(store: &DetectorStore, pool: &PgPool) {
    // Semantic similarity threshold is sourced from the DB (single source of truth),
    // not from the EMBEDDING_THRESHOLD env var.
    match sqlx::query_scalar::<_, f32>(
        "SELECT semantic_threshold::FLOAT4 FROM embedding_provider_config WHERE id = 1",
    )
    .fetch_optional(pool)
    .await
    {
        Ok(Some(thr)) => {
            tracing::info!("[detector_loader] semantic threshold loaded from DB: {:.2}", thr);
            *store.embedding_threshold.write().unwrap_or_else(|e| e.into_inner()) = thr;
        }
        Ok(None) => tracing::warn!("[detector_loader] no embedding_provider_config row — keeping existing semantic threshold"),
        Err(e) => tracing::warn!("[detector_loader] semantic threshold load failed (keeping existing): {}", e),
    }

    let sql = r#"
        SELECT ep.id, ep.name, ep.endpoint, ep.api_key, ep.model, ep.vendor,
               ep.dimensions, ep.timeout_ms, ep.provider, ep.allow_fallbacks, ep.data_collection,
               CASE ep.id
                    WHEN epc.primary_id THEN 1
                    WHEN epc.backup1_id THEN 2
                    WHEN epc.backup2_id THEN 3
                    ELSE 99
                END AS priority
        FROM embedding_provider_config epc, embedding_providers ep
        WHERE epc.id = 1
          AND ep.id IN (epc.primary_id, epc.backup1_id, epc.backup2_id)
        ORDER BY priority
    "#;

    match sqlx::query_as::<_, EmbeddingProviderRow>(sql).fetch_all(pool).await {
        Ok(rows) => {
            let mut items = Vec::with_capacity(rows.len());
            for r in rows {
                if !super::validate_endpoint(&r.endpoint).await {
                    tracing::warn!("[detector_loader] skipping embedding provider \"{}\" — invalid endpoint \"{}\"", r.name, r.endpoint);
                    continue;
                }
                let provider_name = r.name.clone();
                items.push(EmbeddingProviderConfig {
                    id:              r.id,
                    name:            r.name,
                    endpoint:        r.endpoint,
                    api_key:         r.api_key.as_deref().and_then(|k| crate::crypto::decrypt_provider_key(k, &provider_name)),
                    model:           r.model,
                    vendor:          r.vendor,
                    dimensions:      r.dimensions,
                    timeout_ms:      r.timeout_ms as u64,
                    provider:        r.provider,
                    allow_fallbacks: r.allow_fallbacks,
                    data_collection: r.data_collection,
                });
            }
            // Config-time dimension guard: check provider dimensions against stored vectors
            for ep in &items {
                if let Some(dim) = ep.dimensions {
                    match sqlx::query_scalar::<_, i32>(
                        "SELECT COALESCE(
                            (SELECT atttypmod FROM pg_attribute
                             WHERE attrelid = 'threat_knowledge'::regclass AND attname = 'embedding'),
                            0
                        )"
                    ).fetch_one(pool).await {
                        Ok(stored_dim) if stored_dim > 0 && stored_dim != dim => {
                            tracing::error!(
                                "[detector_loader] EMBEDDING_DIMENSION_MISMATCH provider=\"{}\" declared_dim={} stored_vector_dim={} — \
                                 semantic search will fail at runtime; fix the embedding provider configuration",
                                ep.name, dim, stored_dim
                            );
                        }
                        Ok(_) => {}
                        Err(e) => {
                            tracing::warn!(
                                "[detector_loader] could not check vector dimension for provider \"{}\": {}",
                                ep.name, e
                            );
                        }
                    }
                }
            }

            let count = items.len();
            let has_providers = !items.is_empty();
            let has_classifier = store.classifier_provider.read().unwrap_or_else(|e| e.into_inner()).is_some();
            *store.embedding_providers.write().unwrap_or_else(|e| e.into_inner()) = items;
            *store.detection_degraded.write().unwrap_or_else(|e| e.into_inner()) =
                !has_providers || !has_classifier;
            tracing::info!("[cache] loaded embedding providers cache ({} entries) — detection_degraded={}",
                count, *store.detection_degraded.read().unwrap_or_else(|e| e.into_inner()));
        }
        Err(e) => {
            tracing::warn!("[cache] failed to load embedding providers: {} — keeping existing cache", e);
        }
    }
}

