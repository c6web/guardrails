'use strict'

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE ai_request_logs ADD COLUMN IF NOT EXISTS framework_id VARCHAR(50) NULL`
    )
    const columns = await queryInterface.describeTable('ai_request_logs')
    if (columns['output_scan_category']) {
      await queryInterface.sequelize.query(
        `ALTER TABLE ai_request_logs RENAME COLUMN output_scan_category TO output_scan_framework_id`
      )
    }
    await queryInterface.sequelize.query(
      `ALTER TABLE ai_request_logs DROP COLUMN IF EXISTS owasp_category`
    )
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE ai_request_logs DROP COLUMN IF EXISTS framework_id`
    )
    const columnsDown = await queryInterface.describeTable('ai_request_logs')
    if (columnsDown['output_scan_framework_id']) {
      await queryInterface.sequelize.query(
        `ALTER TABLE ai_request_logs RENAME COLUMN output_scan_framework_id TO output_scan_category`
      )
    }
    await queryInterface.sequelize.query(
      `ALTER TABLE ai_request_logs ADD COLUMN IF NOT EXISTS owasp_category VARCHAR(10) DEFAULT NULL`
    )
  },
}
