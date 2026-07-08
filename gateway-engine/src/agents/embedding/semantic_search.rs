//! Semantic threat search using pgvector HNSW ANN index.
//!
//! Uses the pgvector-rust crate for native Vector type binding — more stable
//! than text-casting ($1::vector) and correctly handles OID resolution.

use pgvector::Vector;
use sqlx::{PgPool, Row};

// ── Query result ──────────────────────────────────────────────────────────────

/// Single hit returned by `search_threats`.
#[derive(Clone, Debug)]
pub struct SemanticHit {
    pub id:             String,
    pub name:           String,
    pub description:    String,
    pub threat_context: String,
    /// Cosine similarity score (1 - cosine_distance). Scaled to [0, 1].
    pub similarity:     f32,
}

// ── Search function ───────────────────────────────────────────────────────────

/// Perform ANN search against the `threat_knowledge` table using pgvector HNSW.
///
/// Returns up to `top_k` results with cosine similarity >= `threshold`,
/// sorted by similarity descending.
///
/// When `allowed_ids` is Some, only threat knowledge entries matching those IDs are returned.
/// When `include_pending` is true, `status = 'pending'` rows are matched in addition to
/// `'active'` ones — used by the knowledge developer's dedup check so it doesn't pile up
/// duplicate pending entries; live classification callers must pass `false`.
pub async fn search_threats(
    pool:            &PgPool,
    embedding:       &[f32],
    threshold:       f32,
    top_k:           usize,
    allowed_ids:     Option<&[String]>,
    include_pending: bool,
) -> Result<Vec<SemanticHit>, String> {
    let vector = Vector::from(embedding.to_vec());
    let status_filter = if include_pending {
        "status IN ('active', 'pending')"
    } else {
        "status = 'active'"
    };

   let result = match allowed_ids {
        None => sqlx::query(&format!(
            r#"
            SELECT id::text, name, description, threat_context,
                   (1 - (embedding <=> $1)) AS similarity
            FROM threat_knowledge
            WHERE embedding IS NOT NULL
              AND {status_filter}
            ORDER BY embedding <=> $1
            LIMIT $2
            "#,
        ))
        .bind(vector)
        .bind(top_k as i32)
        .fetch_all(pool)
            .await,

      Some(ids) => {
            sqlx::query(&format!(
                r#"
                SELECT id::text, name, description, threat_context,
                       (1 - (embedding <=> $1)) AS similarity
                FROM threat_knowledge
                WHERE embedding IS NOT NULL
                  AND {status_filter}
                  AND id::text = ANY($3)
                ORDER BY embedding <=> $1
                LIMIT $2
                "#,
            ))
            .bind(vector)
            .bind(top_k as i32)
            .bind(ids)
            .fetch_all(pool)
            .await
        }
    };

    match result {
        Ok(rows) => Ok(rows
            .iter()
            .filter_map(|row| {
                let id: String              = row.get("id");
                let name: String            = row.get("name");
                let description: String     = row.get("description");
                let threat_context: String  = row.get("threat_context");
                let similarity: f64         = row.get("similarity");

                if similarity >= (threshold as f64) {
                    Some(SemanticHit { id, name, description, threat_context, similarity: similarity as f32 })
                } else {
                    None
                }
            })
            .collect()),

        Err(e) => Err(e.to_string()),
    }
}
