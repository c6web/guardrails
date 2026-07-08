//! Anthropic adapter — the canonical home for all Anthropic ↔ OpenAI format
//! conversion.
//!
//! This module re-exports everything from sub-modules so callers use `anthropic::`
//! exactly as before (no import changes needed).

pub mod adapters;
pub mod convert;
pub mod request;
pub mod response;
pub mod sse;

// ── Re-export the public surface so existing imports keep working ─────────────

pub use self::adapters::*;
pub use self::convert::*;
pub use self::sse::*;
