pub mod key;
pub mod lookup;
pub mod semantic;
pub mod store;
pub mod write;

use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct CachedResponse {
    pub id: String,
    pub app_id: String,
    pub request_hash: String,
    pub model: String,
    pub provider_id: String,
    pub match_mode: String,
    pub response_bytes: Vec<u8>,
    pub response_headers: Option<HashMap<String, String>>,
    pub tokens_in: i32,
    pub tokens_out: i32,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub expires_at: chrono::DateTime<chrono::Utc>,
    pub hit_count: i32,
    pub last_hit_at: Option<chrono::DateTime<chrono::Utc>>,
    pub embedding: Option<Vec<f32>>,
    pub system_prompt_hash: Option<String>,
    pub end_user_id: Option<String>,
    pub turn_index: Option<i32>,
}
