import crypto from 'crypto'
import { env } from '../config/env'

// ── HKDF-SHA256 with per-purpose domain separation ──────────────────────────

function derivePurposeKey(secret: string, purpose: string): Buffer {
  return Buffer.from(
    crypto.hkdfSync('sha256', secret, '', purpose, 32)
  )
}

// Legacy KDF — SHA-256(secret) — kept for reading old-format ciphertext
function legacyDerivedKey(secret: string): Buffer {
  return Buffer.from(
    crypto.createHash('sha256').update(secret).digest()
  )
}

// ── Base AES-256-GCM primitives ─────────────────────────────────────────────

function aesEncrypt(raw: string, key: Buffer): Buffer {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, ciphertext, tag])
}

function aesDecrypt(buf: Buffer, key: Buffer): string {
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(buf.length - 16)
  const ciphertext = buf.subarray(12, buf.length - 16)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8')
}

// ── Versioned encrypt/decrypt ───────────────────────────────────────────────
//
// Wire formats (read-path branches):
//   "v2:<base64>"  → HKDF(purpose) key           (new format)
//   "enc:<base64>" → legacy SHA256(secret) key   (admin keys, notifications, log fields)
//   raw base64     → legacy SHA256(secret) key   (gateway/app/provider legacy)
//
// encrypt() always writes the "v2:" format going forward.
// decrypt() format-sniffs and uses the correct key derivation.

export function encrypt(raw: string, secret: string, purpose: string): string {
  const key = derivePurposeKey(secret, purpose)
  return 'v2:' + aesEncrypt(raw, key).toString('base64')
}

export function decrypt(stored: string, secret: string, purpose: string): string {
  const legacyKey = legacyDerivedKey(secret)

  if (stored.startsWith('v2:')) {
    const key = derivePurposeKey(secret, purpose)
    return aesDecrypt(Buffer.from(stored.slice(3), 'base64'), key)
  }

  if (stored.startsWith('enc:')) {
    return aesDecrypt(Buffer.from(stored.slice(4), 'base64'), legacyKey)
  }

  return aesDecrypt(Buffer.from(stored, 'base64'), legacyKey)
}

export function sha256(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex')
}

// ── Purpose-specific convenience wrappers ───────────────────────────────────
//
// All six purpose labels (shared verbatim with gateway-engine crypto.rs):
//   "gateway-key", "app-key", "provider-key", "admin-key",
//   "notification-cred", "log-field"

export const gatewayEncrypt = (raw: string) => encrypt(raw, env.PLATFORM_KEY_SECRET, 'gateway-key')
export const gatewayDecrypt = (stored: string) => decrypt(stored, env.PLATFORM_KEY_SECRET, 'gateway-key')

export const appKeyEncrypt = (raw: string) => encrypt(raw, env.PLATFORM_KEY_SECRET, 'app-key')
export const appKeyDecrypt = (stored: string) => decrypt(stored, env.PLATFORM_KEY_SECRET, 'app-key')

const providerKeyEncrypt = (raw: string) => encrypt(raw, env.PLATFORM_KEY_SECRET, 'provider-key')
export const providerKeyDecrypt = (stored: string) => decrypt(stored, env.PLATFORM_KEY_SECRET, 'provider-key')

export const platformEncrypt = (raw: string) => encrypt(raw, env.PLATFORM_KEY_SECRET, 'admin-key')
export const platformDecrypt = (stored: string) => decrypt(stored, env.PLATFORM_KEY_SECRET, 'admin-key')

export const notificationEncrypt = (raw: string) => encrypt(raw, env.PLATFORM_KEY_SECRET, 'notification-cred')
export const notificationDecrypt = (stored: string) => decrypt(stored, env.PLATFORM_KEY_SECRET, 'notification-cred')

// Content Quality Provider's service_api_key (bearer auth to the active content-quality
// plugin backend, e.g. the TruLens service) — shared verbatim with gateway-engine's
// crypto::decrypt_content_quality_service_key purpose string.
export const contentQualityServiceKeyEncrypt = (raw: string) => encrypt(raw, env.PLATFORM_KEY_SECRET, 'content-quality-service-key')
export const contentQualityServiceKeyDecrypt = (stored: string) => decrypt(stored, env.PLATFORM_KEY_SECRET, 'content-quality-service-key')

// True when `value` is already ciphertext.  Uses a prefix-and-shape check
// (no trial-decryption oracle) — v2 has an explicit prefix; legacy unmarked
// ciphertext is base64 with at least 29 bytes (12 IV + 1 min ciphertext + 16 tag).
function isProviderCiphertext(value: string): boolean {
  if (value.startsWith('v2:')) return true
  if (value.startsWith('enc:')) return true
  try {
    return Buffer.from(value, 'base64').length > 28
  } catch {
    return false
  }
}

export const providerKeyEncryptOnce = (value: string): string =>
  isProviderCiphertext(value) ? value : providerKeyEncrypt(value)

export function logFieldDecrypt(stored: string): string {
  if (!stored.startsWith('enc:') && !stored.startsWith('v2:')) return stored
  try {
    if (stored.startsWith('v2:')) {
      const key = derivePurposeKey(env.PLATFORM_KEY_SECRET, 'log-field')
      return aesDecrypt(Buffer.from(stored.slice(3), 'base64'), key)
    }
    const legacyKey = legacyDerivedKey(env.PLATFORM_KEY_SECRET)
    return aesDecrypt(Buffer.from(stored.slice(4), 'base64'), legacyKey)
  } catch {
    return stored
  }
}
