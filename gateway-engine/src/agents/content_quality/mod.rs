//! Content Quality Scanning — plugin-agnostic pipeline logic. Scores a
//! generated response for groundedness/relevance/hallucination via the active
//! Content Quality Provider (TruLens by default) and decides whether to
//! block/redact/flag/monitor it. See `trulens_plan.md` for the full design.

pub mod builtin;
pub mod client;
pub mod rules;
