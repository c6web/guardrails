'use strict'

const OUTPUT_DETECTORS = [
  { id: '00000000-0000-0010-0000-000000000001', name: 'PII - Email Address',            description: 'Detects email addresses in AI responses',              threshold: 0.85, mode: 'flag',  rule_type: 'regex', scanning_scope: 'output', redaction_placeholder: null,   keywords: ['(?i)[^\\w]\\w+(@| at )[\\w-]+\\.+(\\w|-)+[\\w-]+'] },
  { id: '00000000-0000-0010-0000-000000000002', name: 'PII - Phone Number',             description: 'Detects phone number patterns in AI responses',         threshold: 0.85, mode: 'flag',  rule_type: 'regex', scanning_scope: 'output', redaction_placeholder: null,   keywords: ['\\b\\d{3}[-.\\s]?\\d{3}[-.\\s]?\\d{4}\\b|\\(\\d{3}\\)[-.\\s]?\\d{3}[-.\\s]?\\d{4}'] },
  { id: '00000000-0000-0010-0000-000000000003', name: 'PII - SSN',                      description: 'Detects Social Security Numbers in AI responses',       threshold: 0.95, mode: 'block', rule_type: 'regex', scanning_scope: 'output', redaction_placeholder: null,   keywords: ['\\b\\d{3}-\\d{2}-\\d{4}\\b'] },
  { id: '00000000-0000-0010-0000-000000000004', name: 'Credential - API Key Pattern',    description: 'Detects generic API key patterns in AI responses',       threshold: 0.95, mode: 'block', rule_type: 'regex', scanning_scope: 'output', redaction_placeholder: null,   keywords: ['(?i)(api[_-]?key|apikey)\\s*[=:]\\s*[a-zA-Z0-9]{20,}'] },
  { id: '00000000-0000-0010-0000-000000000005', name: 'Credential - Bearer Token',      description: 'Detects bearer token values in AI responses',           threshold: 0.95, mode: 'block', rule_type: 'regex', scanning_scope: 'output', redaction_placeholder: null,   keywords: ['(?i)bearer\\s+[a-zA-Z0-9._~\\-/+]+=*'] },
  { id: '00000000-0000-0010-0000-000000000006', name: 'Credential - AWS Key',            description: 'Detects AWS access key IDs and secret keys in AI responses', threshold: 0.95, mode: 'block', rule_type: 'regex', scanning_scope: 'output', redaction_placeholder: null, keywords: ['(?i)(AKIA[0-9A-Z]{16})|(aws_secret_access_key\\s*[=:]\\s*[a-zA-Z0-9]{40})'] },
  { id: '00000000-0000-0010-0000-000000000007', name: 'PII - Credit Card',               description: 'Detects credit card numbers using Luhn pattern in AI responses', threshold: 0.95, mode: 'block', rule_type: 'regex', scanning_scope: 'output', redaction_placeholder: null, keywords: ['(?:(4\\d{3}|[2-5]\\d{2}|6011)[\\- ]?\\d{4}[\\- ]?\\d{4}[\\- ]?\\d{3}|(4\\d{3}|[2-5]\\d{2}|6011)[\\- ]?\\d{4}[\\- ]?\\d{4})'] },
  { id: '00000000-0000-0010-0000-000000000008', name: 'PII - IP Address',                description: 'Detects IPv4 addresses in AI responses',                threshold: 0.85, mode: 'flag',  rule_type: 'regex', scanning_scope: 'output', redaction_placeholder: null,   keywords: ['\\b(\\d{1,3}\\.){3}\\d{1,3}\\b'] },
  { id: '00000000-0000-0010-0000-000000000009', name: 'Credential - Private Key',        description: 'Detects private key headers in AI responses',            threshold: 0.95, mode: 'block', rule_type: 'regex', scanning_scope: 'output', redaction_placeholder: null,   keywords: ['(?i)(-----BEGIN\\s+(RSA|DSA|EC|OPENSSH)\\s+PRIVATE KEY-----)'] },
  { id: '00000000-0000-0010-0000-000000000010', name: 'Harmful - Dangerous Instructions', description: 'Detects responses containing dangerous system modification instructions', threshold: 0.95, mode: 'block', rule_type: 'regex', scanning_scope: 'output', redaction_placeholder: null, keywords: ['(?i)(\\bformat\\s+c|\\bdelete\\s+--|\\bremove\\s+all|\\boverride\\s+safety|\\bdisable\\s+security)'] },
  { id: '00000000-0000-0010-0000-000000000011', name: 'PII Redact - Email Address',     description: 'Redacts email addresses in AI responses with [EMAIL]',   threshold: 0.85, mode: 'redact', rule_type: 'regex', scanning_scope: 'output', redaction_placeholder: '[EMAIL]', keywords: ['[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-z]{2,}'] },
  { id: '00000000-0000-0010-0000-000000000012', name: 'PII Redact - Phone Number',      description: 'Redacts phone number patterns in AI responses with [PHONE]', threshold: 0.85, mode: 'redact', rule_type: 'regex', scanning_scope: 'output', redaction_placeholder: '[PHONE]', keywords: ['\\b\\d{3}[-.\\s]?\\d{3}[-.\\s]?\\d{4}\\b|\\(\\d{3}\\)[-.\\s]?\\d{3}[-.\\s]?\\d{4}'] },
]

