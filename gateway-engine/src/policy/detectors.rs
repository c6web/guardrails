use super::DetectorStore;
use regex::{Regex, RegexBuilder};
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::RwLock;

#[derive(sqlx::FromRow)]
struct DetectorRow {
    id:                    String,
    name:                  String,
    keywords:              Vec<String>,
    rule_type:             String,
    mode:                  Option<String>,
    framework_id:          Option<String>,
    scanning_scope:        String,
    redaction_placeholder: Option<String>,
}

pub(super) async fn load_detectors(pool: &PgPool, cache: &RwLock<Vec<super::DetectorConfig>>) {
    super::load_into_cache::<DetectorRow, super::DetectorConfig>(
        pool,
        r#"
        SELECT d.id::text, d.name, d.keywords, COALESCE(d.rule_type, 'keyword') AS rule_type,
               COALESCE(d.mode::TEXT, 'block') AS mode,
               COALESCE(d.scanning_scope, 'input') AS scanning_scope,
               d.redaction_placeholder,
               (SELECT dfm.framework_id
                FROM detector_framework_mapping dfm
                JOIN detection_frameworks df ON df.id = dfm.framework_id
                WHERE dfm.detector_id = d.id
                ORDER BY df.display_order
                LIMIT 1) AS framework_id
        FROM detectors d
        WHERE d.keywords IS NOT NULL
          AND array_length(d.keywords, 1) > 0
        ORDER BY d.name
        "#,
        "detectors",
        |r| {
            let (keywords, compiled_patterns) = if r.rule_type == "regex" {
                let mut compiled: Vec<(String, Option<Regex>)> = Vec::with_capacity(r.keywords.len());
                for p in &r.keywords {
                    match RegexBuilder::new(&format!("(?i){}", p))
                        .size_limit(10 * 1024 * 1024)
                        .dfa_size_limit(10 * 1024 * 1024)
                        .build()
                    {
                        Ok(re) => {
                            compiled.push((p.to_string(), Some(re)));
                        }
                        Err(e) => {
                            tracing::error!(
                                "[detector_loader] regex pattern failed to compile — will be a runtime no-op: detector=\"{}\" pattern=\"{}\" error=\"{}\"",
                                r.name, p, e.to_string()
                            );
                            compiled.push((p.to_string(), None));
                        }
                    }
                }
                let keywords = r.keywords.into_iter().map(|k| k.to_lowercase()).collect();
                (keywords, compiled)
            } else {
                let mut compiled: Vec<(String, Option<Regex>)> = Vec::with_capacity(r.keywords.len());
                for kw in &r.keywords {
                    match RegexBuilder::new(&format!("(?i){}", regex::escape(kw)))
                        .size_limit(10 * 1024 * 1024)
                        .dfa_size_limit(10 * 1024 * 1024)
                        .build()
                    {
                        Ok(re) => compiled.push((kw.clone(), Some(re))),
                        Err(e) => {
                            tracing::error!(
                                "[detector_loader] regex pattern failed to compile — will be a runtime no-op: detector=\"{}\" pattern=\"{}\" error=\"{}\"",
                                r.name, kw, e.to_string()
                            );
                            compiled.push((kw.clone(), None));
                        }
                    }
                }
                let keywords = r.keywords.into_iter().map(|k| k.to_lowercase()).collect::<Vec<String>>();
                (keywords, compiled)
            };
            Some(super::DetectorConfig {
                id:                    r.id,
                name:                  r.name,
                keywords,
                rule_type:             r.rule_type,
                compiled_patterns,
                mode:                  r.mode.unwrap_or_else(|| "detect".into()),
                framework_id:          r.framework_id.unwrap_or_default(),
                scanning_scope:        r.scanning_scope,
                redaction_placeholder: r.redaction_placeholder,
            })
        },
        cache,
    )
    .await;
}

#[derive(sqlx::FromRow)]
struct AppDetectorRow {
    app_id:   String,
    detector_id: String,
}

#[derive(sqlx::FromRow)]
struct AppThreatKnowledgeRow {
    app_id:              String,
    threat_knowledge_id: String,
}

pub(super) async fn load_app_security_overrides(store: &DetectorStore, pool: &PgPool) {
    let result = sqlx::query_as::<_, AppDetectorRow>(
        r#"
        SELECT app_id::text, detector_id::text
        FROM app_detector_selections
        ORDER BY app_id
        "#,
    )
    .fetch_all(pool)
    .await;

    match result {
        Ok(rows) => {
            let mut map: HashMap<String, Vec<String>> = HashMap::new();
            for row in &rows {
                map.entry(row.app_id.clone()).or_default().push(row.detector_id.clone());
            }

            // Apps with detectors_custom=true but no selection records have explicitly
            // disabled all detectors — add them with empty vecs so the engine runs nothing.
            if let Ok(custom_apps) = sqlx::query_scalar::<_, String>(
                "SELECT id::text FROM connected_apps WHERE detectors_custom = true",
            )
            .fetch_all(pool)
            .await
            {
                for app_id in &custom_apps {
                    if !map.contains_key(app_id) {
                        map.insert(app_id.clone(), Vec::new());
                    }
                }
            }

            tracing::info!("[detector_loader] loaded {} app detector overrides", map.len());
            *store.app_detector_ids.write().unwrap_or_else(|e| e.into_inner()) = map;
        }
        Err(e) => tracing::warn!("[detector_loader] app detector overrides query failed: {}", e),
    }

    let result = sqlx::query_as::<_, AppThreatKnowledgeRow>(
        r#"
        SELECT app_id::text, threat_knowledge_id::text
        FROM app_threat_knowledge_selections
        ORDER BY app_id
        "#,
    )
    .fetch_all(pool)
    .await;

    match result {
        Ok(rows) => {
            let mut map: HashMap<String, Vec<String>> = HashMap::new();
            for row in &rows {
                map.entry(row.app_id.clone()).or_default().push(row.threat_knowledge_id.clone());
            }

            // Apps with threat_knowledge_custom=true but no selection records have
            // explicitly disabled all threat knowledge — add them with empty vecs.
            if let Ok(custom_apps) = sqlx::query_scalar::<_, String>(
                "SELECT id::text FROM connected_apps WHERE threat_knowledge_custom = true",
            )
            .fetch_all(pool)
            .await
            {
                for app_id in &custom_apps {
                    if !map.contains_key(app_id) {
                        map.insert(app_id.clone(), Vec::new());
                    }
                }
            }

            tracing::info!("[detector_loader] loaded {} app threat knowledge overrides", map.len());
            *store.app_threat_knowledge_ids.write().unwrap_or_else(|e| e.into_inner()) = map;
        }
        Err(e) => tracing::warn!("[detector_loader] app threat knowledge overrides query failed: {}", e),
    }
}


