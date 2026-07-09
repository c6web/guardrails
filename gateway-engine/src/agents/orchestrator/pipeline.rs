//! Multi-layer security scanning pipeline orchestrator.
//!
//! Strict sequential state machine:
//!   Stage 1 — Keyword/Regex hard gate (cheap, deterministic)
//!   Stage 2a — Semantic search (embedding ANN)
//!   Stage 2b — LLM classifier (only on semantic match)
//!
//! LLM is authoritative: SAFE = pass through regardless of semantic hit.

use crate::agents::cache::store::ResponseCacheStore;
use crate::agents::classification::{classify, ClassifyResult};
use crate::policy::{DetectorConfig, DetectorStore};
use crate::agents::embedding::client::generate_embedding;
use crate::agents::embedding::semantic_search;
use crate::pipeline_types::{DetectorEvaluated, LayerResult, MultiTurnCacheParams, ScanSummary, SemanticMatch, TraceStage};

use regex::Regex;
use reqwest::Client;

/// Check if `keyword` appears as a whole word (with word boundaries) in `text`.
fn has_word_boundary_match(text: &str, keyword: &str) -> bool {
    if keyword.is_empty() {
        return false;
    }
    let pattern = format!(r"\b{}\b", regex::escape(keyword));
    Regex::new(&pattern).map_or_else(
        |_| text.contains(keyword),
        |re| re.is_match(text),
    )
}

/// Build the `detectors_evaluated` list from active detectors and the scan result.
/// Each detector gets outcome "hit" if it matches the winning detector name, "pass" otherwise.
fn build_detectors_evaluated(detectors: &[&DetectorConfig], hit: &LayerResult) -> Vec<DetectorEvaluated> {
    let winner = match hit {
        LayerResult::Hit { detector, .. } => Some(detector.as_str()),
        LayerResult::Safe => None,
    };
    detectors.iter().map(|d| DetectorEvaluated {
        id:           d.id.clone(),
        name:         d.name.clone(),
        framework_id: d.framework_id.clone(),
        mode:         d.mode.clone(),
        outcome:      if winner == Some(d.name.as_str()) { "hit".to_string() } else { "pass".to_string() },
    }).collect()
}

macro_rules! pipeline_info {
    ($($arg:tt)*) => { tracing::info!("{}", format!($($arg)*)) };
}

