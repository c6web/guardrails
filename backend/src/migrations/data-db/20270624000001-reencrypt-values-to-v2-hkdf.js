'use strict'

const crypto = require('crypto')

// ── Legacy KDF (SHA-256) ────────────────────────────────────────────────────

function legacyKey(secret) {
  return Buffer.from(crypto.createHash('sha256').update(secret).digest())
}

// ── New HKDF per-purpose ────────────────────────────────────────────────────

function hkdfKey(secret, purpose) {
  return Buffer.from(crypto.hkdfSync('sha256', secret, '', purpose, 32))
}

// ── Base AES-256-GCM ────────────────────────────────────────────────────────

function aesEncrypt(raw, key) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, ciphertext, tag])
}

function aesDecrypt(buf, key) {
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(buf.length - 16)
  const ciphertext = buf.subarray(12, buf.length - 16)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8')
}

// ── Versioned decrypt (format-sniffing) ─────────────────────────────────────

function decryptStored(stored, secret, purpose) {
  const lk = legacyKey(secret)

  if (stored.startsWith('v2:')) {
    const key = hkdfKey(secret, purpose)
    return aesDecrypt(Buffer.from(stored.slice(3), 'base64'), key)
  }

  if (stored.startsWith('enc:')) {
    return aesDecrypt(Buffer.from(stored.slice(4), 'base64'), lk)
  }

  return aesDecrypt(Buffer.from(stored, 'base64'), lk)
}

function encryptNew(raw, secret, purpose) {
  const key = hkdfKey(secret, purpose)
  return 'v2:' + aesEncrypt(raw, key).toString('base64')
}

// ── Migration ───────────────────────────────────────────────────────────────

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const secret = process.env['PLATFORM_KEY_SECRET']
    if (!secret) {
      console.log('[migration] PLATFORM_KEY_SECRET not set — skipping re-encryption to v2')
      return
    }

    console.log('[migration] Re-encrypting tier-1 tables to v2 (HKDF domain-separated)')

    // gateway_api_keys.key_encrypted — purpose: gateway-key
    await reencryptSimple(queryInterface, 'gateway_api_keys', 'key_encrypted', secret, 'gateway-key')

    // api_keys.key_encrypted — purpose: app-key
    await reencryptSimple(queryInterface, 'api_keys', 'key_encrypted', secret, 'app-key')

    // ai_providers.api_key — purpose: provider-key
    await reencryptSimple(queryInterface, 'ai_providers', 'api_key', secret, 'provider-key')

    // embedding_providers.api_key — purpose: provider-key
    await reencryptSimple(queryInterface, 'embedding_providers', 'api_key', secret, 'provider-key')

    // admin_api_keys.key_value — purpose: admin-key (has enc: prefix in legacy)
    await reencryptSimple(queryInterface, 'admin_api_keys', 'key_value', secret, 'admin-key')

    // notification_servers.config (JSONB) — purpose: notification-cred
    await reencryptNotifications(queryInterface, secret)

    console.log('[migration] Tier-1 re-encryption complete')
  },

  async down() {
    console.log('[migration] down: no-op — re-encryption to v2 is a forward-only operation')
  },
}

async function reencryptSimple(queryInterface, table, column, secret, purpose) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT id, ${column} FROM ${table} WHERE ${column} IS NOT NULL AND ${column} != ''`
  )
  let migrated = 0, skipped = 0, errors = 0
  for (const row of rows) {
    const val = row[column]
    if (!val || val.startsWith('v2:')) {
      if (val && val.startsWith('v2:')) skipped++
      continue
    }
    try {
      const plaintext = decryptStored(val, secret, purpose)
      const reenc = encryptNew(plaintext, secret, purpose)
      await queryInterface.sequelize.query(
        `UPDATE ${table} SET ${column} = :val WHERE id = :id`,
        { replacements: { val: reenc, id: row.id } }
      )
      migrated++
    } catch (e) {
      console.error(`[migration] ${table} id=${row.id}: decrypt/encrypt failed — ${e.message}`)
      errors++
    }
  }
  console.log(`[migration] ${table}.${column}: ${migrated} migrated, ${skipped} already v2, ${errors} errors`)
}

async function reencryptNotifications(queryInterface, secret) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT id, config FROM notification_servers WHERE config IS NOT NULL`
  )
  let updated = 0
  const SENSITIVE_KEYS = ['password', 'api_key', 'secret']
  for (const row of rows) {
    const config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config
    let changed = false
    for (const key of SENSITIVE_KEYS) {
      const v = config[key]
      if (!v || typeof v !== 'string' || v.startsWith('v2:')) continue
      try {
        const plaintext = decryptStored(v, secret, 'notification-cred')
        config[key] = encryptNew(plaintext, secret, 'notification-cred')
        changed = true
      } catch (e) {
        console.error(`[migration] notification_servers id=${row.id} key=${key}: ${e.message}`)
      }
    }
    if (changed) {
      await queryInterface.sequelize.query(
        `UPDATE notification_servers SET config = :cfg WHERE id = :id`,
        { replacements: { cfg: JSON.stringify(config), id: row.id } }
      )
      updated++
    }
  }
  console.log(`[migration] notification_servers.config: ${updated} updated`)
}

