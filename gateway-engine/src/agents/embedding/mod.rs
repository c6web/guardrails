//! Agent: embedding generation and semantic threat search.

pub mod client;
mod handler;
pub mod semantic_search;

pub use handler::handle_embedding_request;
