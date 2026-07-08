'use strict'

// Adds the generic "Quality Review" (poison-detection) columns to
// content_quality_judge_prompts, mirroring the same columns already present on
// detectors/threat_knowledge/tool_guardrails/t2_agent_prompts (migration
// 20260702000001-add-quality-review-columns.js, 20270709000001-add-quality-review-to-t2-prompts.js).
// This is deliberately the same generic reviewer system (backend/src/routes/qualityReview.ts,
// resourceType='content-quality-judge-prompts') — not a new review pipeline.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE content_quality_judge_prompts
        ADD COLUMN quality_review_result VARCHAR(20) NULL,
        ADD COLUMN quality_review_reason TEXT NULL,
        ADD COLUMN quality_reviewed_at TIMESTAMP NULL,
        ADD COLUMN quality_reviewed_by UUID NULL
    `)
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE content_quality_judge_prompts
        DROP COLUMN quality_review_result,
        DROP COLUMN quality_review_reason,
        DROP COLUMN quality_reviewed_at,
        DROP COLUMN quality_reviewed_by
    `)
  },
}
