'use strict'

const crypto = require('crypto')

function derivedKey(secret) {
  return crypto.createHash('sha256').update(secret).digest()
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
  async up(queryInterface, Sequelize) {
    const secret = process.env['PLATFORM_KEY_SECRET']
    if (!secret) throw new Error('PLATFORM_KEY_SECRET env var is required to run this migration')

    // 1. Add new encrypted column
    await queryInterface.addColumn('api_keys', 'key_encrypted', {
      type: Sequelize.TEXT,
      allowNull: true,
    })

    // 2. Encrypt all existing plaintext key_value rows
    const tableDesc = await queryInterface.describeTable('api_keys')
    if (tableDesc['key_value']) {
      const [rows] = await queryInterface.sequelize.query(
        `SELECT id, key_value FROM api_keys WHERE key_value IS NOT NULL`
      )
      for (const row of rows) {
        const encrypted = encryptValue(row.key_value, secret)
        await queryInterface.sequelize.query(
          `UPDATE api_keys SET key_encrypted = :enc WHERE id = :id`,
          { replacements: { enc: encrypted, id: row.id } }
        )
      }

      // 3. Drop old plaintext column
      await queryInterface.removeColumn('api_keys', 'key_value')
    }
  },

  async down(queryInterface, Sequelize) {
    const secret = process.env['PLATFORM_KEY_SECRET']
    if (!secret) throw new Error('PLATFORM_KEY_SECRET env var is required to roll back this migration')

    // Restore key_value column
    await queryInterface.addColumn('api_keys', 'key_value', {
      type: Sequelize.TEXT,
      allowNull: true,
    })

    // Decrypt all rows back to plaintext
    const tableDesc = await queryInterface.describeTable('api_keys')
    if (tableDesc['key_encrypted']) {
      const [rows] = await queryInterface.sequelize.query(
        `SELECT id, key_encrypted FROM api_keys WHERE key_encrypted IS NOT NULL`
      )
      for (const row of rows) {
        try {
          const plaintext = decryptValue(row.key_encrypted, secret)
          await queryInterface.sequelize.query(
            `UPDATE api_keys SET key_value = :val WHERE id = :id`,
            { replacements: { val: plaintext, id: row.id } }
          )
        } catch { /* skip rows that can't be decrypted */ }
      }

      await queryInterface.removeColumn('api_keys', 'key_encrypted')
    }
  },
}
