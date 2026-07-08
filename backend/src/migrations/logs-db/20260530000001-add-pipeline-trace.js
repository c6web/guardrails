'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    const { sequelize } = queryInterface

    await sequelize.query(`
      ALTER TABLE ai_request_logs
        ADD COLUMN IF NOT EXISTS pipeline_trace JSONB DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS final_decision VARCHAR(32) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS blocked_stage VARCHAR(64) DEFAULT NULL
    `)
  },
  async down(queryInterface) {
    const { sequelize } = queryInterface
    await sequelize.query(`
      ALTER TABLE ai_request_logs
        DROP COLUMN IF EXISTS pipeline_trace,
        DROP COLUMN IF EXISTS final_decision,
        DROP COLUMN IF EXISTS blocked_stage
    `)
  },
}
