use ipnet::IpNet;
use std::collections::HashMap;
use std::net::IpAddr;
use std::str::FromStr;
use std::sync::{OnceLock, RwLock};
use std::time::Instant;

const DNS_CACHE_TTL_SECS: u64 = 60;

struct DnsEntry {
    safe: bool,
    checked_at: Instant,
}

fn dns_cache() -> &'static RwLock<HashMap<String, DnsEntry>> {
    static CACHE: OnceLock<RwLock<HashMap<String, DnsEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| RwLock::new(HashMap::new()))
}

/// Returns true when the SSRF validation should allow private (RFC-1918)
/// network ranges through (intended for development / demo environments).
fn is_private_allowed() -> bool {
    std::env::var("SSRF_PRIVATE_ALLOWED")
        .ok()
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

/// Networks that are always blocked for SSRF reasons — loopback, link-local,
/// benchmark/testing, and the invalid "this network" range.
fn always_blocked() -> Vec<IpNet> {
    vec![
        "127.0.0.0/8".parse().unwrap(),    // loopback
        "169.254.0.0/16".parse().unwrap(),  // link-local (includes 169.254.169.254)
        "198.18.0.0/15".parse().unwrap(),   // benchmark/testing
        "0.0.0.0/8".parse().unwrap(),       // "this network" (invalid source)
        "::1/128".parse().unwrap(),         // IPv6 loopback
        "fe80::/10".parse().unwrap(),       // IPv6 link-local
        "fc00::/7".parse().unwrap(),        // IPv6 ULA
    ]
}

/// Private (RFC-1918) networks: conditionally blocked based on
/// the `SSRF_PRIVATE_ALLOWED` env var.
fn private_networks() -> Vec<IpNet> {
    vec![
        "10.0.0.0/8".parse().unwrap(),      // RFC-1918
        "172.16.0.0/12".parse().unwrap(),    // RFC-1918
        "192.168.0.0/16".parse().unwrap(),   // RFC-1918
    ]
}

fn is_blocked_ip(ip: IpAddr) -> bool {
    // Always-blocked networks.
    if always_blocked().iter().any(|net| net.contains(&ip)) {
        return true;
    }
    // Private networks — blocked only when SSRF enforcement is active.
    if !is_private_allowed() && private_networks().iter().any(|net| net.contains(&ip)) {
        return true;
    }
    false
}

/// Validate a provider endpoint URL against SSRF vectors:
///
///  1. Parse the URL (reject malformed URLs).
///  2. Check scheme is http or https.
///  3. Check that the hostname exists.
///  4. If the host is a literal IP, check it against the blocklist.
///  5. Otherwise, resolve the hostname via DNS and check every resolved
///     IP against the blocklist.
///
/// Blocked ranges: loopback (127.0.0.0/8, ::1), link-local (169.254.0.0/16,
/// fe80::/10), RFC-1918 private (10/8, 172.16/12, 192.168/16), ULA (fc00::/7),
/// benchmark (198.18/15), and invalid source (0.0.0.0/8).
pub async fn validate_endpoint(endpoint: &str) -> bool {
    let parsed = match url::Url::parse(endpoint) {
        Ok(u) => u,
        Err(e) => {
            tracing::warn!(
                "[endpoint_validation] rejecting \"{endpoint}\" \u{2014} failed to parse URL: {e}"
            );
            return false;
        }
    };

    match parsed.scheme() {
        "http" | "https" => {}
        scheme => {
            tracing::warn!(
                "[endpoint_validation] rejecting \"{endpoint}\" \u{2014} unsupported scheme \"{scheme}\""
            );
            return false;
        }
    }

    let host = match parsed.host_str() {
        Some(h) => h,
        None => {
            tracing::warn!(
                "[endpoint_validation] rejecting \"{endpoint}\" \u{2014} no host in URL"
            );
            return false;
        }
    };

    // If the host is a literal IP, check it directly (no DNS needed).
    if let Ok(ip) = IpAddr::from_str(host) {
        if is_blocked_ip(ip) {
            tracing::warn!(
                "[endpoint_validation] rejecting \"{endpoint}\" \u{2014} blocked IP address \"{ip}\""
            );
            return false;
        }
        return true;
    }

    // Resolve hostname to IPs.  Port is required by ToSocketAddrs but has
    // no effect on resolution; 80 is used as a conventional placeholder.
    let addr = format!("{host}:80");
    let ips = match tokio::net::lookup_host(&addr).await {
        Ok(ips) => ips,
        Err(e) => {
            tracing::warn!(
                "[endpoint_validation] rejecting \"{endpoint}\" \u{2014} DNS resolution failed: {e}"
            );
            return false;
        }
    };

    for resolved in ips {
        if is_blocked_ip(resolved.ip()) {
            tracing::warn!(
                "[endpoint_validation] rejecting \"{endpoint}\" \u{2014} host \"{host}\" resolves to blocked IP \"{}\"",
                resolved.ip()
            );
            return false;
        }
    }

    true
}

/// Request-time endpoint re-validation with DNS caching (60s TTL).
///
/// Resolves the endpoint's hostname and checks every resolved IP against the
/// blocklist. Results are cached per-hostname for `DNS_CACHE_TTL_SECS` seconds
/// to avoid a DNS lookup on every proxied request.
///
/// This is the runtime counterpart to `validate_endpoint` (cache-load-time check)
/// and prevents DNS-rebinding SSRF: an attacker who changes a hostname's DNS
/// between cache refreshes will be caught here.
///
/// Fail-open: if DNS resolution itself fails at request time, the endpoint is
/// allowed through (consistent with the project's default fail-open posture).
pub async fn revalidate_endpoint(endpoint: &str) -> bool {
    let parsed = match url::Url::parse(endpoint) {
        Ok(u) => u,
        Err(_) => return false,
    };

    match parsed.scheme() {
        "http" | "https" => {}
        _ => return false,
    }

    let host = match parsed.host_str() {
        Some(h) => h,
        None => return false,
    };

    // Literal IPs are already validated at cache-load time; skip re-resolution.
    if host.parse::<IpAddr>().is_ok() {
        return true;
    }

    // Check the DNS cache for a non-expired entry.
    {
        let cache = dns_cache().read().unwrap_or_else(|e| e.into_inner());
        if let Some(entry) = cache.get(host)
            && entry.checked_at.elapsed().as_secs() < DNS_CACHE_TTL_SECS
        {
            return entry.safe;
        }
    }

    // Cache miss or expired — resolve and check.
    let addr = format!("{host}:80");
    let ips = match tokio::net::lookup_host(&addr).await {
        Ok(ips) => ips,
        Err(e) => {
            tracing::warn!(
                "[endpoint_validation] request-time DNS resolution failed for \"{host}\": {e} — allowing (fail-open)"
            );
            return true;
        }
    };

    let mut safe = true;
    for resolved in ips {
        if is_blocked_ip(resolved.ip()) {
            tracing::warn!(
                "[endpoint_validation] request-time re-validation: host \"{host}\" resolves to blocked IP \"{}\" — rejecting",
                resolved.ip()
            );
            safe = false;
            break;
        }
    }

    // Update the cache with the fresh result.
    {
        let mut cache = dns_cache().write().unwrap_or_else(|e| e.into_inner());
        cache.insert(host.to_string(), DnsEntry { safe, checked_at: Instant::now() });
    }

    safe
}

/// Expected host suffixes for well-known vendor endpoints.
///
/// When a provider row declares a known vendor (e.g. `"openai"`), the endpoint
/// host must match one of the expected suffixes below. This prevents an attacker
/// from exfiltrating a real upstream API key by setting a known vendor string
/// alongside a rogue endpoint: the key is only attached after the host check
/// passes (see `build_headers` call sites).
///
/// Vendors not in this table (`ollama` — no auth key; `openai_compatible` or
/// unknown — could be any custom proxy) are silently allowed.
fn allowed_hosts_for_vendor(vendor: &str) -> Option<&'static [&'static str]> {
    match vendor {
        "openai"        => Some(&["api.openai.com"]),
        "anthropic"     => Some(&["api.anthropic.com"]),
        "openrouter"    => Some(&["openrouter.ai"]),
        "gemini"        => Some(&[
            "generativelanguage.googleapis.com",
            "aiplatform.googleapis.com",
        ]),
        "google-gemini" => Some(&[
            "generativelanguage.googleapis.com",
            "aiplatform.googleapis.com",
        ]),
        "ollama"        => None,   // no auth key — no risk of credential exfiltration
        _               => None,   // unknown / openai_compatible — can't verify
    }
}

