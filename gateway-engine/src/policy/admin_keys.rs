use std::sync::RwLock;

#[derive(sqlx::FromRow)]
struct AdminKeyRow {
    key_hash:   String,
    key_prefix: String,
}

pub(super) async fn load_admin_keys(pool: &sqlx::PgPool, cache: &RwLock<Vec<(String, String)>>) {
    super::load_into_cache::<AdminKeyRow, (String, String)>(
        pool,
        "SELECT key_hash, key_prefix FROM admin_api_keys WHERE status = 'active'",
        "admin_keys",
        |r| Some((r.key_hash, r.key_prefix)),
        cache,
    )
    .await;
}
