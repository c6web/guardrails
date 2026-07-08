'use strict'

const crypto = require('crypto')

function derivedKey(secret) {
  return Buffer.from(crypto.createHash('sha256').update(secret).digest())
}

function encryptValue(raw, secret) {
  const iv = crypto.randomBytes(12)
  const key = derivedKey(secret)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, ciphertext, tag]).toString('base64')
}

function decryptValue(stored, secret) {
  const buf = Buffer.from(stored, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(buf.length - 16)
  const ciphertext = buf.subarray(12, buf.length - 16)
  const key = derivedKey(secret)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8')
}

// A value still looks like our ciphertext if it is base64 with at least IV+tag bytes.
function looksEncrypted(value) {
  if (!/^[A-Za-z0-9+/]+=*$/.test(value) || value.length <= 40) return false
  try { return Buffer.from(value, 'base64').length > 28 } catch { return false }
}

// Peel every encryption layer down to the original plaintext.
function decryptToPlaintext(value, secret) {
  let current = value
  let layers = 0
  while (layers < 64 && looksEncrypted(current)) {
    let next
    try { next = decryptValue(current, secret) } catch { break }
    current = next
    layers++
  }
  return { plaintext: current, layers }
}

async function repairTable(queryInterface, table, secret) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT id, api_key FROM ${table} WHERE api_key IS NOT NULL AND api_key <> ''`
  )
  let fixed = 0
  for (const row of rows) {
    const { plaintext, layers } = decryptToPlaintext(row.api_key, secret)
    if (layers <= 1) continue // already single-layer (or unreadable) — leave as-is
    const reencrypted = encryptValue(plaintext, secret)
    await queryInterface.sequelize.query(
      `UPDATE ${table} SET api_key = :enc WHERE id = :id`,
      { replacements: { enc: reencrypted, id: row.id } }
    )
    fixed++
    console.log(`[migration] ${table} id=${row.id}: collapsed ${layers} encryption layers → 1`)
  }
  console.log(`[migration] ${table}: ${fixed} key(s) repaired`)
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const secret = process.env['PLATFORM_KEY_SECRET']
    if (!secret) throw new Error('PLATFORM_KEY_SECRET env var is required to run this migration')
    await repairTable(queryInterface, 'ai_providers', secret)
    await repairTable(queryInterface, 'embedding_providers', secret)
  },

  async down() {
    console.log('[migration] down: no-op — collapsing encryption layers is not reversible')
  },
}
