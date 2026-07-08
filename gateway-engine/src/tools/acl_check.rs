//! ACL check utility — determines whether a source IP is blocked or allowed by policy.

use std::net::IpAddr;

use ipnet::IpNet;

use crate::policy::AclEntry;

/// Resolve the real client IP, optionally trusting `X-Forwarded-For`.
///
/// When `trusted_proxy_depth` is 0 (default) the TCP socket address is used directly.
///
/// When `trusted_proxy_depth > 0`, the gateway first verifies that the immediate
/// socket peer is a trusted reverse proxy (its IP is in `trusted_proxy_ips`).
/// If the peer is trusted, the XFF header is peeled by `trusted_proxy_depth` hops
/// from the right end:
///   depth=1 means one trusted proxy — the client IP is at `len() - 1 - depth`.
/// The rightmost XFF entry is the immediate proxy (furthest hop from client).
/// The original client is `depth` hops left of the rightmost entry.
/// All entries in the trusted range (client through proxies) must be valid IPs.
///
/// If the socket peer is NOT a trusted proxy, XFF is discarded and the socket
/// address is used directly (fail-safe: an attacker directly connected to the
/// gateway cannot spoof their IP via XFF).
pub fn resolve_source_ip(
    socket_addr: Option<std::net::SocketAddr>,
    xff: Option<&str>,
    trusted_proxy_depth: usize,
    trusted_proxy_ips: &[IpNet],
) -> String {
    if trusted_proxy_depth > 0
        && let Some(xff_val) = xff
        && let Some(peer) = socket_addr
    {
        // Verify the socket peer is a known trusted proxy before consulting XFF.
        let peer_ip = peer.ip();
        let is_trusted = trusted_proxy_ips.iter().any(|net| net.contains(&peer_ip));
        if !is_trusted {
            tracing::warn!(
                "socket peer {peer_ip} is not a trusted proxy — XFF discarded"
            );
        } else {
            let parts: Vec<&str> = xff_val.split(',').map(|s| s.trim()).collect();
            if parts.len() > trusted_proxy_depth {
                let client_idx = parts.len() - 1 - trusted_proxy_depth;
                if parts[client_idx..].iter().all(|s| s.parse::<IpAddr>().is_ok()) {
                    return parts[client_idx].to_string();
                }
                tracing::warn!(
                    "XFF entries in trusted range are not valid IPs: {:?}",
                    &parts[client_idx..]
                );
            } else {
                tracing::warn!(
                    "XFF has {} entries but trusted_proxy_depth is {} (need at least {})",
                    parts.len(),
                    trusted_proxy_depth,
                    trusted_proxy_depth + 1
                );
            }
        }
    }
    socket_addr
        .map(|s| s.ip().to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

pub fn is_ip_blocked(source_ip_str: &str, mode: &str, entries: &[AclEntry]) -> bool {
    let src_ip: IpAddr = match source_ip_str.parse() {
        Ok(ip) => ip,
        Err(_) => {
            tracing::warn!("[acl] unparseable source IP \"{source_ip_str}\" — blocking (fail-closed)");
            return true;
        }
    };
    let in_list = entries.iter().any(|e| match e.entry_type.as_str() {
        "ip" => e.original_value.parse::<IpAddr>().map(|ip| ip == src_ip).unwrap_or(false),
        "cidr" => e.original_value.parse::<IpNet>().map(|net| net.contains(&src_ip)).unwrap_or(false),
        "host" | "domain" => e.resolved_ips.contains(&src_ip),
        _ => false,
    });
    match mode {
        "allow_all" => in_list,
        "block_all" => !in_list,
        _ => {
            tracing::warn!("[acl] unknown mode \"{mode}\" — blocking (fail-closed)");
            true
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::SocketAddr;
    use std::str::FromStr;

    fn sa(ip: &str, port: u16) -> Option<SocketAddr> {
        Some(SocketAddr::new(ip.parse().unwrap(), port))
    }

    fn trusted(ip: &str) -> Vec<IpNet> {
        vec![IpNet::from_str(ip).unwrap()]
    }

    /// Shorthand: trust 10.0.0.0/8 (used by most depth>0 tests).
    fn trust_private() -> Vec<IpNet> {
        trusted("10.0.0.0/8")
    }

    // ── depth = 0 — socket address only ──────────────────────────────────────

    #[test]
    fn depth_zero_uses_socket_ip() {
        assert_eq!(resolve_source_ip(sa("1.2.3.4", 5678), None, 0, &[]), "1.2.3.4");
    }

    #[test]
    fn depth_zero_ignores_xff() {
        assert_eq!(
            resolve_source_ip(sa("1.2.3.4", 5678), Some("9.9.9.9"), 0, &[]),
            "1.2.3.4"
        );
    }

    #[test]
    fn depth_zero_no_socket_returns_unknown() {
        assert_eq!(resolve_source_ip(None, Some("9.9.9.9"), 0, &[]), "unknown");
    }

    // ── depth > 0 with trusted proxy + valid XFF ─────────────────────────────

    #[test]
    fn depth_one_peels_one_hop() {
        // XFF: [client, proxy]  —  depth=1 → client at index 0
        assert_eq!(
            resolve_source_ip(sa("10.0.0.1", 8080), Some("1.2.3.4, 10.0.0.1"), 1, &trust_private()),
            "1.2.3.4"
        );
    }

    #[test]
    fn depth_two_peels_two_hops() {
        // XFF: [client, proxy1, proxy2]  —  depth=2 → client at index 0
        assert_eq!(
            resolve_source_ip(
                sa("10.0.0.2", 8080),
                Some("1.2.3.4, 10.0.0.1, 10.0.0.2"),
                2,
                &trust_private(),
            ),
            "1.2.3.4"
        );
    }

    #[test]
    fn depth_one_extra_entries_left() {
        // XFF: [spoofed, client, proxy]  —  depth=1 → client at index 1
        assert_eq!(
            resolve_source_ip(
                sa("10.0.0.1", 8080),
                Some("9.9.9.9, 1.2.3.4, 10.0.0.1"),
                1,
                &trust_private(),
            ),
            "1.2.3.4"
        );
    }

    #[test]
    fn depth_two_with_extra_left() {
        // XFF: [spoofed, client, proxy1, proxy2]  —  depth=2 → client at index 1
        assert_eq!(
            resolve_source_ip(
                sa("10.0.0.2", 8080),
                Some("9.9.9.9, 1.2.3.4, 10.0.0.1, 10.0.0.2"),
                2,
                &trust_private(),
            ),
            "1.2.3.4"
        );
    }

    #[test]
    fn depth_one_ipv6_in_xff() {
        assert_eq!(
            resolve_source_ip(
                sa("::1", 8080),
                Some("2001:db8::1, ::1"),
                1,
                &trusted("::1/128"),
            ),
            "2001:db8::1"
        );
    }

    // ── depth > 0 — untrusted socket peer → XFF discarded ────────────────────

    #[test]
    fn untrusted_socket_peer_ignores_xff() {
        // Attacker connecting directly with TCP peer 9.9.9.9, sending fake XFF.
        // No trusted-proxy IP covers 9.9.9.9 → XFF discarded → socket IP used.
        let trusted = trusted("10.0.0.0/8");
        assert_eq!(
            resolve_source_ip(sa("9.9.9.9", 5555), Some("1.2.3.4, 10.0.0.1"), 1, &trusted),
            "9.9.9.9"
        );
    }

    #[test]
    fn untrusted_peer_with_depth_two() {
        let trusted = trusted("10.0.0.0/8");
        assert_eq!(
            resolve_source_ip(sa("9.9.9.9", 5555), Some("1.2.3.4, 10.0.0.1, 10.0.0.2"), 2, &trusted),
            "9.9.9.9"
        );
    }

    #[test]
    fn empty_trusted_ips_ignores_xff() {
        // Empty trusted-proxy list when depth>0 → no proxy is trusted → XFF discarded.
        assert_eq!(
            resolve_source_ip(sa("10.0.0.1", 8080), Some("1.2.3.4, 10.0.0.1"), 1, &[]),
            "10.0.0.1"
        );
    }

    // ── depth > 0 — validation failures fall back to socket ──────────────────

    #[test]
    fn depth_one_too_few_entries_falls_back() {
        // 1 entry but depth=1 → parts.len() needs to be > 1
        assert_eq!(
            resolve_source_ip(sa("10.0.0.1", 8080), Some("1.2.3.4"), 1, &trust_private()),
            "10.0.0.1"
        );
    }

    #[test]
    fn depth_one_invalid_ip_in_xff_falls_back() {
        assert_eq!(
            resolve_source_ip(sa("10.0.0.1", 8080), Some("not-an-ip, 10.0.0.1"), 1, &trust_private()),
            "10.0.0.1"
        );
    }

    #[test]
    fn depth_one_proxy_ip_not_valid_falls_back() {
        // The proxy entry (rightmost, within trusted range) is not a valid IP
        assert_eq!(
            resolve_source_ip(sa("10.0.0.1", 8080), Some("1.2.3.4, bad"), 1, &trust_private()),
            "10.0.0.1"
        );
    }

    #[test]
    fn depth_one_no_xff_falls_back() {
        assert_eq!(
            resolve_source_ip(sa("10.0.0.1", 8080), None, 1, &trust_private()),
            "10.0.0.1"
        );
    }

    #[test]
    fn depth_one_no_socket_returns_unknown() {
        assert_eq!(resolve_source_ip(None, Some("1.2.3.4, 10.0.0.1"), 1, &trust_private()), "unknown");
    }

    // ── edge cases ───────────────────────────────────────────────────────────

    #[test]
    fn empty_xff_whitespace() {
        assert_eq!(
            resolve_source_ip(sa("10.0.0.1", 8080), Some("  1.2.3.4 ,  10.0.0.1 "), 1, &trust_private()),
            "1.2.3.4"
        );
    }

    #[test]
    fn multiple_commas_with_spaces() {
        assert_eq!(
            resolve_source_ip(sa("10.0.0.1", 8080), Some("1.2.3.4,10.0.0.1"), 1, &trust_private()),
            "1.2.3.4"
        );
    }
}
