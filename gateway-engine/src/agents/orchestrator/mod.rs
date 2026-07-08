//! Agent: pipeline orchestration — sequential security scan layers.

mod pipeline;

pub use pipeline::scan_keyword_regex;
pub use pipeline::scan_pipeline;
