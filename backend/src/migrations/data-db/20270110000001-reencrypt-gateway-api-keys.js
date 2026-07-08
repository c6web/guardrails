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

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const secret = process.env['PLATFORM_KEY_SECRET']
    if (!secret) throw new Error('PLATFORM_KEY_SECRET env var is required to run this migration')

    const [rows] = await queryInterface.sequelize.query(
      `SELECT id, key_encrypted FROM gateway_api_keys WHERE key_encrypted IS NOT NULL`
    )

    let reencrypted = 0
    let deleted = 0

    for (const row of rows) {
      let plaintext = null
      try { plaintext = decryptValue(row.key_encrypted, secret) } catch {}

      if (!plaintext) {
        // Key was encrypted with a different secret — it is no longer usable; remove it
        await queryInterface.sequelize.query(
          `DELETE FROM gateway_api_keys WHERE id = :id`,
          { replacements: { id: row.id } }
        )
        deleted++
        console.log(`[migration] deleted undecryptable gateway_api_key id=${row.id}`)
        continue
      }

      // Re-encrypt with the current secret to ensure canonical format
      const reenc = encryptValue(plaintext, secret)
      await queryInterface.sequelize.query(
        `UPDATE gateway_api_keys SET key_encrypted = :enc WHERE id = :id`,
        { replacements: { enc: reenc, id: row.id } }
      )
      reencrypted++
    }

    console.log(`[migration] gateway_api_keys: ${reencrypted} re-encrypted, ${deleted} deleted (unreadable)`)
  },

  async down() {
    // Re-encryption is irreversible — deleted rows cannot be restored
    console.log('[migration] down: no-op')
  },
}
