'use strict'
const { Op } = require('sequelize')
const { randomUUID } = require('crypto')

module.exports = {
  async up(queryInterface) {
    const now = new Date()

    const detectors = [
      { name: 'regex.email', description: 'Detects email addresses in prompts', threshold: 0.90, mode: 'flag', rule_type: 'regex', scanning_scope: 'both', keywords: ['[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}'] },
      { name: 'regex.uuid', description: 'Detects UUID/GUID patterns (potential sensitive identifiers)', threshold: 0.85, mode: 'flag', rule_type: 'regex', scanning_scope: 'both', keywords: ['[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'] },
      { name: 'regex.ipv4', description: 'Detects IPv4 addresses — internal IPs may leak infrastructure info', threshold: 0.85, mode: 'flag', rule_type: 'regex', scanning_scope: 'both', keywords: ['\\b(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]?\\d)\\.(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]?\\d)\\.(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]?\\d)\\.(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]?\\d)\\b'] },
      { name: 'regex.aws-key', description: 'Detects AWS access key IDs (AKIA prefix)', threshold: 0.95, mode: 'block', rule_type: 'regex', scanning_scope: 'input', keywords: ['AKIA[0-9A-Z]{16}'] },
      { name: 'regex.jwt', description: 'Detects JWT tokens (base64url header.payload.signature)', threshold: 0.90, mode: 'block', rule_type: 'regex', scanning_scope: 'input', keywords: ['eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+'] },
      { name: 'regex.sql-injection', description: 'Detects SQL injection patterns in prompts', threshold: 0.95, mode: 'block', rule_type: 'regex', scanning_scope: 'input', keywords: ['(?:union\\s+all\\s+select|;\\s*(?:drop|delete|update|insert)\\s|--\\s*$|/\\*.*\\*/|\\bOR\\s+1\\s*=\\s*1)'] },
      { name: 'regex.xss', description: 'Detects XSS patterns — script tags, event handlers, javascript URIs', threshold: 0.95, mode: 'block', rule_type: 'regex', scanning_scope: 'input', keywords: ['<(?:script|img|iframe)[^>]*>|javascript:|on(?:load|error|click|submit)\\s*='] },
      { name: 'regex.credit-card', description: 'Detects credit card number formats (grouped digits)', threshold: 0.95, mode: 'block', rule_type: 'regex', scanning_scope: 'both', keywords: ['\\b(?:4\\d{3}|[2-5]\\d{3}|6011|3\\d{3})[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{3,4}\\b'] },
    ]

    const records = detectors.map(d => ({
      id: randomUUID(),
      name: d.name,
      description: d.description,
      threshold: d.threshold,
      mode: d.mode,
      rule_type: d.rule_type,
      scanning_scope: d.scanning_scope,
      keywords: d.keywords,
      created_at: now,
      updated_at: now,
    }))

    const existing = await queryInterface.sequelize.query(
      `SELECT name FROM detectors WHERE name LIKE 'regex.%'`,
      { type: 'SELECT' }
    )
    const existingNames = new Set(existing.map(r => r.name))
    const toInsert = records.filter(r => !existingNames.has(r.name))
    if (toInsert.length > 0) {
      await queryInterface.bulkInsert('detectors', toInsert)
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('detectors', {
      name: { [Op.like]: 'regex.%' },
    }, {})
  },
}
