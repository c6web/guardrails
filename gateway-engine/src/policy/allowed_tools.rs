//! Load tool guardrails from the database into the per-app blocked tools cache.

use sqlx::Row;
use sqlx::PgPool;
use std::collections::{HashMap, HashSet};

use crate::policy::DetectorStore;

pub async fn load_allowed_tools(store: &DetectorStore, pool: &PgPool) {
    if let Err(e) = do_load(store, pool).await {
        tracing::warn!("[blocked_tools] Load failed: {}", e);
    }
}

async fn do_load(store: &DetectorStore, pool: &PgPool) -> Result<(), Box<dyn std::error::Error>> {
    let rows = sqlx::query(
        "SELECT s.app_id, t.tool_name
         FROM app_tool_guardrail_selections s
         JOIN tool_guardrails t ON t.id = s.tool_guardrail_id
         WHERE t.active = true
         ORDER BY s.app_id, t.tool_name",
    )
    .fetch_all(pool)
    .await?;

    let mut map: HashMap<String, HashSet<String>> = HashMap::new();

    for row in rows {
        let app_id: String = row.try_get("app_id")?;
        let tool_name: String = row.try_get("tool_name")?;
        map.entry(app_id).or_default().insert(tool_name);
    }

    *store.blocked_tools.write().unwrap_or_else(|e| e.into_inner()) = map;

    let total_apps = store.blocked_tools.read().unwrap_or_else(|e| e.into_inner()).len();
    let total_tools: usize = store.blocked_tools.read().unwrap_or_else(|e| e.into_inner()).values().map(|s| s.len()).sum();
    tracing::warn!("[blocked_tools] Loaded {} blocked tools across {} apps", total_tools, total_apps);

    Ok(())
}
