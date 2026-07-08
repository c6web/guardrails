use sqlx::PgPool;
use crate::policy::DetectorStore;

/// Load the active T2 agent prompt from the database. Falls back to built-in
/// defaults if the query returns no rows or errors (fail-safe).
pub async fn load_t2_prompt(store: &DetectorStore, pool: &PgPool) {
    let row = sqlx::query_as::<_, (String, f32, i32)>(
        "SELECT system_prompt, threshold, max_output_tokens FROM t2_agent_prompts WHERE is_active = true LIMIT 1"
    )
    .fetch_optional(pool)
    .await;

    match row {
        Ok(Some((system_prompt, threshold, max_output_tokens))) => {
            *store.t2_system_prompt.write().unwrap_or_else(|e| e.into_inner()) = system_prompt;
            *store.t2_threshold.write().unwrap_or_else(|e| e.into_inner()) = threshold;
            *store.t2_max_output_tokens.write().unwrap_or_else(|e| e.into_inner()) = max_output_tokens;
            tracing::info!("[t2_prompt] loaded active prompt (threshold={}, max_tokens={})", threshold, max_output_tokens);
        }
        Ok(None) => {
            tracing::warn!("[t2_prompt] no active T2 prompt found — using built-in defaults");
        }
        Err(e) => {
            tracing::warn!("[t2_prompt] DB error loading T2 prompt: {}", e);
        }
    }
}
