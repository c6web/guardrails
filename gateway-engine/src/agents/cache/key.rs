use sha2::{Sha256, Digest};
use serde_json::{json, Value};

pub fn normalize_request(
    app_id: &str,
    model: &str,
    messages: &Value,
    temperature: Option<f64>,
    max_tokens: Option<i32>,
    top_p: Option<f64>,
    stream: Option<bool>,
    tools: Option<&Value>,
    response_format: Option<&Value>,
    stop: Option<&Value>,
    seed: Option<i64>,
    n: Option<i64>,
    frequency_penalty: Option<f64>,
    presence_penalty: Option<f64>,
    logit_bias: Option<&Value>,
    instructions: Option<&str>,
) -> String {
    let mut canonical = json!({
        "app_id": app_id,
        "model": model,
        "messages": messages,
    });

    if let Some(t) = temperature {
        canonical["temperature"] = json!(t);
    }
    if let Some(m) = max_tokens {
        canonical["max_tokens"] = json!(m);
    }
    if let Some(p) = top_p {
        canonical["top_p"] = json!(p);
    }
    if let Some(s) = stream {
        canonical["stream"] = json!(s);
    }
    if let Some(t) = tools {
        canonical["tools"] = t.clone();
    }
    if let Some(r) = response_format {
        canonical["response_format"] = r.clone();
    }
    if let Some(s) = stop {
        canonical["stop"] = s.clone();
    }
    if let Some(s) = seed {
        canonical["seed"] = json!(s);
    }
    if let Some(n) = n {
        canonical["n"] = json!(n);
    }
    if let Some(f) = frequency_penalty {
        canonical["frequency_penalty"] = json!(f);
    }
    if let Some(p) = presence_penalty {
        canonical["presence_penalty"] = json!(p);
    }
    if let Some(l) = logit_bias {
        canonical["logit_bias"] = l.clone();
    }
    if let Some(i) = instructions {
        canonical["instructions"] = json!(i);
    }

    serde_json::to_string(&canonical).unwrap_or_default()
}

pub fn hash_request(canonical: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(canonical.as_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn compute_request_hash(
    app_id: &str,
    model: &str,
    messages: &Value,
    temperature: Option<f64>,
    max_tokens: Option<i32>,
    top_p: Option<f64>,
    stream: Option<bool>,
    tools: Option<&Value>,
    response_format: Option<&Value>,
    stop: Option<&Value>,
    seed: Option<i64>,
    n: Option<i64>,
    frequency_penalty: Option<f64>,
    presence_penalty: Option<f64>,
    logit_bias: Option<&Value>,
    instructions: Option<&str>,
) -> String {
    let canonical = normalize_request(
        app_id, model, messages,
        temperature, max_tokens, top_p,
        stream, tools, response_format, stop, seed, n,
        frequency_penalty, presence_penalty, logit_bias, instructions,
    );
    hash_request(&canonical)
}

pub fn hash_string(s: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(s.as_bytes());
    format!("{:x}", hasher.finalize())
}
