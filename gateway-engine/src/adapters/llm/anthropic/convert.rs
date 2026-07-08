//! Anthropic ↔ OpenAI format conversion functions.
//!
//! Re-exports from sibling modules (`request`, `response`) so callers use
//! `anthropic::openai_request_to_anthropic(...)` exactly as before.

pub use crate::adapters::llm::anthropic::request::*;
pub use crate::adapters::llm::anthropic::response::*;
