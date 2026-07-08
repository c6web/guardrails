use aes_gcm::{Aes256Gcm, Key, KeyInit, Nonce, aead::Aead};
use base64::{engine::general_purpose, Engine as _};
use hkdf::Hkdf;
use sha2::{Digest, Sha256};
use rand::RngCore;

// ── HKDF-SHA256 with per-purpose domain separation ─────────────────────────

fn derive_purpose_key(secret: &str, purpose: &str) -> [u8; 32] {
    let mut okm = [0u8; 32];
    Hkdf::<Sha256>::new(None, secret.as_bytes())
        .expand(purpose.as_bytes(), &mut okm)
        .expect("HKDF expand failed");
    okm
}

// Legacy KDF — SHA-256(secret) — kept for reading old-format ciphertext
fn legacy_derive_key(secret: &str) -> [u8; 32] {
    let digest = Sha256::digest(secret.as_bytes());
    let mut key = [0u8; 32];
    key.copy_from_slice(&digest);
    key
}

// ── Base AES-256-GCM primitives ────────────────────────────────────────────

fn aes_encrypt(plaintext: &str, key: &[u8; 32]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext_with_tag = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("AES-GCM encryption failed: {}", e))?;

    let mut combined = Vec::with_capacity(12 + ciphertext_with_tag.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext_with_tag);
    Ok(combined)
}

fn aes_decrypt(data: &[u8], key: &[u8; 32]) -> Option<String> {
    if data.len() < 29 { return None; }
    let (nonce_bytes, ciphertext_and_tag) = data.split_at(12);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher.decrypt(nonce, ciphertext_and_tag)
        .ok()
        .and_then(|v| String::from_utf8(v).ok())
}

// ── Versioned encrypt/decrypt ──────────────────────────────────────────────
//
// Wire format (mirrors backend/src/utils/gatewayKeyCrypto.ts exactly):
//   "v2:<base64>"  → HKDF(purpose) key
//   "enc:<base64>" → legacy SHA256(secret) key
//   raw base64     → legacy SHA256(secret) key (gateway/app/provider legacy)
//
// encrypt() always writes the "v2:" format.
// decrypt() format-sniffs and uses the correct key derivation.

pub fn encrypt(plaintext: &str, purpose: &str, secret: &str) -> Result<String, String> {
    let key = derive_purpose_key(secret, purpose);
    let encrypted = aes_encrypt(plaintext, &key)?;
    Ok(format!("v2:{}", general_purpose::STANDARD.encode(encrypted)))
}

pub fn decrypt(stored: &str, purpose: &str, secret: &str) -> Option<String> {
    let legacy_key = legacy_derive_key(secret);

    if let Some(rest) = stored.strip_prefix("v2:") {
        let key = derive_purpose_key(secret, purpose);
        let data = general_purpose::STANDARD.decode(rest).ok()?;
        return aes_decrypt(&data, &key);
    }

    if let Some(rest) = stored.strip_prefix("enc:") {
        let data = general_purpose::STANDARD.decode(rest).ok()?;
        return aes_decrypt(&data, &legacy_key);
    }

    let data = general_purpose::STANDARD.decode(stored).ok()?;
    aes_decrypt(&data, &legacy_key)
}

/// Decrypt a provider API key stored in the database.
/// Returns the plaintext key if decryption succeeds, or the raw value
/// as a plaintext fallback when PLATFORM_KEY_SECRET is not set.
/// Logs a warning if the secret is missing or decryption fails.
pub fn decrypt_provider_key(encrypted: &str, provider_name: &str) -> Option<String> {
    let secret = std::env::var("PLATFORM_KEY_SECRET").unwrap_or_default();
    if secret.is_empty() {
        tracing::warn!("[crypto] PLATFORM_KEY_SECRET not set — provider \"{}\" key stored as plaintext", provider_name);
        return Some(encrypted.to_string());
    }
    if let Some(key) = decrypt(encrypted, "provider-key", &secret) {
        Some(key)
    } else {
        tracing::warn!("[crypto] failed to decrypt provider \"{}\" key", provider_name);
        None
    }
}

