//! Embedding generation with provider fallback chain.
//!
//! Vendor-specific URL, header, body and response logic lives in the per-vendor
//! adapters under `embedding_adapters` — this module only handles the HTTP call
//! and the retry/fallback loop.

use reqwest::Client;
use serde_json::Value;
use crate::adapters::embedding::adapter_for;

// ── Provider config ───────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub(crate) struct EmbeddingProviderConfig {
    pub id:              String,
    pub name:            String,
    pub endpoint:        String,
    pub api_key:         Option<String>,
    pub model:           Option<String>,
    pub vendor:          String,
    pub dimensions:      Option<i32>,
    pub timeout_ms:      u64,
    pub provider:        Option<String>,    // OpenRouter passthrough
    pub allow_fallbacks: Option<bool>,
    pub data_collection: Option<String>,
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Generate an embedding by trying each provider in order (primary → backups).
/// Returns the first successful result; fails only when all providers fail.
pub async fn generate_embedding(
    client:    &Client,
    providers: &[EmbeddingProviderConfig],
    text:      &str,
) -> Result<Vec<f32>, String> {
    if providers.is_empty() {
        return Err("no embedding providers configured".to_string());
    }

    let mut last_err = String::new();

    for (i, provider) in providers.iter().enumerate() {
        let slot = match i { 0 => "primary", 1 => "backup1", _ => "backup2" };
        match call_provider(client, provider, text).await {
            Ok(emb) => {
                tracing::info!("[embed] {} OK provider=\"{}\" dims={}", slot, provider.name, emb.len());
                return Ok(emb);
            }
            Err(e) => {
                tracing::warn!("[embed] {} FAIL provider=\"{}\" error={}", slot, provider.name, e);
                last_err = e;
            }
        }
    }

    Err(format!("all embedding providers failed — last error: {}", last_err))
}

// ── Internal call (adapter-driven) ───────────────────────────────────────────

async fn call_provider(
    client:   &Client,
    provider: &EmbeddingProviderConfig,
    text:     &str,
) -> Result<Vec<f32>, String> {
    // Request-time DNS re-validation to prevent DNS-rebinding SSRF.
    if !crate::policy::endpoint_validation::revalidate_endpoint(&provider.endpoint).await {
        return Err(format!(
            "Embedding provider \"{}\" endpoint failed DNS re-validation (potential SSRF)",
            provider.name
        ));
    }

    // Vendor-host binding: the endpoint host must match the vendor's domain.
    if !crate::policy::endpoint_validation::verify_vendor_host(&provider.endpoint, &provider.vendor) {
        return Err(format!(
            "Embedding provider \"{}\" endpoint host does not match vendor \"{}\"",
            provider.name, provider.vendor
        ));
    }

    let adapter = adapter_for(provider);
    let base    = provider.endpoint.trim_end_matches('/');
    let url     = format!("{}{}", base, adapter.endpoint_path(provider));
    let body    = adapter.build_body(provider, text);

    // Build request with vendor-specific headers
    let mut req = client.post(&url).body(serde_json::to_vec(&body).unwrap_or_default());
    for (name, value) in adapter.build_headers(provider) {
        req = req.header(name, value);
    }
    if provider.timeout_ms > 0 {
        req = req.timeout(std::time::Duration::from_millis(provider.timeout_ms));
    }

    let resp = req.send().await.map_err(|e| format!("request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body   = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {} from {} adapter: {}", status, adapter.vendor(), body.chars().take(200).collect::<String>()));
    }

    let data: Value = resp.json().await.map_err(|e| format!("invalid JSON response: {}", e))?;
    adapter.parse_response(&data)
}

