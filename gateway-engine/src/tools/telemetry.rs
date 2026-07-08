//! Observability initialisation: structured tracing + Prometheus metrics + optional OTLP export.
//!
//! Call `init()` once at startup.  Keep the returned `TelemetryGuard` alive for the
//! duration of the process — it flushes the OTel batch pipeline on drop.
//!
//! Metrics are registered in the global Prometheus default registry and can be read
//! at any time via `render_metrics()` for the `/metrics` scrape endpoint.
//!
//! OTLP trace export is activated only when `OTEL_ENABLED=true`.  All other env vars
//! use sane defaults so that the binary works without an OTel Collector present.

use prometheus::{
    register_counter, register_counter_vec, register_gauge, register_histogram_vec, Counter,
    CounterVec, Encoder, Gauge, HistogramVec, TextEncoder,
};
use std::sync::OnceLock;

// Histogram bucket upper bounds in milliseconds — covers 1 ms → 5 s.
const DURATION_BUCKETS: &[f64] = &[
    1.0, 5.0, 10.0, 25.0, 50.0, 100.0, 250.0, 500.0, 1000.0, 2500.0, 5000.0,
];

// ── Metrics registry ─────────────────────────────────────────────────────────

pub static METRICS: OnceLock<GatewayMetrics> = OnceLock::new();

pub struct GatewayMetrics {
    pub requests_total:          CounterVec,
    pub request_duration_ms:     HistogramVec,
    pub stage_duration_ms:       HistogramVec,
    pub decisions_total:         CounterVec,
    pub upstream_duration_ms:    HistogramVec,
    pub upstream_failures_total: CounterVec,
    pub classifier_duration_ms:  HistogramVec,
    pub embedding_duration_ms:   HistogramVec,
    pub ratelimit_hits_total:    CounterVec,
    /// Registered but incremented from policy loader — appears in /metrics scrape automatically.
    pub cache_reload_total:           CounterVec,
    pub t2_flagged_total:             CounterVec,
    pub cache_lookup_duration_ms:     HistogramVec,
    pub cache_decisions_total:        CounterVec,
    pub cache_write_total:            CounterVec,
    pub cache_l1_size:                Gauge,
    pub multi_turn_cache_skipped_no_user_id_total: Counter,
    pub preauth_ratelimit_hits_total: Counter,
}

impl GatewayMetrics {
    fn new() -> Self {
        GatewayMetrics {
            requests_total: register_counter_vec!(
                "gateway_requests_total",
                "Total gateway requests by route, app, HTTP status, and final_decision",
                &["route", "app_id", "status", "final_decision"]
            )
            .expect("metric registration"),

            request_duration_ms: register_histogram_vec!(
                "gateway_request_duration_ms",
                "End-to-end request duration in milliseconds",
                &["route", "app_id"],
                DURATION_BUCKETS.to_vec()
            )
            .expect("metric registration"),

            stage_duration_ms: register_histogram_vec!(
                "gateway_stage_duration_ms",
                "Pipeline stage duration in milliseconds",
                &["stage"],
                DURATION_BUCKETS.to_vec()
            )
            .expect("metric registration"),

            decisions_total: register_counter_vec!(
                "gateway_decisions_total",
                "Pipeline decisions by stage and outcome",
                &["stage", "decision"]
            )
            .expect("metric registration"),

            upstream_duration_ms: register_histogram_vec!(
                "gateway_upstream_duration_ms",
                "Upstream provider call duration in milliseconds",
                &["provider", "outcome"],
                DURATION_BUCKETS.to_vec()
            )
            .expect("metric registration"),

            upstream_failures_total: register_counter_vec!(
                "gateway_upstream_failures_total",
                "Upstream provider failures by provider name and slot",
                &["provider", "slot"]
            )
            .expect("metric registration"),

            classifier_duration_ms: register_histogram_vec!(
                "gateway_classifier_duration_ms",
                "LLM classifier call duration in milliseconds",
                &["provider", "outcome"],
                DURATION_BUCKETS.to_vec()
            )
            .expect("metric registration"),

            embedding_duration_ms: register_histogram_vec!(
                "gateway_embedding_duration_ms",
                "Embedding provider call duration in milliseconds",
                &["provider", "outcome"],
                DURATION_BUCKETS.to_vec()
            )
            .expect("metric registration"),

            ratelimit_hits_total: register_counter_vec!(
                "gateway_ratelimit_hits_total",
                "Rate limit rejections by app",
                &["app_id"]
            )
            .expect("metric registration"),

            cache_reload_total: register_counter_vec!(
                "gateway_cache_reload_total",
                "Cache reload attempts by cache name and outcome",
                &["cache", "outcome"]
            )
            .expect("metric registration"),

            t2_flagged_total: register_counter_vec!(
                "gateway_t2_flagged_total",
                "T2 intent analysis attack flags by app",
                &["app_id"]
            )
            .expect("metric registration"),

            cache_lookup_duration_ms: register_histogram_vec!(
                "gateway_cache_lookup_duration_ms",
                "Cache lookup duration in milliseconds by tier",
                &["tier"],
                vec![0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 25.0, 50.0, 100.0]
            )
            .expect("metric registration"),

            cache_decisions_total: register_counter_vec!(
                "gateway_cache_decisions_total",
                "Cache hit/miss/error decisions by tier and outcome",
                &["tier", "outcome"]
            )
            .expect("metric registration"),

            cache_write_total: register_counter_vec!(
                "gateway_cache_write_total",
                "Cache write attempts by outcome",
                &["outcome"]
            )
            .expect("metric registration"),

            cache_l1_size: register_gauge!(
                "gateway_cache_l1_size",
                "Current L1 in-memory cache entry count"
            )
            .expect("metric registration"),

            multi_turn_cache_skipped_no_user_id_total: register_counter!(
                "gateway_multi_turn_cache_skipped_no_user_id_total",
                "Multi-turn cache skipped because request lacks a user field"
            )
            .expect("metric registration"),

            preauth_ratelimit_hits_total: register_counter!(
                "gateway_preauth_ratelimit_hits_total",
                "Pre-authentication rate limit rejections"
            )
            .expect("metric registration"),
        }
    }
}

