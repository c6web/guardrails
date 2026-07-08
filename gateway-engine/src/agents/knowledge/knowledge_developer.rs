//! Knowledge Developer agent.
//!
//! When T2 detects a novel attack, this agent is spawned in the background to
//! abstract the attack into a reusable threat knowledge entry and persist it
//! in the `threat_knowledge` table with `status = 'pending'` and `source = 'agent'`.
//!
//! Steps:
//!   1. Load embedding providers and classifier provider.
//!   2. LLM call to abstract / generalise the attack (produce name, description, threat_context).
//!   3. Parse and validate the JSON response.
//!   4. Generate embedding for the produced `threat_context`.
//!   5. Dedup search — semantic search (platform threshold) of the threat_context
//!      embedding against `active` AND `pending` entries.
//!   6. If similar entries are found, ask the LLM to judge true-duplicate vs.
//!      distinct. Duplicate (or a failed/unparseable judgement — fail closed)
//!      skips creation. No hits, or judged distinct, proceeds.
//!   7. Insert into `threat_knowledge`.
//!
//! Fail-open for transport/provider errors, fail-closed for dedup-judgement
//! errors (favors not creating a possible duplicate over an LLM outage).

use crate::agents::classification::{llm_complete, strip_code_fence};
use crate::agents::embedding::client::generate_embedding;
use crate::agents::embedding::semantic_search::{search_threats, SemanticHit};
use crate::policy::DetectorStore;
use crate::tools::knowledge_writer::insert_threat_knowledge;
use pgvector::Vector;
use reqwest::Client;
use serde_json::Value;
use sqlx::PgPool;

const DEDUP_TOP_K: usize = 3;

pub const KNOWLEDGE_DEDUP_SYSTEM_PROMPT: &str = "\
You are a security knowledge engineer reviewing potential duplicate threat \
knowledge entries. You receive a newly generated threat knowledge entry and one or more \
EXISTING threat knowledge entries that are semantically similar to it. \
Decide whether the new entry is a TRUE DUPLICATE of an existing entry \
(same underlying technique/pattern, just phrased differently) or DISTINCT \
enough to warrant its own new entry (different technique, different intent, \
or meaningfully extends the existing pattern).