/// Decrypt the Content Quality Provider's service API key (bearer auth to the
/// active content-quality plugin backend, e.g. the TruLens service).
/// Mirrors `decrypt_provider_key`'s plaintext-fallback/warn behaviour.
pub fn decrypt_content_quality_service_key(encrypted: &str) -> Option<String> {
    let secret = std::env::var("PLATFORM_KEY_SECRET").unwrap_or_default();
    if secret.is_empty() {
        tracing::warn!("[crypto] PLATFORM_KEY_SECRET not set — content quality service key stored as plaintext");
        return Some(encrypted.to_string());
    }
    if let Some(key) = decrypt(encrypted, "content-quality-service-key", &secret) {
        Some(key)
    } else {
        tracing::warn!("[crypto] failed to decrypt content quality service key");
        None
    }
}

// ── Purpose-specific convenience wrappers ──────────────────────────────────
//
// These thin wrappers correspond to the backend's gatewayKeyCrypto purpose constants.
// encrypt() and decrypt() are the primary API; use them directly with the purpose string.

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "cross-lang-fixture-secret-32-chars-min";

    #[test]
    fn round_trip_v2_format() {
        let plain = "my-test-secret-value-123";
        let ciphertext = encrypt(plain, "app-key", SECRET).unwrap();
        assert!(ciphertext.starts_with("v2:"));
        assert_eq!(decrypt(&ciphertext, "app-key", SECRET).unwrap(), plain);
    }

    #[test]
    fn decrypt_v2_with_wrong_purpose_fails() {
        let ciphertext = encrypt("value", "gateway-key", SECRET).unwrap();
        assert!(decrypt(&ciphertext, "app-key", SECRET).is_none());
    }

    #[test]
    fn domain_separation_across_all_purposes() {
        let plain = "cross-format-test-value";
        let purposes = [
            "gateway-key", "app-key", "provider-key",
            "admin-key", "notification-cred", "log-field",
        ];
        for purpose in purposes {
            let ciphertext = encrypt(plain, purpose, SECRET).unwrap();
            assert!(ciphertext.starts_with("v2:"));
            assert_eq!(decrypt(&ciphertext, purpose, SECRET).unwrap(), plain);
            // every other purpose must fail to decrypt this ciphertext
            for other in purposes {
                if other == purpose { continue; }
                assert!(decrypt(&ciphertext, other, SECRET).is_none());
            }
        }
    }

    #[test]
    fn decrypt_legacy_unmarked_base64() {
        // Produced by the old SHA256(secret)-keyed scheme, no prefix —
        // mirrors gateway/app/provider-key columns before migration.
        let legacy = "ZclL7p+Z1NX/EjyYM/DKzNCk8YlUSg3RgNUNFi/FF2ANt6tFDEnbTe8d2vjv7t91qvvFygIVeMg=";
        assert_eq!(decrypt(legacy, "provider-key", SECRET).unwrap(), "cross-lang-fixture-plaintext");
    }

    #[test]
    fn decrypt_cross_language_ts_produced_v2_fixture() {
        // Produced by backend/src/utils/gatewayKeyCrypto.ts's encrypt() with the same
        // secret/purpose/plaintext — proves wire-format + HKDF-info compatibility
        // between the Rust and TypeScript implementations.
        let ts_v2 = "v2:T50LeH40fFrXitAR13Xa3hLnr+8jLHnlGTDHogIRKOT5C0cxR/RR6PiKtBJPCVyyMhu7kqODJeE=";
        assert_eq!(decrypt(ts_v2, "provider-key", SECRET).unwrap(), "cross-lang-fixture-plaintext");
    }

    #[test]
    fn decrypt_invalid_base64_returns_none() {
        assert!(decrypt("v2:not-valid-base64!@#", "gateway-key", SECRET).is_none());
    }

    #[test]
    fn decrypt_tampered_ciphertext_returns_none() {
        let ciphertext = encrypt("tamper-test", "gateway-key", SECRET).unwrap();
        let mut bytes = ciphertext.into_bytes();
        let last = bytes.len() - 1;
        bytes[last] = if bytes[last] == b'A' { b'B' } else { b'A' };
        let tampered = String::from_utf8(bytes).unwrap();
        assert!(decrypt(&tampered, "gateway-key", SECRET).is_none());
    }

    #[test]
    fn derive_purpose_key_is_deterministic_and_purpose_specific() {
        let a = derive_purpose_key(SECRET, "app-key");
        let b = derive_purpose_key(SECRET, "app-key");
        let c = derive_purpose_key(SECRET, "gateway-key");
        assert_eq!(a, b);
        assert_ne!(a, c);
    }
}