/// Run the sequential scan pipeline on a single request.
///
/// Returns a ScanSummary containing the decision, trace, and all intermediate
/// results. The caller (request_handler) enforces the decision based on app mode.
///
/// `fail_closed`: when true, embedding/classifier errors block the request instead of allowing it.
#[tracing::instrument(skip_all, fields(request_id, app_id))]
pub async fn scan_pipeline(
    client:        &Client,
    prompt_text:   &str,
    app_id:        &str,
    policy_store:  &DetectorStore,
    request_id:    &str,
    _source_ip:    &str,
    log_writer:    &crate::tools::log_writer::LogWriter,
    fail_closed:   bool,
    cache_store:   Option<&ResponseCacheStore>,
    request_hash:  Option<&str>,
    enable_response_cache: bool,
    multi_turn_params: Option<&MultiTurnCacheParams>,
    app_classifier_threshold: Option<f32>,
    app_classifier_prompt: Option<&str>,
) -> ScanSummary {
    let mut trace: Vec<TraceStage> = Vec::new();

    // ── Filter detectors by per-app selection and input scanning scope ────────
    let all_detectors = policy_store.detectors.read().unwrap_or_else(|e| e.into_inner()).clone();
    let active_detectors: Vec<&DetectorConfig> = match policy_store.app_detector_ids.read().unwrap_or_else(|e| e.into_inner()).get(app_id) {
        None      => all_detectors.iter()
                        .filter(|d| d.scanning_scope == "input" || d.scanning_scope == "both")
                        .collect(),
        Some(ids) => all_detectors.iter()
                        .filter(|d| ids.contains(&d.id) && (d.scanning_scope == "input" || d.scanning_scope == "both"))
                        .collect(),
    };
    let active_refs: Vec<&DetectorConfig> = active_detectors.into_iter().collect();

    let allowed_threat_knowledge_ids: Option<Vec<String>> =
        policy_store.app_threat_knowledge_ids.read().unwrap_or_else(|e| e.into_inner()).get(app_id).cloned();

    let emb_threshold = *policy_store.embedding_threshold.read().unwrap_or_else(|e| e.into_inner());

    // ── Stage 1 — Keyword / Regex hard gate ─────────────────────────────────
    let kw_start = std::time::Instant::now();

    let keyword_hit = scan_keyword_regex(&active_refs, prompt_text);
    let kw_ms = kw_start.elapsed().as_millis() as i64;

    if let Some(m) = crate::tools::telemetry::METRICS.get() {
        m.stage_duration_ms.with_label_values(&["keyword_regex"]).observe(kw_ms as f64);
    }

    // Determine winning keyword/regex result
    let kw_result = match &keyword_hit {
        LayerResult::Hit { .. } => keyword_hit,
        _ => LayerResult::Safe,
    };

    let kw_detectors_evaluated: Option<Vec<DetectorEvaluated>> = if active_refs.is_empty() {
        Some(Vec::new())
    } else {
        Some(build_detectors_evaluated(&active_refs, &kw_result))
    };

    match &kw_result {
        LayerResult::Hit { detector, mode, .. } if mode == "block" => {
            pipeline_info!(
                "[pipeline] {} KW_REGEX_BLOCK short-circuit detector=\"{}\" — skipping embedding/classifier",
                request_id, detector
            );
            if let Some(m) = crate::tools::telemetry::METRICS.get() {
                m.decisions_total.with_label_values(&["keyword_regex", "block"]).inc();
            }
            trace.push(TraceStage {
                stage:      "keyword_regex".to_string(),
                decision:   "block".to_string(),
                ms:         kw_ms,
                detector:   Some(detector.clone()),
                enforced:   Some(true),
                would_block: Some(true),
                detectors_evaluated: kw_detectors_evaluated.clone(),
                ..Default::default()
            });
            // Skip stages 2a and 2b — return block immediately
            return ScanSummary {
                hit:                    Some(kw_result),
                semantic_matches:       Vec::new(),
                emb_threshold,
                classifier_result:      None,
                false_positive_candidates: false,
                trace_stages:           trace,
                final_decision:         "block".to_string(),
                blocked_stage:          Some("keyword_regex".to_string()),
                t2_result:              None,
                cache_hit:              false,
                cache_tier:             None,
                cache_provider_id:      None,
                cache_tokens_in:        None,
                cache_tokens_out:       None,
                cache_response_bytes:   None,
                cache_response_headers: None,
            };
        }
        LayerResult::Hit { detector, mode, .. } if mode == "redact" => {
            // redact — record but continue through semantic/LLM/T2 (non-terminal)
            if let Some(m) = crate::tools::telemetry::METRICS.get() {
                m.decisions_total.with_label_values(&["keyword_regex", "redact"]).inc();
            }
            trace.push(TraceStage {
                stage:      "keyword_regex".to_string(),
                decision:   "redact".to_string(),
                ms:         kw_ms,
                detector:   Some(detector.clone()),
                enforced:   Some(false),
                would_block: Some(false),
                detectors_evaluated: kw_detectors_evaluated.clone(),
                ..Default::default()
            });
        }
        LayerResult::Hit { detector, mode, .. } => {
            // flag / throttle — record but continue
            if let Some(m) = crate::tools::telemetry::METRICS.get() {
                m.decisions_total.with_label_values(&["keyword_regex", mode.as_str()]).inc();
            }
            trace.push(TraceStage {
                stage:      "keyword_regex".to_string(),
                decision:   mode.clone(),
                ms:         kw_ms,
                detector:   Some(detector.clone()),
                enforced:   Some(false),
                would_block: Some(false),
                detectors_evaluated: kw_detectors_evaluated.clone(),
                ..Default::default()
            });
        }
        LayerResult::Safe => {
            if let Some(m) = crate::tools::telemetry::METRICS.get() {
                m.decisions_total.with_label_values(&["keyword_regex", "pass"]).inc();
            }
            trace.push(TraceStage {
                stage:    "keyword_regex".to_string(),
                decision: "pass".to_string(),
                ms:       kw_ms,
                detectors_evaluated: kw_detectors_evaluated.clone(),
                ..Default::default()
            });
        }
    }

    // ── CACHE LOOKUP (after Stage 1, before expensive Stage 2a) ──────────────
    // Gated on the app opt-in AND the DB-driven global admin toggle — the
    // per-app checkbox alone is not sufficient (nor is the admin toggle alone).
    if enable_response_cache && *policy_store.response_cache_enabled.read().await
        && let Some(cache_store) = cache_store
        && let Some(hash) = request_hash
    {
                let cache_start = std::time::Instant::now();
                let exact_enabled = *policy_store.response_cache_exact_enabled.read().await;

                // Try L1 (in-memory hot cache) — exact-match only, gated by the
                // exact-match sub-toggle independently of the semantic tiers.
                if exact_enabled
                    && let Some(cached) = cache_store.check_l1(app_id, hash)
                {
                        pipeline_info!(
                            "[pipeline] {} CACHE_HIT L1 — serving cached response from provider=\"{}\"",
                            request_id, cached.provider_id
                        );
                        let cache_ms = cache_start.elapsed().as_millis() as i64;
                        if let Some(m) = crate::tools::telemetry::METRICS.get() {
                            m.cache_decisions_total.with_label_values(&["l1", "hit"]).inc();
                            m.cache_lookup_duration_ms.with_label_values(&["l1"]).observe(cache_ms as f64);
                        }
                        let headers_json = cached.response_headers.as_ref()
                            .and_then(|h| serde_json::to_string(h).ok());
                        trace.push(TraceStage {
                            stage:    "cache_lookup".to_string(),
                            decision: "l1_hit".to_string(),
                            ms:       cache_ms,
                            ..Default::default()
                        });
                        return ScanSummary {
                            hit:                    None,
                            semantic_matches:       Vec::new(),
                            emb_threshold,
                            classifier_result:      None,
                            false_positive_candidates: false,
                            trace_stages:           trace,
                            final_decision:         "allow".to_string(),
                            blocked_stage:          None,
                            t2_result:              None,
                            cache_hit:              true,
                            cache_tier:             Some("l1".to_string()),
                            cache_provider_id:      Some(cached.provider_id.clone()),
                            cache_tokens_in:        Some(cached.tokens_in),
                            cache_tokens_out:       Some(cached.tokens_out),
                            cache_response_bytes:   Some(cached.response_bytes.clone()),
                            cache_response_headers: headers_json,
                        };
                    }

                // Try L2 (Postgres exact-match)
                if let Some(pool) = cache_store.l2_pool() {
                    let looked_up = if exact_enabled {
                        crate::agents::cache::lookup::lookup_exact(
                            pool, app_id, hash, cache_store.lookup_timeout_ms(),
                        ).await
                    } else {
                        None
                    };
                    if let Some(cached) = looked_up {
                        pipeline_info!(
                            "[pipeline] {} CACHE_HIT L2 — serving cached response from provider=\"{}\"",
                            request_id, cached.provider_id
                        );
                        // Populate L1 for future requests
                        cache_store.insert_l1(app_id.to_string(), hash.to_string(), cached.clone());
                        let cache_ms = cache_start.elapsed().as_millis() as i64;
                        if let Some(m) = crate::tools::telemetry::METRICS.get() {
                            m.cache_decisions_total.with_label_values(&["l2_exact", "hit"]).inc();
                            m.cache_lookup_duration_ms.with_label_values(&["l2_exact"]).observe(cache_ms as f64);
                        }
                        let headers_json = cached.response_headers.as_ref()
                            .and_then(|h| serde_json::to_string(h).ok());
                        trace.push(TraceStage {
                            stage:    "cache_lookup".to_string(),
                            decision: "l2_exact_hit".to_string(),
                            ms:       cache_ms,
                            ..Default::default()
                        });
                        return ScanSummary {
                            hit:                    None,
                            semantic_matches:       Vec::new(),
                            emb_threshold,
                            classifier_result:      None,
                            false_positive_candidates: false,
                            trace_stages:           trace,
                            final_decision:         "allow".to_string(),
                            blocked_stage:          None,
                            t2_result:              None,
                            cache_hit:              true,
                            cache_tier:             Some("l2_exact".to_string()),
                            cache_provider_id:      Some(cached.provider_id.clone()),
                            cache_tokens_in:        Some(cached.tokens_in),
                            cache_tokens_out:       Some(cached.tokens_out),
                            cache_response_bytes:   Some(cached.response_bytes.clone()),
                            cache_response_headers: headers_json,
                        };
                    }

                    // Try L2 semantic lookup if exact match missed
                    if *policy_store.response_cache_semantic_enabled.read().await && !prompt_text.is_empty() {
                        let emb_provs = policy_store.embedding_providers.read().unwrap_or_else(|e| e.into_inner()).clone();
                        if !emb_provs.is_empty() {
                            match generate_embedding(client, &emb_provs, prompt_text).await {
                                Ok(emb) => {
                                    let threshold = *policy_store.response_cache_threshold.read().await;
                                    let cache_semantic_hits = crate::agents::cache::semantic::search_semantic_single_turn(
                                        pool, app_id, &emb, threshold, 1, cache_store.lookup_timeout_ms(),
                                    ).await;
                                    if let Some(hit) = cache_semantic_hits.into_iter().next() {
                                        pipeline_info!(
                                            "[pipeline] {} CACHE_HIT L2_SEMANTIC — serving cached response from provider=\"{}\"",
                                            request_id, hit.provider_id
                                        );
                                        cache_store.insert_l1(app_id.to_string(), hit.request_hash.clone(), hit.clone());
                                        let cache_ms = cache_start.elapsed().as_millis() as i64;
                                        if let Some(m) = crate::tools::telemetry::METRICS.get() {
                                            m.cache_decisions_total.with_label_values(&["l2_semantic", "hit"]).inc();
                                            m.cache_lookup_duration_ms.with_label_values(&["l2_semantic"]).observe(cache_ms as f64);
                                        }
                                        let headers_json = hit.response_headers.as_ref()
                                            .and_then(|h| serde_json::to_string(h).ok());
                                        trace.push(TraceStage {
                                            stage:    "cache_lookup".to_string(),
                                            decision: "l2_semantic_hit".to_string(),
                                            ms:       cache_ms,
                                            ..Default::default()
                                        });
                                        return ScanSummary {
                                            hit:                    None,
                                            semantic_matches:       Vec::new(),
                                            emb_threshold,
                                            classifier_result:      None,
                                            false_positive_candidates: false,
                                            trace_stages:           trace,
                                            final_decision:         "allow".to_string(),
                                            blocked_stage:          None,
                                            t2_result:              None,
                                            cache_hit:              true,
                                            cache_tier:             Some("l2_semantic".to_string()),
                                            cache_provider_id:      Some(hit.provider_id.clone()),
                                            cache_tokens_in:        Some(hit.tokens_in),
                                            cache_tokens_out:       Some(hit.tokens_out),
                                            cache_response_bytes:   Some(hit.response_bytes.clone()),
                                            cache_response_headers: headers_json,
                                        };
                                    }
                                }
                                Err(_) => {
                                    // Embedding failure is a cache miss, not a request failure
                                }
                            }

                            // Try multi-turn semantic lookup after single-turn miss
                            if let Some(mt) = multi_turn_params
                                && mt.enabled && !mt.latest_user_message.is_empty()
                            {
                                    match generate_embedding(client, &emb_provs, &mt.latest_user_message).await {
                                        Ok(mt_emb) => {
                                            let mt_threshold = *policy_store.response_cache_threshold.read().await;
                                            let cache_mt_hits = crate::agents::cache::semantic::search_semantic_multi_turn(
                                                pool, app_id, &mt_emb, mt_threshold,
                                                &mt.system_prompt_hash, &mt.end_user_id,
                                                Some(mt.turn_index), 1, cache_store.lookup_timeout_ms(),
                                            ).await;
                                            if let Some(hit) = cache_mt_hits.into_iter().next() {
                                                pipeline_info!(
                                                    "[pipeline] {} CACHE_HIT L2_MULTI_TURN_SEMANTIC — serving cached response from provider=\"{}\"",
                                                    request_id, hit.provider_id
                                                );
                                                cache_store.insert_l1(app_id.to_string(), hit.request_hash.clone(), hit.clone());
                                                let cache_ms = cache_start.elapsed().as_millis() as i64;
                                                if let Some(m) = crate::tools::telemetry::METRICS.get() {
                                                    m.cache_decisions_total.with_label_values(&["l2_multi_turn_semantic", "hit"]).inc();
                                                    m.cache_lookup_duration_ms.with_label_values(&["l2_multi_turn_semantic"]).observe(cache_ms as f64);
                                                }
                                                let headers_json = hit.response_headers.as_ref()
                                                    .and_then(|h| serde_json::to_string(h).ok());
                                                trace.push(TraceStage {
                                                    stage:    "cache_lookup".to_string(),
                                                    decision: "l2_multi_turn_semantic_hit".to_string(),
                                                    ms:       cache_ms,
                                                    ..Default::default()
                                                });
                                                return ScanSummary {
                                                    hit:                    None,
                                                    semantic_matches:       Vec::new(),
                                                    emb_threshold:          0.0,
                                                    classifier_result:      None,
                                                    false_positive_candidates: false,
                                                    trace_stages:           trace,
                                                    final_decision:         "allow".to_string(),
                                                    blocked_stage:          None,
                                                    t2_result:              None,
                                                    cache_hit:              true,
                                                    cache_tier:             Some("l2_multi_turn_semantic".to_string()),
                                                    cache_provider_id:      Some(hit.provider_id.clone()),
                                                    cache_tokens_in:        Some(hit.tokens_in),
                                                    cache_tokens_out:       Some(hit.tokens_out),
                                                    cache_response_bytes:   Some(hit.response_bytes.clone()),
                                                    cache_response_headers: headers_json,
                                                };
                                            }
                                        }
                                        Err(_) => {
                                            // Embedding failure is a cache miss, not a request failure
                                        }
                                    }
                                }
                            }
                        }
                    }

                // Cache miss — record timing and continue
                let cache_ms = cache_start.elapsed().as_millis() as i64;
                trace.push(TraceStage {
                    stage:    "cache_lookup".to_string(),
                    decision: "miss".to_string(),
                    ms:       cache_ms,
                    ..Default::default()
                });
    }

    // ── Stage 2a — Semantic search ───────────────────────────────────────────
    let emb_provs = policy_store.embedding_providers.read().unwrap_or_else(|e| e.into_inner()).clone();

    if emb_provs.is_empty() || prompt_text.is_empty() {
        trace.push(TraceStage {
            stage:    "semantic".to_string(),
            decision: "skipped".to_string(),
            ms:       0,
            ..Default::default()
        });
        trace.push(TraceStage {
            stage:    "llm_classify".to_string(),
            decision: "skipped".to_string(),
            ms:       0,
            ..Default::default()
        });
        return allow_summary(kw_result, emb_threshold, trace);
    }

    let sem_start = std::time::Instant::now();
    let embed_result = generate_embedding(client, &emb_provs, prompt_text).await;
    let sem_ms = sem_start.elapsed().as_millis() as i64;

    let prompt_emb = match embed_result {
        Ok(emb) => {
            let prov = &emb_provs[0];
            if let Some(m) = crate::tools::telemetry::METRICS.get() {
                m.embedding_duration_ms.with_label_values(&[&prov.name, "ok"]).observe(sem_ms as f64);
            }
            log_writer.log_embedding(
                Some(request_id),
                &prov.id, &prov.name,
                prov.model.as_deref(),
                prompt_text.len() as i32,
                Some(prompt_text),
                Some(emb.len() as i32),
                true, None, sem_ms, "pipeline",
            );
            emb
        }
        Err(e) => {
            let prov = &emb_provs[0];
            if let Some(m) = crate::tools::telemetry::METRICS.get() {
                m.embedding_duration_ms.with_label_values(&[&prov.name, "error"]).observe(sem_ms as f64);
            }
            log_writer.log_embedding(
                Some(request_id),
                &prov.id, &prov.name,
                prov.model.as_deref(),
                prompt_text.len() as i32,
                Some(prompt_text),
                None, false,
                Some(e.as_str()),
                sem_ms, "pipeline",
            );
            if fail_closed {
                pipeline_info!("[pipeline] {} SEMANTIC_EMBED_FAILED (fail closed): {}", request_id, e);
            } else {
                pipeline_info!("[pipeline] {} SEMANTIC_EMBED_FAILED (fail open): {}", request_id, e);
            }
            trace.push(TraceStage {
                stage:    "semantic".to_string(),
                decision: "error".to_string(),
                ms:       sem_ms,
                reason:   Some(format!("{}: {}", prov.name, e)),
                ..Default::default()
            });
            trace.push(TraceStage {
                stage:    "llm_classify".to_string(),
                decision: "skipped".to_string(),
                ms:       0,
                ..Default::default()
            });
            if fail_closed {
                return block_on_scan_error("embedding_error", kw_result, emb_threshold, trace);
            }
            return allow_summary(kw_result, emb_threshold, trace);
        }
    };

    let search_start = std::time::Instant::now();
    let hits_result = semantic_search::search_threats(
        &policy_store.db_pool,
        &prompt_emb,
        emb_threshold,
        5,
        allowed_threat_knowledge_ids.as_deref(),
        false,
    ).await;
    let search_ms = search_start.elapsed().as_millis() as i64;

    let semantic_matches: Vec<SemanticMatch> = match hits_result {
        Ok(hits) if hits.is_empty() => {
            if let Some(m) = crate::tools::telemetry::METRICS.get() {
                m.stage_duration_ms.with_label_values(&["semantic"]).observe((sem_ms + search_ms) as f64);
                m.decisions_total.with_label_values(&["semantic", "no_match"]).inc();
            }
            trace.push(TraceStage {
                stage:     "semantic".to_string(),
                decision:  "no_match".to_string(),
                ms:        sem_ms + search_ms,
                threshold: Some(emb_threshold),
                ..Default::default()
            });
            trace.push(TraceStage {
                stage:    "llm_classify".to_string(),
                decision: "skipped".to_string(),
                ms:       0,
                ..Default::default()
            });
            return allow_summary(kw_result, emb_threshold, trace);
        }
        Ok(hits) => {
            if let Some(m) = crate::tools::telemetry::METRICS.get() {
                m.stage_duration_ms.with_label_values(&["semantic"]).observe((sem_ms + search_ms) as f64);
                m.decisions_total.with_label_values(&["semantic", "match"]).inc();
            }
            let mut semantic_matches_tmp: Vec<SemanticMatch> = Vec::new();
            for hit in &hits {
                pipeline_info!(
                    "[pipeline] {} SEMANTIC_MATCH entry=\"{}\" similarity={:.3} threshold={:.2}",
                    request_id, hit.name, hit.similarity, emb_threshold
                );
                semantic_matches_tmp.push(SemanticMatch {
                    id:         hit.id.clone(),
                    name:       hit.name.clone(),
                    similarity: hit.similarity,
                });
            }
            trace.push(TraceStage {
                stage:     "semantic".to_string(),
                decision:  "match".to_string(),
                ms:        sem_ms + search_ms,
                threshold: Some(emb_threshold),
                matches:   semantic_matches_tmp.clone(),
                ..Default::default()
            });
            semantic_matches_tmp
        }
        Err(e) => {
            if fail_closed {
                pipeline_info!("[pipeline] {} SEMANTIC_SEARCH_ERROR (fail closed): {}", request_id, e);
            } else {
                pipeline_info!("[pipeline] {} SEMANTIC_SEARCH_ERROR (fail open): {}", request_id, e);
            }
            if let Some(m) = crate::tools::telemetry::METRICS.get() {
                m.stage_duration_ms.with_label_values(&["semantic"]).observe((sem_ms + search_ms) as f64);
                m.decisions_total.with_label_values(&["semantic", "error"]).inc();
            }
            trace.push(TraceStage {
                stage:     "semantic".to_string(),
                decision:  "error".to_string(),
                ms:        sem_ms + search_ms,
                threshold: Some(emb_threshold),
                reason:    Some(e.to_string()),
                ..Default::default()
            });
            if fail_closed {
                trace.push(TraceStage {
                    stage:    "llm_classify".to_string(),
                    decision: "skipped".to_string(),
                    ms:       0,
                    ..Default::default()
                });
                return block_on_scan_error("semantic_search_error", kw_result, emb_threshold, trace);
            }
            Vec::new()
        }
    };

    // ── Stage 2b — LLM classifier ────────────────────────────────────────────
    let classifier_cfg = policy_store.classifier_provider.read().unwrap_or_else(|e| e.into_inner()).clone();

    if classifier_cfg.is_none() {
        tracing::warn!(
            "[pipeline] {} NO_CLASSIFIER_PROVIDER_CONFIGURED — detection degraded to keyword-only{}",
            request_id,
            if fail_closed { ", blocking request" } else { "" }
        );
        if let Some(m) = crate::tools::telemetry::METRICS.get() {
            m.decisions_total.with_label_values(&["llm_classify", "skipped_no_classifier"]).inc();
        }
        trace.push(TraceStage {
            stage:    "llm_classify".to_string(),
            decision: "skipped_no_classifier".to_string(),
            ms:       0,
            reason:   Some("No classifier provider configured - detection degraded to keyword-only".to_string()),
            ..Default::default()
        });
        if fail_closed {
            return block_on_scan_error("no_classifier_provider", kw_result, emb_threshold, trace);
        }
        return allow_summary_with_matches(kw_result, semantic_matches, emb_threshold, false, None, trace);
    }

    // Per-app override (connected_apps.classifier_threshold / classifier_prompt);
    // null on the app falls back to the global classifier config.
    let threshold = app_classifier_threshold
        .unwrap_or_else(|| *policy_store.classifier_threshold.read().unwrap_or_else(|e| e.into_inner()));
    let mut system_prompt = app_classifier_prompt
        .map(|s| s.to_string())
        .unwrap_or_else(|| policy_store.classifier_system_prompt.read().unwrap_or_else(|e| e.into_inner()).clone());

    // Inject matched threat knowledge context into classifier system prompt
    if !semantic_matches.is_empty() {
        system_prompt.push_str("\n\n=== THREAT KNOWLEDGE CONTEXT ===\n");
        for m in &semantic_matches {
            let sanitized_name = m.name.replace(['\r', '\n', '\t'], " ");
            system_prompt.push_str(&format!("  - Knowledge entry: {} (similarity: {:.2}%)\n", sanitized_name, m.similarity * 100.0));
        }
        system_prompt.push_str("\nUse this context to evaluate whether the prompt is a known attack variant.\n");
    }

    let llm_start = std::time::Instant::now();
    let classify_result = classify(
        client,
        prompt_text,
        classifier_cfg.as_ref(),
        threshold,
        &system_prompt,
        log_writer,
        Some(request_id),
        policy_store,
        app_id,
    ).await;
    let llm_ms = llm_start.elapsed().as_millis() as i64;

    // Record classifier duration against the provider name when available
    if let Some(m) = crate::tools::telemetry::METRICS.get() {
        let prov_name = classifier_cfg.as_ref().map(|p| p.name.as_str()).unwrap_or("none");
        let outcome = if classify_result.is_err() { "error" } else { "ok" };
        m.stage_duration_ms.with_label_values(&["llm_classify"]).observe(llm_ms as f64);
        m.classifier_duration_ms.with_label_values(&[prov_name, outcome]).observe(llm_ms as f64);
    }

    match classify_result {
        Err(e) => {
            if let Some(m) = crate::tools::telemetry::METRICS.get() {
                m.decisions_total.with_label_values(&["llm_classify", "error"]).inc();
            }
            if fail_closed {
                pipeline_info!("[pipeline] {} CLASSIFIER_ERROR (fail closed): {}", request_id, e);
            } else {
                pipeline_info!("[pipeline] {} CLASSIFIER_ERROR (fail open): {}", request_id, e);
            }
            trace.push(TraceStage {
                stage:    "llm_classify".to_string(),
                decision: "error".to_string(),
                ms:       llm_ms,
                reason:   Some(format!(
                    "{}: {}",
                    classifier_cfg.as_ref().map(|p| p.name.as_str()).unwrap_or("classifier"),
                    e
                )),
                ..Default::default()
            });
            if fail_closed {
                block_on_scan_error("classifier_error", kw_result, emb_threshold, trace)
            } else {
                allow_summary_with_matches(kw_result, semantic_matches, emb_threshold, false, None, trace)
            }
        }
        Ok(mut result) => {
            // Validate framework_id against known frameworks
            if !result.framework_id.is_empty() {
                let valid = policy_store.framework_store.read().unwrap_or_else(|e| e.into_inner()).as_ref()
                    .map(|fs| fs.is_valid_id(&result.framework_id))
                    .unwrap_or(false);
                if !valid {
                    tracing::warn!("[pipeline] {} classifier returned unknown framework_id=\"{}\" — reset to OTHER", request_id, result.framework_id);
                    result.framework_id = "OTHER".to_string();
                }
            }
            if result.is_attack {
                pipeline_info!(
                    "[pipeline] {} CLASSIFIER_ATTACK framework_id={} confidence={:.2} reason=\"{}\"",
                    request_id, result.framework_id, result.confidence, result.reason
                );
                if let Some(m) = crate::tools::telemetry::METRICS.get() {
                    m.decisions_total.with_label_values(&["llm_classify", "attack"]).inc();
                }
                trace.push(TraceStage {
                     stage:      "llm_classify".to_string(),
                    decision:   "attack".to_string(),
                    ms:         llm_ms,
                    framework_id:   Some(result.framework_id.clone()),
                    confidence: Some(result.confidence),
                    reason:     Some(result.reason.clone()),
                    enforced:   Some(true),
                    would_block: Some(true),
                    ..Default::default()
                });
                let hit = LayerResult::Hit {
                    detector:     "classifier".to_string(),
                    mode:         "block".to_string(),
                    confidence:   Some(result.confidence),
                    reason:       Some(result.reason.clone()),
                    excerpt:      None,

                    framework_id: result.framework_id.clone(),
                    placeholder:  None,
                };
                ScanSummary {
                    hit:                    Some(hit),
                    semantic_matches,
                    emb_threshold,
                    classifier_result:      Some(result),
                    false_positive_candidates: false,
                    trace_stages:           trace,
                    final_decision:         "block".to_string(),
                    blocked_stage:          Some("semantic_llm".to_string()),
                    t2_result:              None,
                    cache_hit:              false,
                    cache_tier:             None,
                    cache_provider_id:      None,
                    cache_tokens_in:        None,
                    cache_tokens_out:       None,
                    cache_response_bytes:   None,
                    cache_response_headers: None,
                }
            } else {
                // LLM is authoritative — SAFE = pass through
                if let Some(m) = crate::tools::telemetry::METRICS.get() {
                    m.decisions_total.with_label_values(&["llm_classify", "safe"]).inc();
                }
                pipeline_info!("[pipeline] {} CLASSIFIER_SAFE confidence={:.2} reason=\"{}\" (false-positive candidate)", request_id, result.confidence, result.reason);
                trace.push(TraceStage {
                    stage:      "llm_classify".to_string(),
                    decision:   "safe".to_string(),
                    ms:         llm_ms,
                    confidence: Some(result.confidence),
                    reason:     Some(result.reason.clone()),
                    enforced:   Some(false),
                    would_block: Some(false),
                    ..Default::default()
                });
                allow_summary_with_matches(kw_result, semantic_matches, emb_threshold, true, Some(result), trace)
            }
        }
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Build a block ScanSummary when a scan stage errored and fail_closed is enabled.
fn block_on_scan_error(reason: &str, _kw_result: LayerResult, emb_threshold: f32, trace: Vec<TraceStage>) -> ScanSummary {
    let hit = LayerResult::Hit {
        detector:    reason.to_string(),
        mode:        "block".to_string(),
        confidence:  None,
        reason:      Some(format!("Scan stage error (fail-closed): {}", reason)),
        excerpt:     None,
        framework_id: "OTHER".to_string(),
        placeholder: None,
    };
    ScanSummary {
        hit:                    Some(hit),
        semantic_matches:       Vec::new(),
        emb_threshold,
        classifier_result:      None,
        false_positive_candidates: false,
        trace_stages:           trace,
        final_decision:         "block".to_string(),
        blocked_stage:          Some("scan_error".to_string()),
        t2_result:              None,
        cache_hit:              false,
        cache_tier:             None,
        cache_provider_id:      None,
        cache_tokens_in:        None,
        cache_tokens_out:       None,
        cache_response_bytes:   None,
        cache_response_headers: None,
    }
}

/// Build an allow ScanSummary (no semantic matches).
fn allow_summary(kw_result: LayerResult, emb_threshold: f32, trace: Vec<TraceStage>) -> ScanSummary {
    let is_redact_hit = matches!(&kw_result, LayerResult::Hit { mode, .. } if mode == "redact");
    ScanSummary {
        hit: Some(kw_result),
        semantic_matches: Vec::new(),
        emb_threshold,
        classifier_result: None,
        false_positive_candidates: false,
        trace_stages: trace,
        final_decision: if is_redact_hit { "redacted" } else { "allow" }.to_string(),
        blocked_stage: None,
        t2_result: None,
        cache_hit: false,
        cache_tier: None,
        cache_provider_id: None,
        cache_tokens_in: None,
        cache_tokens_out: None,
        cache_response_bytes: None,
        cache_response_headers: None,
    }
}

/// Build an allow ScanSummary with semantic matches (LLM said safe or no classifier).
fn allow_summary_with_matches(
    kw_result:               LayerResult,
    semantic_matches:        Vec<SemanticMatch>,
    emb_threshold:           f32,
    false_positive_candidates: bool,
    classifier_result:       Option<ClassifyResult>,
    trace:                   Vec<TraceStage>,
) -> ScanSummary {
    let is_redact_hit = matches!(&kw_result, LayerResult::Hit { mode, .. } if mode == "redact");
    ScanSummary {
        hit: Some(kw_result),
        semantic_matches,
        emb_threshold,
        classifier_result,
        false_positive_candidates,
        trace_stages: trace,
        final_decision: if is_redact_hit { "redacted" } else { "allow" }.to_string(),
        blocked_stage: None,
        t2_result: None,
        cache_hit: false,
        cache_tier: None,
        cache_provider_id: None,
        cache_tokens_in: None,
        cache_tokens_out: None,
        cache_response_bytes: None,
        cache_response_headers: None,
    }
}

/// Layer 1: Run keyword and regex detectors against the prompt.
/// Collects all hits and applies mode precedence (block > redact > flag).
/// Exported and re-used by pipeline.rs / provider_test_handler.
pub fn scan_keyword_regex(detectors: &[&DetectorConfig], prompt: &str) -> LayerResult {
    let lower = prompt.to_lowercase();

    // Collect best hit per precedence tier — check ALL detectors before deciding.
    let mut block_hit:       Option<LayerResult> = None;
    let mut redact_hit:      Option<LayerResult> = None;
    let mut first_other_hit: Option<LayerResult> = None; // flag / throttle

    for d in detectors {
        if d.rule_type == "regex" {
            for (_, re_opt) in d.compiled_patterns.iter() {
                if let Some(re) = re_opt
                    && let Some(m) = re.find(prompt) {
                        let matched: String = m.as_str().chars().take(120).collect();
                        let placeholder = d.redaction_placeholder.clone()
                            .unwrap_or_else(|| "[REDACTED]".to_string());
                        match d.mode.as_str() {
                            "block" => {
                                if block_hit.is_none() {
                                    block_hit = Some(LayerResult::Hit {
                                        detector:    d.name.clone(),
                                        mode:        "block".to_string(),
                                        confidence:  None,
                                        reason:      Some("Block-mode detector matched".to_string()),
                                        excerpt:     Some(matched),
                                        framework_id: d.framework_id.clone(),
                                        placeholder: None,
                                    });
                                }
                            }
                            "redact" => {
                                if redact_hit.is_none() {
                                    redact_hit = Some(LayerResult::Hit {
                                        detector:    d.name.clone(),
                                        mode:        "redact".to_string(),
                                        confidence:  None,
                                        reason:      Some("Redact-mode detector matched".to_string()),
                                        excerpt:     Some(matched),
                                        framework_id: d.framework_id.clone(),
                                        placeholder: Some(placeholder),
                                    });
                                }
                            }
                            mode => {
                                if first_other_hit.is_none() {
                                    first_other_hit = Some(LayerResult::Hit {
                                        detector:    d.name.clone(),
                                        mode:        mode.to_string(),
                                        confidence:  None,
                                        reason:      Some(format!("{}-mode detector matched", mode)),
                                        excerpt:     Some(matched),
                                        framework_id: d.framework_id.clone(),
                                        placeholder: None,
                                    });
                                }
                            }
                        }
                        break; // one match per detector is enough for mode precedence
                    }
            }
        } else {
            for kw in &d.keywords {
                if has_word_boundary_match(&lower, &kw.to_lowercase()) {
                    match d.mode.as_str() {
                        "block" => {
                            if block_hit.is_none() {
                                block_hit = Some(LayerResult::Hit {
                                    detector:    d.name.clone(),
                                    mode:        "block".to_string(),
                                    confidence:  None,
                                    reason:      Some("Block-mode detector matched".to_string()),
                                    excerpt:     Some(kw.chars().take(120).collect()),
                                    framework_id: d.framework_id.clone(),
                                    placeholder: None,
                                });
                            }
                        }
                        "redact" => {
                            if redact_hit.is_none() {
                                let placeholder = d.redaction_placeholder.clone()
                                    .unwrap_or_else(|| "[REDACTED]".to_string());
                                redact_hit = Some(LayerResult::Hit {
                                    detector:    d.name.clone(),
                                    mode:        "redact".to_string(),
                                    confidence:  None,
                                    reason:      Some("Redact-mode detector matched".to_string()),
                                    excerpt:     Some(kw.chars().take(120).collect()),
                                    framework_id: d.framework_id.clone(),
                                    placeholder: Some(placeholder),
                                });
                            }
                        }
                        mode => {
                            if first_other_hit.is_none() {
                                first_other_hit = Some(LayerResult::Hit {
                                    detector:    d.name.clone(),
                                    mode:        mode.to_string(),
                                    confidence:  None,
                                    reason:      Some(format!("{}-mode detector matched", mode)),
                                    excerpt:     Some(kw.chars().take(120).collect()),
                                    framework_id: d.framework_id.clone(),
                                    placeholder: None,
                                });
                            }
                        }
                    }
                    break;
                }
            }
        }
    }

    // Apply mode precedence: block > redact > flag
    block_hit
        .or(redact_hit)
        .or(first_other_hit)
        .unwrap_or(LayerResult::Safe)
}