Reply with JSON only — no markdown, no explanation outside the JSON:
{\"is_duplicate\":true|false,\"matched_id\":\"...\",\"reason\":\"one sentence under 20 words\"}";

pub const KNOWLEDGE_DEV_SYSTEM_PROMPT: &str = "\
You are a security knowledge engineer. You receive a malicious AI prompt and the reason \
it was flagged as an attack. Your task is to create a threat knowledge entry for \
SEMANTIC SEARCH matching — the \"threat_context\" field gets converted to an embedding \
vector and compared against incoming attack prompts via cosine similarity. If the \
threat_context is written in a different linguistic style than real attacks, \
the system will fail to detect them.

CRITICAL — the threat_context must read like a REAL ATTACK PROMPT, not an analyst's \
description of one. Write in the attacker's own voice, using the same kind of language \
an actual attacker would use.

Rules:
- Rewrite the attack into a representative example prompt (3-8 sentences) that captures \
  the same technique. Preserve the original's linguistic style, vocabulary, sentence \
  structure, and rhetorical framing (fiction writing, role-play, academic pretense, \
  debugging help, etc.). Write from the first-person attacker's perspective — as if \
  the attacker were retrying with slightly different wording.
- Do NOT rewrite into third-person security-report language. Avoid phrases like \
  \"A user asks...\" or \"The attacker attempts...\" or \"The prompt requests...\"
- Name: concise label for the attack pattern (5-10 words)
- Description: explain the attack technique (2-4 sentences)
- Strip any PII, secrets, URLs, usernames, or tokens from the original
- owasp_code: choose the most applicable from LLM01-LLM10 or AAI01-AAI10, \
  or leave empty if uncertain

Reply with JSON only — no markdown, no explanation outside the JSON:
{\"name\":\"...\",\"description\":\"...\",\"threat_context\":\"...\",\"owasp_code\":\"...\"}";

#[derive(Debug)]
struct KnowledgeEntry {
    name:          String,
    description:   String,
    threat_context: String,
}

fn sanitize_knowledge_field(s: &str) -> String {
    let s = s.replace(['\r', '\n', '\t'], " ");
    let s = s.trim();
    let mut s: String = s.chars().take(512).collect();
    s.shrink_to_fit();
    s
}

fn parse_knowledge_entry(text: &str) -> Result<KnowledgeEntry, String> {
    let s = strip_code_fence(text);
    let j: Value = serde_json::from_str(s).map_err(|e| format!("JSON parse error: {}", e))?;

    let name = sanitize_knowledge_field(j.get("name").and_then(|v| v.as_str()).unwrap_or(""));
    let desc = sanitize_knowledge_field(j.get("description").and_then(|v| v.as_str()).unwrap_or(""));
    let tc   = sanitize_knowledge_field(j.get("threat_context").and_then(|v| v.as_str()).unwrap_or(""));

    if name.is_empty() || desc.is_empty() || tc.is_empty() {
        return Err("LLM returned incomplete knowledge entry (missing name/description/threat_context)".to_string());
    }

    Ok(KnowledgeEntry { name, description: desc, threat_context: tc })
}



#[derive(Debug)]
struct DedupJudgement {
    is_duplicate: bool,
    matched_id:   String,
    reason:       String,
}

fn parse_dedup_judgement(text: &str) -> Result<DedupJudgement, String> {
    let s = strip_code_fence(text);
    let j: Value = serde_json::from_str(s).map_err(|e| format!("JSON parse error: {}", e))?;

    let is_duplicate = j.get("is_duplicate").and_then(|v| v.as_bool())
        .ok_or("missing/invalid is_duplicate")?;
    let matched_id = j.get("matched_id").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    let reason     = j.get("reason").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();

    Ok(DedupJudgement { is_duplicate, matched_id, reason })
}

fn format_existing_entries(hits: &[SemanticHit]) -> String {
    hits.iter()
        .map(|h| format!(
            "- id={} name=\"{}\" similarity={:.2} description=\"{}\" threat_context=\"{}\"",
            h.id, h.name, h.similarity, h.description, h.threat_context
        ))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Main entry point — fire-and-forget, called from a `tokio::spawn`.
pub async fn develop_threat_knowledge(
    client:       &Client,
    attack_prompt: &str,
    t2_reason:    &str,
    request_id:   &str,
    _app_id:      &str,
    policy_store: &DetectorStore,
    pool:         &PgPool,
    log_writer:   &crate::tools::log_writer::LogWriter,
) {
    tracing::info!("[knowledge_dev] {} starting knowledge development", request_id);

    // ── 1. Load embedding providers ──────────────────────────────────────────
    let emb_providers = policy_store.embedding_providers.read().unwrap_or_else(|e| e.into_inner()).clone();
    if emb_providers.is_empty() {
        tracing::warn!("[knowledge_dev] {} no embedding providers — skipping", request_id);
        return;
    }

    // ── 2. Load classifier provider ──────────────────────────────────────────
    let classifier_cfg = policy_store.classifier_provider.read().unwrap_or_else(|e| e.into_inner()).clone();
    let Some(classifier) = classifier_cfg else {
        tracing::warn!("[knowledge_dev] {} no classifier provider — skipping", request_id);
        return;
    };

    // ── 3. LLM call: generalise the attack ────────────────────────────────────
    let user_msg = format!(
        "Attack prompt:\n{}\n\nReason flagged: {}",
        attack_prompt, t2_reason
    );
    let raw = match llm_complete(
        client, &classifier, KNOWLEDGE_DEV_SYSTEM_PROMPT, &user_msg, "knowledge_dev", log_writer, Some(request_id), policy_store,
        crate::constants::KNOWLEDGE_DEV_MAX_OUTPUT_TOKENS,
    ).await {
        Ok(r)  => r,
        Err(e) => {
            tracing::warn!("[knowledge_dev] {} LLM call failed: {}", request_id, e);
            return;
        }
    };

    // ── 4. Parse the JSON response ─────────────────────────────────────────────
    let entry = match parse_knowledge_entry(&raw) {
        Ok(e)  => e,
        Err(e) => {
            tracing::warn!("[knowledge_dev] {} parse failed: {} — raw: {:.200}", request_id, e, raw);
            return;
        }
    };

    // ── 5. Embed the generalised threat_context ───────────────────────────────
    let tc_embedding = match generate_embedding(client, &emb_providers, &entry.threat_context).await {
        Ok(v)  => v,
        Err(e) => {
            tracing::warn!("[knowledge_dev] {} threat_context embedding failed: {}", request_id, e);
            return;
        }
    };

    // ── 6. Dedup: search active + pending entries using the platform semantic threshold ──
    let dedup_threshold = *policy_store.embedding_threshold.read().unwrap_or_else(|e| e.into_inner());
    let hits = match search_threats(pool, &tc_embedding, dedup_threshold, DEDUP_TOP_K, None, true).await {
        Ok(hits) => hits,
        Err(e) => {
            tracing::warn!("[knowledge_dev] {} semantic search failed: {}", request_id, e);
            Vec::new()
        }
    };

    if !hits.is_empty() {
        let user_msg = format!(
            "New threat knowledge entry:\nName: {}\nDescription: {}\nThreat context: {}\n\nReason flagged: {}\n\nExisting similar threat knowledge entries:\n{}",
            entry.name, entry.description, entry.threat_context, t2_reason, format_existing_entries(&hits)
        );
        let judgement = match llm_complete(
            client, &classifier, KNOWLEDGE_DEDUP_SYSTEM_PROMPT, &user_msg, "knowledge_dedup", log_writer, Some(request_id), policy_store,
            crate::constants::KNOWLEDGE_DEV_MAX_OUTPUT_TOKENS,
        ).await {
            Ok(raw) => parse_dedup_judgement(&raw),
            Err(e)  => Err(e),
        };

        match judgement {
            Ok(d) if d.is_duplicate => {
                tracing::info!(
                    "[knowledge_dev] {} LLM judged duplicate of id={} (reason: {}), skipping",
                    request_id, d.matched_id, d.reason
                );
                return;
            }
            Ok(d) => {
                tracing::info!(
                    "[knowledge_dev] {} LLM judged distinct from {} similar hit(s) (reason: {}), proceeding to create",
                    request_id, hits.len(), d.reason
                );
            }
            Err(e) => {
                tracing::warn!(
                    "[knowledge_dev] {} dedup judgement failed ({}) — fail closed, skipping", request_id, e
                );
                return;
            }
        }
    }

    // ── 7. Insert into threat_knowledge ─────────────────────────────────────────
    let embedding_vec = Vector::from(tc_embedding);
    match insert_threat_knowledge(
        pool,
        &entry.name,
        &entry.description,
        &entry.threat_context,
        embedding_vec,
        request_id,
    ).await {
        Ok(id) => tracing::info!(
            "[knowledge_dev] {} inserted pending TK entry id={} name=\"{}\"",
            request_id, id, entry.name
        ),
        Err(e) => tracing::warn!(
            "[knowledge_dev] {} DB insert failed: {}", request_id, e
        ),
    }
}
