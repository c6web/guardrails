//! Byte-diff assertion helpers for Phase 0 compatibility testing.
//!
//! Compares client-sent body vs mock-upstream-received body for passthrough cases.
//! Handles whitespace normalization and field order independence for JSON bodies.

use serde_json::Value;

/// Normalize a JSON value by sorting object keys recursively.
pub fn normalize_json(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut sorted_map = serde_json::Map::new();
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            for key in keys {
                sorted_map.insert(key.clone(), normalize_json(&map[key]));
            }
            Value::Object(sorted_map)
        }
        Value::Array(arr) => {
            let normalized: Vec<Value> = arr.iter().map(normalize_json).collect();
            Value::Array(normalized)
        }
        _ => value.clone(),
    }
}

/// Compare two JSON bodies ignoring whitespace and field order.
/// Returns true if the bodies are semantically equivalent.
pub fn json_semantic_eq(body_a: &[u8], body_b: &[u8]) -> bool {
    let val_a: Value = match serde_json::from_slice(body_a) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let val_b: Value = match serde_json::from_slice(body_b) {
        Ok(v) => v,
        Err(_) => return false,
    };
    normalize_json(&val_a) == normalize_json(&val_b)
}

/// Compare two byte slices for exact equality.
pub fn bytes_eq(a: &[u8], b: &[u8]) -> bool {
    a == b
}

/// Assert that two JSON bodies are semantically equivalent.
/// Panics with a descriptive message if they differ.
pub fn assert_json_semantic_eq(body_a: &[u8], body_b: &[u8], message: &str) {
    let val_a: Value = serde_json::from_slice(body_a).unwrap_or_else(|e| {
        panic!("Failed to parse body A as JSON: {:?}. {}", e, message);
    });
    let val_b: Value = serde_json::from_slice(body_b).unwrap_or_else(|e| {
        panic!("Failed to parse body B as JSON: {:?}. {}", e, message);
    });
    let norm_a = normalize_json(&val_a);
    let norm_b = normalize_json(&val_b);
    assert!(
        norm_a == norm_b,
        "JSON bodies are not semantically equivalent.\n{}\nBody A (normalized): {}\nBody B (normalized): {}",
        message,
        serde_json::to_string_pretty(&norm_a).unwrap(),
        serde_json::to_string_pretty(&norm_b).unwrap()
    );
}

/// Assert that two byte slices are exactly equal.
/// Panics with a descriptive message if they differ.
pub fn assert_bytes_eq(a: &[u8], b: &[u8], message: &str) {
    assert!(
        a == b,
        "Bytes are not identical.\n{}\nExpected ({} bytes): {:?}\nActual ({} bytes): {:?}",
        message,
        b.len(),
        b,
        a.len(),
        a
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_json_object() {
        let json_a = r#"{"b": 2, "a": 1}"#;
        let json_b = r#"{"a": 1, "b": 2}"#;
        let val_a: Value = serde_json::from_str(json_a).unwrap();
        let val_b: Value = serde_json::from_str(json_b).unwrap();
        assert_eq!(normalize_json(&val_a), normalize_json(&val_b));
    }

    #[test]
    fn test_normalize_json_array() {
        let json_a = r#"[1, 2, 3]"#;
        let json_b = r#"[1, 2, 3]"#;
        let val_a: Value = serde_json::from_str(json_a).unwrap();
        let val_b: Value = serde_json::from_str(json_b).unwrap();
        assert_eq!(normalize_json(&val_a), normalize_json(&val_b));
    }

    #[test]
    fn test_json_semantic_eq_same() {
        let body_a = r#"{"name": "test", "value": 42}"#;
        let body_b = r#"{"value": 42, "name": "test"}"#;
        assert!(json_semantic_eq(body_a.as_bytes(), body_b.as_bytes()));
    }

    #[test]
    fn test_json_semantic_eq_different() {
        let body_a = r#"{"name": "test"}"#;
        let body_b = r#"{"name": "other"}"#;
        assert!(!json_semantic_eq(body_a.as_bytes(), body_b.as_bytes()));
    }

    #[test]
    fn test_json_semantic_eq_nested() {
        let body_a = r#"{"user": {"name": "test", "age": 30}}"#;
        let body_b = r#"{"user": {"age": 30, "name": "test"}}"#;
        assert!(json_semantic_eq(body_a.as_bytes(), body_b.as_bytes()));
    }

    #[test]
    fn test_json_semantic_eq_invalid_json() {
        let body_a = r#"not json"#;
        let body_b = r#"also not json"#;
        assert!(!json_semantic_eq(body_a.as_bytes(), body_b.as_bytes()));
    }

    #[test]
    fn test_bytes_eq_same() {
        assert!(bytes_eq(b"hello", b"hello"));
    }

    #[test]
    fn test_bytes_eq_different() {
        assert!(!bytes_eq(b"hello", b"world"));
    }

    #[test]
    #[should_panic(expected = "JSON bodies are not semantically equivalent")]
    fn test_assert_json_semantic_eq_panics_on_mismatch() {
        assert_json_semantic_eq(
            r#"{"a": 1}"#.as_bytes(),
            r#"{"a": 2}"#.as_bytes(),
            "test mismatch",
        );
    }

    #[test]
    #[should_panic(expected = "Bytes are not identical")]
    fn test_assert_bytes_eq_panics_on_mismatch() {
        assert_bytes_eq(b"hello", b"world", "test mismatch");
    }
}
