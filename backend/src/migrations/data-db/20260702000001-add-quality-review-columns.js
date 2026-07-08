'use strict'

module.exports = {
  async up(queryInterface) {
    const tables = ['threat_knowledge', 'detectors', 'tool_guardrails']
    const cols = [
      'quality_review_result VARCHAR(20) NULL',
      'quality_review_reason TEXT NULL',
      'quality_reviewed_at TIMESTAMP NULL',
      'quality_reviewed_by UUID NULL',
    ]
    const existing = await queryInterface.showAllTables()
    for (const table of tables) {
      if (!existing.includes(table)) continue
      for (const col of cols) {
        try {
          await queryInterface.sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${col}`)
        } catch (e) {
          // column may already exist — safe to ignore
        }
      }
    }
  },

  async down(queryInterface) {
    const tables = ['threat_knowledge', 'detectors', 'tool_guardrails']
    const cols = ['quality_review_result', 'quality_review_reason', 'quality_reviewed_at', 'quality_reviewed_by']
    const existing = await queryInterface.showAllTables()
    for (const table of tables) {
      if (!existing.includes(table)) continue
      for (const col of cols) {
        try {
          await queryInterface.sequelize.query(`ALTER TABLE ${table} DROP COLUMN ${col}`)
        } catch (e) {
          // column may not exist — safe to ignore
        }
      }
    }
  },
}
