//! Direct DB write for agent-created threat knowledge entries.
//!
//! Mirrors log_writer.rs pattern but writes to the data-db (`ai_gateway_data`),
//! specifically the `threat_knowledge` table.

use pgvector::Vector;
use sqlx::PgPool;

/// Insert a new agent-created threat knowledge entry with `status='pending'` and `source='agent'`.
///
/// Returns the UUID of the newly inserted row on success.
pub async fn insert_threat_knowledge(
    pool:              &PgPool,
    name:              &str,
    description:       &str,
    threat_context:    &str,
    embedding:         Vector,
    origin_request_id: &str,
) -> Result<String, sqlx::Error> {
    let now = chrono::Utc::now();

    let id = sqlx::query_scalar::<_, String>(
        r#"
        INSERT INTO threat_knowledge
            (id, name, description, threat_context, embedding, embedding_at,
             status, source, origin_request_id,
             created_by, updated_by, created_at, updated_at)
        VALUES
            (gen_random_uuid(), $1, $2, $3, $4, $5,
             'pending', 'agent', $6,
             NULL, NULL, $7, $7)
        RETURNING id::text
        "#,
    )
    .bind(name)
    .bind(description)
    .bind(threat_context)
    .bind(embedding)
    .bind(now)
    .bind(origin_request_id)
    .bind(now)
    .fetch_one(pool)
    .await?;

    Ok(id)
}
