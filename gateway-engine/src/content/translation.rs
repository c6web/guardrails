//! Multipart/form-data body text extraction for scanning.
//!
//! Anthropic ↔ OpenAI API translation now lives with the Anthropic adapter in
//! `llm_adapters::anthropic` (it is per-vendor format knowledge).

use std::sync::LazyLock;

static BASE64_FILE_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#"base64,([A-Za-z0-9+/]{100,})"#).unwrap()
});

// ── Multipart form detection (Gap 5) ─────────────────────────────────────────

/// Extract text content from multipart/form-data body for scanning.
pub fn extract_multipart_text(body: &str) -> String {
    let mut result = String::new();

    // Skip headers and boundary lines
    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("Content-Disposition: form-data") || trimmed.starts_with("name=") {
            continue;
        }
        if !trimmed.is_empty() && !trimmed.starts_with("boundary") {
            result.push_str(trimmed);
            result.push('\n');
        }
    }

    for _cap in BASE64_FILE_RE.find_iter(body) {
        result.push_str("[BASE64_FILE_CONTENT: detected] ");
        result.push('\n');
    }

    result
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_multipart_form_data() {
        let body = "Content-Disposition: form-data; name=\"message\"\n\nHello world";
        let result = extract_multipart_text(body);
        assert!(result.contains("Hello world"));
    }

    #[test]
    fn test_extract_multipart_base64_detection() {
        // Need 100+ base64 chars for the regex to match
        let body = "base64,SGVsbG8gV29ybGQgaXMgbm90IGEgdGVzdCBiZWNhdXNlIGl0IGlzIHNob3J0YnV0dGhpc2lzYWxvbmdlcnN0cmludGhhdHdpbGxtYXRjaHRoZWJhc2U2NGRldGVjdGlvbnJlZ2V4";
        let result = extract_multipart_text(body);
        assert!(result.contains("[BASE64_FILE_CONTENT: detected]"));
    }

    #[test]
    fn test_extract_multipart_boundary_skipped() {
        // The function skips lines starting with "boundary" and Content-Disposition headers
        let body = "boundary\nContent-Disposition: form-data\n\nsome content";
        let result = extract_multipart_text(body);
        assert!(!result.contains("boundary"));
        assert!(!result.contains("Content-Disposition"));
        assert!(result.contains("some content"));
    }
}
