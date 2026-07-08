use sqlx::{PgPool, Row};
use tracing;

use crate::policy::DetectorStore;

pub async fn load_response_cache_config(store: &DetectorStore, pool: &PgPool) {
    let row = sqlx::query(
        r#"
        SELECT enabled, exact_match_enabled, semantic_match_enabled, semantic_threshold
        FROM response_cache_config
        WHERE id = 1
        "#
    )
    .fetch_optional(pool)
    .await;

    match row {
        Ok(Some(r)) => {
            let enabled: bool = r.get("enabled");
            let exact_enabled: bool = r.get("exact_match_enabled");
            let semantic_enabled: bool = r.get("semantic_match_enabled");
            let threshold: f64 = r.get("semantic_threshold");

            tracing::info!(
                response_cache_enabled = enabled,
                exact_match_enabled = exact_enabled,
                semantic_match_enabled = semantic_enabled,
                semantic_threshold = threshold,
                "Loaded response cache config"
            );

            *store.response_cache_enabled.write().await = enabled;
            *store.response_cache_exact_enabled.write().await = exact_enabled;
            *store.response_cache_semantic_enabled.write().await = semantic_enabled;
            *store.response_cache_threshold.write().await = threshold;
        }
        Ok(None) => {
            tracing::warn!("No response_cache_config row found, using defaults (disabled)");
            // Reset to defaults
            *store.response_cache_enabled.write().await = false;
            *store.response_cache_exact_enabled.write().await = true;
            *store.response_cache_semantic_enabled.write().await = false;
            *store.response_cache_threshold.write().await = 0.97;
        }
        Err(e) => {
            tracing::warn!(error = %e, "Failed to load response cache config (keeping existing values)");
        }
    }
}
