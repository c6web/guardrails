use sqlx::PgPool;
use crate::policy::DetectorStore;

/// Bootstrap default judge criteria used only on cold start before the first
/// DB cache load. The DB row (`content_quality_judge_prompts`, is_active=true)
/// is always the source of truth once loaded — mirrors `t2_analyzer::T2_SYSTEM_PROMPT`.
pub const DEFAULT_CONTENT_QUALITY_SYSTEM_PROMPT: &str = "\
Score the assistant's response against the provided context (the full prompt: system \
instructions + user message + conversation history).

Groundedness: does every material claim in the response trace back to something stated or \
reasonably inferable from the context? Penalize invented facts, numbers, names, or citations \
that are not supported by the context.

Answer relevance: does the response actually address what was asked? Penalize responses that \
are evasive, off-topic, or answer a different question than the one in the context.";

pub const DEFAULT_CONTENT_QUALITY_THRESHOLD: f32 = 0.7;

/// Load the active Content Quality Judge prompt from the database. Falls back to
/// built-in defaults if the query returns no rows or errors (fail-safe) — same
/// shape as `t2_prompt::load_t2_prompt`.
pub async fn load_content_quality_prompt(store: &DetectorStore, pool: &PgPool) {
    let row = sqlx::query_as::<_, (String, f32, i32)>(
        "SELECT system_prompt, threshold, max_output_tokens FROM content_quality_judge_prompts WHERE is_active = true LIMIT 1"
    )
    .fetch_optional(pool)
    .await;

    match row {
        Ok(Some((system_prompt, threshold, max_output_tokens))) => {
            *store.content_quality_system_prompt.write().unwrap_or_else(|e| e.into_inner()) = system_prompt;
            *store.content_quality_threshold.write().unwrap_or_else(|e| e.into_inner()) = threshold;
            *store.content_quality_max_output_tokens.write().unwrap_or_else(|e| e.into_inner()) = max_output_tokens;
            tracing::info!(
                "[content_quality_prompt] loaded active prompt (threshold={}, max_tokens={})",
                threshold, max_output_tokens
            );
        }
        Ok(None) => {
            tracing::warn!("[content_quality_prompt] no active content quality judge prompt found — using built-in defaults");
        }
        Err(e) => {
            tracing::warn!("[content_quality_prompt] DB error loading content quality judge prompt: {}", e);
        }
    }
}