module.exports = {
  async up(queryInterface, Sequelize) {
    // Step 1: Migrate existing output_detectors data into detectors table
    const now = new Date()
    for (const d of OUTPUT_DETECTORS) {
      await queryInterface.sequelize.query(
        `INSERT INTO detectors (id, name, description, threshold, mode, rule_type, scanning_scope, keywords, redaction_placeholder, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (name) DO UPDATE SET
           id = EXCLUDED.id,
           description = EXCLUDED.description,
           threshold = EXCLUDED.threshold,
           mode = EXCLUDED.mode,
           rule_type = EXCLUDED.rule_type,
           scanning_scope = EXCLUDED.scanning_scope,
           keywords = EXCLUDED.keywords,
           redaction_placeholder = EXCLUDED.redaction_placeholder,
           updated_at = EXCLUDED.updated_at`,
        { bind: [d.id, d.name, d.description, d.threshold, d.mode, d.rule_type, d.scanning_scope, d.keywords, d.redaction_placeholder, now, now] }
      )
    }

    // Step 2: Also copy any existing output_detector rows that aren't in our hardcoded list
    // (user-created output detectors). On a fresh database this table won't exist, skip silently.
    try {
      const existing = await queryInterface.sequelize.query(
        `SELECT id, name, description, mode, patterns FROM output_detectors WHERE enabled = true`,
        { type: 'SELECT' }
      )
      for (const row of existing) {
        const knownIds = new Set(OUTPUT_DETECTORS.map(d => d.id))
        if (!knownIds.has(row.id)) {
          await queryInterface.sequelize.query(
            `INSERT INTO detectors (id, name, description, threshold, mode, rule_type, scanning_scope, keywords, created_at, updated_at)
             VALUES ($1, $2, $3, 0.85, $4, 'regex', 'output', $5, $6, $7)
             ON CONFLICT (name) DO UPDATE SET
               id = EXCLUDED.id,
               description = EXCLUDED.description,
               threshold = EXCLUDED.threshold,
               mode = EXCLUDED.mode,
               rule_type = EXCLUDED.rule_type,
               scanning_scope = EXCLUDED.scanning_scope,
               keywords = EXCLUDED.keywords,
               updated_at = EXCLUDED.updated_at`,
            { bind: [row.id, row.name, row.description, row.mode, row.patterns || [], now, now] }
          )
        }
      }
    } catch (e) {
      // output_detectors table may not exist on fresh installs
    }

    // Step 3: Drop the old tables
    await queryInterface.dropTable('app_output_detector_selections').catch(() => {})
    await queryInterface.dropTable('output_detectors').catch(() => {})
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.createTable('output_detectors', {
      id: {
        type: Sequelize.DataTypes.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      name:                  { type: Sequelize.DataTypes.STRING(100), allowNull: false },
      description:           { type: Sequelize.DataTypes.TEXT, allowNull: false },
      patterns:              { type: Sequelize.DataTypes.ARRAY(Sequelize.DataTypes.STRING), allowNull: true, defaultValue: [] },
      category:              { type: Sequelize.DataTypes.STRING(50), allowNull: true },
      mode:                  { type: Sequelize.DataTypes.STRING(20), allowNull: false, defaultValue: 'block' },
      enabled:               { type: Sequelize.DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      redaction_placeholder: { type: Sequelize.DataTypes.STRING(255), allowNull: true, defaultValue: '[REDACTED]' },
      created_at:            { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at:            { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    })
    await queryInterface.createTable('app_output_detector_selections', {
      app_id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: 'connected_apps', key: 'id' },
        onDelete: 'CASCADE',
      },
      detector_id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: 'detectors', key: 'id' },
        onDelete: 'CASCADE',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    })
    await queryInterface.sequelize.query(
      `INSERT INTO output_detectors (id, name, description, patterns, mode, redaction_placeholder, enabled, created_at, updated_at)
       SELECT id, name, description, keywords, mode, redaction_placeholder, true, created_at, updated_at
       FROM detectors
       WHERE scanning_scope = 'output'
       ON CONFLICT (id) DO NOTHING`
    )
    await queryInterface.sequelize.query(
      `INSERT INTO app_output_detector_selections (app_id, detector_id, created_at, updated_at)
       SELECT ads.app_id, ads.detector_id, ads.created_at, ads.updated_at
       FROM app_detector_selections ads
       JOIN detectors d ON d.id = ads.detector_id
       WHERE d.scanning_scope = 'output'
       ON CONFLICT (app_id, detector_id) DO NOTHING`
    )
  },
}
