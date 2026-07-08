'use strict'

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE ai_request_logs
        ADD COLUMN IF NOT EXISTS content_quality_scanned BOOLEAN NULL,
        ADD COLUMN IF NOT EXISTS content_quality_groundedness DOUBLE PRECISION NULL,
        ADD COLUMN IF NOT EXISTS content_quality_relevance DOUBLE PRECISION NULL,
        ADD COLUMN IF NOT EXISTS content_quality_hallucination DOUBLE PRECISION NULL,
        ADD COLUMN IF NOT EXISTS content_quality_flagged BOOLEAN NULL,
        ADD COLUMN IF NOT EXISTS content_quality_action TEXT NULL,
        ADD COLUMN IF NOT EXISTS content_quality_reason TEXT NULL;
    `)
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE ai_request_logs
        DROP COLUMN IF EXISTS content_quality_scanned,
        DROP COLUMN IF EXISTS content_quality_groundedness,
        DROP COLUMN IF EXISTS content_quality_relevance,
        DROP COLUMN IF EXISTS content_quality_hallucination,
        DROP COLUMN IF EXISTS content_quality_flagged,
        DROP COLUMN IF EXISTS content_quality_action,
        DROP COLUMN IF EXISTS content_quality_reason;
    `)
  },
}
