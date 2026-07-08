use super::DetectorStore;
use sqlx::PgPool;

#[derive(sqlx::FromRow, Clone, Debug)]
pub(crate) struct GatewayKeyRow {
    pub key_hash:         String,
    pub key_prefix:       String,
    pub status:           String,
    pub grace_expires_at: Option<chrono::DateTime<chrono::Utc>>,
}

pub(super) async fn load_gateway_keys(store: &DetectorStore, pool: &PgPool) {
    let instance_id = std::env::var("GATEWAY_INSTANCE_ID").unwrap_or_default();
    if instance_id.is_empty() {
        tracing::error!(
            "[detector_loader] gateway_keys: GATEWAY_INSTANCE_ID is not set — no control keys loaded \
             (console reloads will be rejected). Set this env to the gateway's Gateway ID."
        );
        return;
    }

    match sqlx::query_as::<_, GatewayKeyRow>(
        "SELECT key_hash, key_prefix, status::text, grace_expires_at \
         FROM gateway_api_keys \
         WHERE gateway_id = $1::uuid AND status IN ('active','superseded')",
    )
    .bind(&instance_id)
    .fetch_all(pool)
    .await
    {
        Ok(rows) => {
            let count = rows.len();
            *store.gateway_key_cache.write().unwrap_or_else(|e| e.into_inner()) = rows;
            tracing::info!(
                "[detector_loader] gateway_key cache refreshed: {} active/grace keys for instance {}",
                count,
                instance_id
            );
        }
        Err(e) => {
            tracing::warn!(
                "[detector_loader] gateway_key cache refresh failed (keeping old cache): {}",
                e
            );
        }
    }
}