// ── Guard ────────────────────────────────────────────────────────────────────

/// Holds OTel provider handles.  Drop flushes pending spans to the collector.
pub struct TelemetryGuard {
    provider: Option<opentelemetry_sdk::trace::TracerProvider>,
}

impl Drop for TelemetryGuard {
    fn drop(&mut self) {
        if let Some(p) = self.provider.take() {
            let _ = p.shutdown();
        }
    }
}

// ── Public entry point ───────────────────────────────────────────────────────

/// Initialise tracing subscriber, Prometheus metrics, and (optionally) OTLP export.
/// Must be called once before any tracing macros or metric increments are used.
pub fn init() -> TelemetryGuard {
    METRICS.set(GatewayMetrics::new()).ok();

    let otel_enabled = std::env::var("OTEL_ENABLED")
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);

    if otel_enabled {
        init_with_otlp()
    } else {
        init_tracing_only()
    }
}

fn init_tracing_only() -> TelemetryGuard {
    use tracing_subscriber::{fmt, EnvFilter};
    use tracing_subscriber::prelude::*;

    let filter = EnvFilter::try_from_env("RUST_LOG")
        .unwrap_or_else(|_| EnvFilter::new("info"));

    let _ = tracing_subscriber::registry()
        .with(filter)
        .with(fmt::layer())
        .try_init();

    TelemetryGuard { provider: None }
}

fn init_with_otlp() -> TelemetryGuard {
    use opentelemetry::KeyValue;
    use opentelemetry_otlp::WithExportConfig;
    use opentelemetry_sdk::{Resource};
    use opentelemetry_sdk::trace as sdktrace;
    use tracing_subscriber::{fmt, EnvFilter};
    use tracing_subscriber::prelude::*;

    let endpoint = std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT")
        .unwrap_or_else(|_| "http://otel-collector:4317".to_string());

    let service_name = std::env::var("OTEL_SERVICE_NAME")
        .unwrap_or_else(|_| "gateway-engine".to_string());

    let resource = Resource::new(vec![
        KeyValue::new("service.name", service_name),
        KeyValue::new(
            "service.instance.id",
            std::env::var("GATEWAY_INSTANCE_ID").unwrap_or_default(),
        ),
        KeyValue::new(
            "deployment.environment",
            std::env::var("DEPLOYMENT_ENV").unwrap_or_else(|_| "docker".to_string()),
        ),
    ]);

    // Build OTLP span exporter using the 0.27 builder API
    let exporter = opentelemetry_otlp::SpanExporter::builder()
        .with_tonic()
        .with_endpoint(&endpoint)
        .build()
        .expect("Failed to build OTel span exporter");

    let tracer_provider = sdktrace::TracerProvider::builder()
        .with_batch_exporter(exporter, opentelemetry_sdk::runtime::Tokio)
        .with_resource(resource)
        .build();

    opentelemetry::global::set_tracer_provider(tracer_provider.clone());

    // Import the trait to call tracer()
    use opentelemetry::trace::TracerProvider as _;
    let tracer = tracer_provider.tracer("gateway-engine");

    let otel_layer = tracing_opentelemetry::layer().with_tracer(tracer);

    let filter = EnvFilter::try_from_env("RUST_LOG")
        .unwrap_or_else(|_| EnvFilter::new("info"));

    let _ = tracing_subscriber::registry()
        .with(filter)
        .with(fmt::layer().json())
        .with(otel_layer)
        .try_init();

    TelemetryGuard { provider: Some(tracer_provider) }
}

// ── Scrape helper ────────────────────────────────────────────────────────────

/// Encode all registered Prometheus metrics into the text exposition format.
pub fn render_metrics() -> String {
    let encoder = TextEncoder::new();
    let families = prometheus::gather();
    let mut buf = Vec::new();
    let _ = encoder.encode(&families, &mut buf);
    String::from_utf8(buf).unwrap_or_default()
}
