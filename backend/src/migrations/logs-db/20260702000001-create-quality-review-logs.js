'use strict'

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE quality_review_logs (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        target_type       VARCHAR(50)  NOT NULL,
        target_id         UUID         NOT NULL,
        target_name       VARCHAR(500) NOT NULL,
        previous_result   VARCHAR(20)  NULL,
        new_result        VARCHAR(20)  NOT NULL,
        reason            TEXT         NOT NULL,
        reviewed_by       UUID         NOT NULL,
        reviewed_by_email VARCHAR(255) NOT NULL,
        created_at        TIMESTAMP    NOT NULL DEFAULT NOW()
      )
    `)
    await queryInterface.sequelize.query(`
      CREATE INDEX idx_quality_review_logs_target ON quality_review_logs (target_type, target_id)
    `)
    await queryInterface.sequelize.query(`
      CREATE INDEX idx_quality_review_logs_created ON quality_review_logs (created_at DESC)
    `)
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS quality_review_logs')
  },
}