/// Verify that the endpoint's hostname is consistent with the declared vendor.
///
/// For known vendors with a defined host allowlist, the endpoint host must
/// exactly match or be a subdomain of an allowed suffix.  This runs at request
/// time alongside `revalidate_endpoint` and prevents credential exfiltration
/// via a provider row with a legitimate vendor string but a rogue endpoint.
///
/// Returns `true` when:
///   - the vendor has no host constraints (ollama / unknown / openai_compatible)
///   - the endpoint host matches an allowed suffix for the vendor
///
/// Returns `false` (and logs a warning) when the host is not allowed.
pub fn verify_vendor_host(endpoint: &str, vendor: &str) -> bool {
    let expected = match allowed_hosts_for_vendor(vendor) {
        Some(list) => list,
        None => return true, // no constraints for this vendor
    };

    let host = match url::Url::parse(endpoint)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_lowercase()))
    {
        Some(h) => h,
        None => {
            tracing::warn!(
                "[endpoint_validation] vendor_host_check: could not parse endpoint \"{endpoint}\" for vendor \"{vendor}\""
            );
            return false;
        }
    };

    let ok = expected.iter().any(|suffix| {
        host == *suffix || host.ends_with(&format!(".{suffix}"))
    });

    if !ok {
        tracing::warn!(
            "[endpoint_validation] vendor_host_check: vendor \"{vendor}\" endpoint \"{endpoint}\" host \"{host}\" does not match expected hosts {expected:?}"
        );
    }

    ok
}
