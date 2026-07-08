use super::{AclEntry, DetectorStore};
use sqlx::PgPool;
use std::net::IpAddr;

#[derive(sqlx::FromRow)]
struct AclRow {
    list_type:  String,
    value:      String,
    entry_type: String,
}

pub(super) async fn load_acl(store: &DetectorStore, pool: &PgPool) {
    let instance_id = std::env::var("GATEWAY_INSTANCE_ID").unwrap_or_default();
    if instance_id.is_empty() {
        tracing::error!(
            "[detector_loader] GATEWAY_INSTANCE_ID is not set — ACL disabled (allow all). \
             Create a gateway in the management console and set this env to its Gateway ID."
        );
        *store.acl_mode.write().unwrap_or_else(|e| e.into_inner())    = "allow_all".to_string();
        *store.acl_entries.write().unwrap_or_else(|e| e.into_inner()) = Vec::new();
        return;
    }

    #[derive(sqlx::FromRow)]
    struct InstanceRow {
        acl_list_id:           Option<String>,
        default_firewall_mode: Option<String>,
    }

    let instance_result = sqlx::query_as::<_, InstanceRow>(
        "SELECT acl_list_id::text, default_firewall_mode FROM gateway_instances WHERE id = $1::uuid"
    )
    .bind(&instance_id)
    .fetch_optional(pool)
    .await;

    let acl_list_id = match instance_result {
        Err(e) => {
            tracing::warn!("[detector_loader] acl instance lookup failed (keeping existing): {}", e);
            return;
        }
        Ok(None) => {
            tracing::error!(
                "[detector_loader] GATEWAY_INSTANCE_ID={} not found in DB — ACL disabled. \
                 Create this gateway in the management console and set this env to its Gateway ID.",
                instance_id
            );
            return;
        }
        Ok(Some(row)) => (row.acl_list_id, row.default_firewall_mode),
    };

    let (acl_list_id, default_mode) = acl_list_id;
    let default_mode = default_mode.unwrap_or_else(|| "allow_all".to_string());

    *store.default_firewall_mode.write().unwrap_or_else(|e| e.into_inner()) = default_mode.clone();

    if acl_list_id.is_none() {
        tracing::info!("[detector_loader] acl no list assigned to instance {} — using default mode: {}", instance_id, default_mode);
        *store.acl_mode.write().unwrap_or_else(|e| e.into_inner())    = default_mode;
        *store.acl_entries.write().unwrap_or_else(|e| e.into_inner()) = Vec::new();
        return;
    }

    let rows_result = sqlx::query_as::<_, AclRow>(
        r#"
        SELECT nal.list_type, nae.value, nae.entry_type
        FROM gateway_instances gi
        JOIN network_acl_lists nal ON nal.id = gi.acl_list_id
        JOIN network_acl_entries nae ON nae.list_id = nal.id
        WHERE gi.id = $1::uuid
          AND nae.enabled = true
        "#
    )
    .bind(&instance_id)
    .fetch_all(pool)
    .await;

    let rows = match rows_result {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!("[detector_loader] acl query failed (keeping existing): {}", e);
            return;
        }
    };

    if rows.is_empty() {
        tracing::info!("[detector_loader] acl list has no enabled entries for instance {} — allow all", instance_id);
        *store.acl_mode.write().unwrap_or_else(|e| e.into_inner())    = "allow_all".to_string();
        *store.acl_entries.write().unwrap_or_else(|e| e.into_inner()) = Vec::new();
        return;
    }

    let mode = match rows[0].list_type.as_str() {
        "allowlist" => "block_all",
        _           => "allow_all",
    }.to_string();

    let mut resolved: Vec<AclEntry> = Vec::with_capacity(rows.len());
    for row in rows {
        let resolved_ips = match row.entry_type.as_str() {
            "host" | "domain" => resolve_hostname(&row.value).await,
            _ => vec![],
        };
        resolved.push(AclEntry {
            original_value: row.value,
            entry_type:     row.entry_type,
            resolved_ips,
        });
    }

    tracing::info!("[detector_loader] acl mode={} entries={}", mode, resolved.len());
    *store.acl_mode.write().unwrap_or_else(|e| e.into_inner())    = mode;
    *store.acl_entries.write().unwrap_or_else(|e| e.into_inner()) = resolved;
}

async fn resolve_hostname(hostname: &str) -> Vec<IpAddr> {
    match tokio::net::lookup_host(format!("{}:0", hostname)).await {
        Ok(addrs) => addrs.map(|a| a.ip()).collect(),
        Err(e)    => {
            tracing::warn!("[acl] dns resolution failed for '{}': {}", hostname, e);
            vec![]
        }
    }
}

/// Re-resolve DNS for existing ACL entries without re-querying the DB.
/// Host/domain entries get fresh IPs; IP/CIDR entries are left unchanged.
pub(super) async fn refresh_acl_dns(store: &DetectorStore) {
    let entries = store.acl_entries.read().unwrap_or_else(|e| e.into_inner()).clone();
    let mut changed = false;
    let mut updated: Vec<super::AclEntry> = Vec::with_capacity(entries.len());

    for entry in entries {
        match entry.entry_type.as_str() {
            "host" | "domain" => {
                let new_ips = resolve_hostname(&entry.original_value).await;
                if new_ips != entry.resolved_ips {
                    changed = true;
                }
                updated.push(super::AclEntry {
                    original_value: entry.original_value,
                    entry_type:     entry.entry_type,
                    resolved_ips:   new_ips,
                });
            }
            _ => {
                updated.push(entry);
            }
        }
    }

    if changed {
        tracing::info!("[acl] dns refresh: {} entries re-resolved (IPs changed)", updated.len());
    } else {
        tracing::debug!("[acl] dns refresh: {} entries checked, no changes", updated.len());
    }
    *store.acl_entries.write().unwrap_or_else(|e| e.into_inner()) = updated;
}
