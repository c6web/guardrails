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

const SENSITIVE_KEYS = ['password', 'api_key', 'secret']

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('notification_servers')
    if (!columns['description']) {
      await queryInterface.addColumn('notification_servers', 'description', {
        type: Sequelize.DataTypes.TEXT,
        allowNull: true,
        after: 'name',
      })
    }

    const secret = process.env['PLATFORM_KEY_SECRET']
    if (!secret) throw new Error('PLATFORM_KEY_SECRET env var is required to run this migration')

    const [rows] = await queryInterface.sequelize.query(
      `SELECT id, config FROM notification_servers WHERE config IS NOT NULL`
    )
    for (const row of rows) {
      const config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config
      let changed = false
      for (const key of SENSITIVE_KEYS) {
        if (config[key] && typeof config[key] === 'string' && !config[key].startsWith('enc:')) {
          config[key] = 'enc:' + encryptValue(config[key], secret)
          changed = true
        }
      }
      if (changed) {
        await queryInterface.sequelize.query(
          `UPDATE notification_servers SET config = :cfg WHERE id = :id`,
          { replacements: { cfg: JSON.stringify(config), id: row.id } }
        )
      }
    }
  },

  async down(queryInterface) {
    const secret = process.env['PLATFORM_KEY_SECRET']
    if (!secret) throw new Error('PLATFORM_KEY_SECRET env var is required to roll back this migration')

    const [rows] = await queryInterface.sequelize.query(
      `SELECT id, config FROM notification_servers WHERE config IS NOT NULL`
    )
    for (const row of rows) {
      const config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config
      let changed = false
      for (const key of SENSITIVE_KEYS) {
        if (config[key] && typeof config[key] === 'string' && config[key].startsWith('enc:')) {
          try {
            config[key] = decryptValue(config[key].slice(4), secret)
            changed = true
          } catch { /* skip rows that can't be decrypted */ }
        }
      }
      if (changed) {
        await queryInterface.sequelize.query(
          `UPDATE notification_servers SET config = :cfg WHERE id = :id`,
          { replacements: { cfg: JSON.stringify(config), id: row.id } }
        )
      }
    }

    const columnsDown = await queryInterface.describeTable('notification_servers')
    if (columnsDown['description']) {
      await queryInterface.removeColumn('notification_servers', 'description')
    }
  },
}
