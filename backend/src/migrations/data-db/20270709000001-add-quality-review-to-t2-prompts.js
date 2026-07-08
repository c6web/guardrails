'use strict'

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE t2_agent_prompts
       ADD COLUMN quality_review_result VARCHAR(20) NULL,
       ADD COLUMN quality_review_reason TEXT NULL,
       ADD COLUMN quality_reviewed_at TIMESTAMP NULL,
       ADD COLUMN quality_reviewed_by UUID NULL`
    )
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE t2_agent_prompts
       DROP COLUMN quality_review_result,
       DROP COLUMN quality_review_reason,
       DROP COLUMN quality_reviewed_at,
       DROP COLUMN quality_reviewed_by`
    )
  },
}
