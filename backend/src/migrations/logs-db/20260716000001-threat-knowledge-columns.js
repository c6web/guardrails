'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    const { sequelize } = queryInterface

    await sequelize.query(`
      ALTER TABLE ai_request_logs
        ADD COLUMN IF NOT EXISTS threat_knowledge_matches JSONB DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS semantic_threshold DOUBLE PRECISION DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS false_positive_candidate BOOLEAN DEFAULT FALSE
    `)
  },
  async down(queryInterface) {
    const { sequelize } = queryInterface
    await sequelize.query(`
      ALTER TABLE ai_request_logs
        DROP COLUMN IF EXISTS threat_knowledge_matches,
        DROP COLUMN IF EXISTS semantic_threshold,
        DROP COLUMN IF EXISTS false_positive_candidate
    `)
  },
}
