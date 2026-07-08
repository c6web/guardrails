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

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('admin_api_keys')
    if (!columns['description']) {
      await queryInterface.addColumn('admin_api_keys', 'description', {
        type: Sequelize.DataTypes.TEXT,
        allowNull: true,
        after: 'name',
      })
    }

    const secret = process.env['PLATFORM_KEY_SECRET']
    if (!secret) throw new Error('PLATFORM_KEY_SECRET env var is required to run this migration')

    const [rows] = await queryInterface.sequelize.query(
      `SELECT id, key_value FROM admin_api_keys WHERE key_value IS NOT NULL`
    )
    for (const row of rows) {
      // Skip if already encrypted (guard against re-running)
      if (row.key_value.startsWith('enc:')) continue
      const encrypted = 'enc:' + encryptValue(row.key_value, secret)
      await queryInterface.sequelize.query(
        `UPDATE admin_api_keys SET key_value = :enc WHERE id = :id`,
        { replacements: { enc: encrypted, id: row.id } }
      )
    }
  },

  async down(queryInterface) {
    const secret = process.env['PLATFORM_KEY_SECRET']
    if (!secret) throw new Error('PLATFORM_KEY_SECRET env var is required to roll back this migration')

    const [rows] = await queryInterface.sequelize.query(
      `SELECT id, key_value FROM admin_api_keys WHERE key_value IS NOT NULL`
    )
    for (const row of rows) {
      if (!row.key_value.startsWith('enc:')) continue
      try {
        const plaintext = decryptValue(row.key_value.slice(4), secret)
        await queryInterface.sequelize.query(
          `UPDATE admin_api_keys SET key_value = :val WHERE id = :id`,
          { replacements: { val: plaintext, id: row.id } }
        )
      } catch { /* skip rows that can't be decrypted */ }
    }

    const columnsDown = await queryInterface.describeTable('admin_api_keys')
    if (columnsDown['description']) {
      await queryInterface.removeColumn('admin_api_keys', 'description')
    }
  },
}
