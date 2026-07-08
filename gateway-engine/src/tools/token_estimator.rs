//! Token estimation utility — approximates token count from text.

/// Estimate token count from text using a simple heuristic.
/// Rough approximation: ~4 characters per token (common for English).
pub fn estimate_token_count(text: &str) -> usize {
    let char_count = text.chars().count();
    if char_count == 0 { return 0; }
    // Use word-based estimation for better accuracy with messages
    let word_count = text.split_whitespace().count();
    // Average tokens per word varies by language, but ~1.7 is a common heuristic
    if word_count > 0 {
        (word_count as f64 * 1.7) as usize
    } else {
        (char_count as f64 / 4.0).ceil() as usize
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_estimate_token_count_simple() {
        assert!(estimate_token_count("hello world") > 0);
        assert_eq!(estimate_token_count(""), 0);
    }
}
