use moka::sync::Cache as MokaCache;
use sqlx::PgPool;
use super::CachedResponse;

#[derive(Clone)]
pub(crate) struct ResponseCacheStore {
    /// L1 in-memory hot cache: keyed by (app_id, request_hash)
    l1: MokaCache<(String, String), CachedResponse>,
    /// L2 Postgres pool (reuses LOG_PG pool from log_writer)
    l2_pool: Option<PgPool>,
    /// Max TTL from env config
    max_ttl_seconds: u64,
    /// Default TTL from env config
    default_ttl_seconds: u64,
    /// Lookup timeout in ms
    lookup_timeout_ms: u64,
}

impl ResponseCacheStore {
    pub fn new(
        l2_pool: Option<PgPool>,
        max_ttl_seconds: u64,
        default_ttl_seconds: u64,
        lookup_timeout_ms: u64,
        l1_max_entries: u64,
    ) -> Self {
        let l1 = MokaCache::builder()
            .max_capacity(l1_max_entries)
            .time_to_live(std::time::Duration::from_secs(default_ttl_seconds))
            .support_invalidation_closures()
            .build();

        Self {
            l1,
            l2_pool,
            max_ttl_seconds,
            default_ttl_seconds,
            lookup_timeout_ms,
        }
    }

    /// Check L1 cache (synchronous, sub-millisecond)
    pub fn check_l1(&self, app_id: &str, request_hash: &str) -> Option<CachedResponse> {
        self.l1.get(&(app_id.to_string(), request_hash.to_string()))
    }

    /// Insert into L1 cache
    pub fn insert_l1(&self, app_id: String, request_hash: String, response: CachedResponse) {
        self.l1.insert((app_id, request_hash), response);
    }

    /// Get L1 size
    pub fn l1_size(&self) -> u64 {
        self.l1.entry_count()
    }

    pub fn l2_pool(&self) -> Option<&PgPool> {
        self.l2_pool.as_ref()
    }

    pub fn max_ttl_seconds(&self) -> u64 {
        self.max_ttl_seconds
    }

    pub fn default_ttl_seconds(&self) -> u64 {
        self.default_ttl_seconds
    }

    pub fn lookup_timeout_ms(&self) -> u64 {
        self.lookup_timeout_ms
    }

    /// Force-invalidate the L1 hot cache — all entries, or just one app's.
    /// Moka invalidation is eventually-consistent (takes effect on the next
    /// maintenance sweep / access), which is fine for an admin-triggered flush.
    pub fn flush_l1(&self, app_id: Option<&str>) {
        match app_id {
            Some(id) => {
                let id = id.to_string();
                let _ = self.l1.invalidate_entries_if(move |k, _v| k.0 == id);
            }
            None => self.l1.invalidate_all(),
        }
    }

    /// Force-delete matching rows from the L2 Postgres response_cache table
    /// (all rows, or just one app's). Returns the number of rows deleted.
    pub async fn flush_l2(&self, app_id: Option<&str>) -> Result<u64, sqlx::Error> {
        let pool = match self.l2_pool.as_ref() {
            Some(p) => p,
            None => return Ok(0),
        };
        let result = match app_id {
            Some(id) => sqlx::query("DELETE FROM response_cache WHERE app_id = $1")
                .bind(id)
                .execute(pool)
                .await?,
            None => sqlx::query("DELETE FROM response_cache").execute(pool).await?,
        };
        Ok(result.rows_affected())
    }

    /// Deletes all expired rows from the L2 Postgres response_cache table.
    pub async fn cleanup_expired(&self) {
        let pool = match self.l2_pool.as_ref() {
            Some(p) => p,
            None => return,
        };

        let result = sqlx::query("DELETE FROM response_cache WHERE expires_at <= NOW()")
            .execute(pool)
            .await;

        match result {
            Ok(r) => {
                if r.rows_affected() > 0 {
                    tracing::info!("Cleaned up {} expired response cache entries", r.rows_affected());
                }
            }
            Err(e) => {
                tracing::warn!(error = %e, "Failed to clean up expired response cache entries");
            }
        }
    }
}
