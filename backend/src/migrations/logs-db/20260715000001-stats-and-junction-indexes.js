'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    const { sequelize } = queryInterface

    await queryInterface.addIndex('ai_request_logs', ['created_at', 'flagged'], {
      indexName: 'idx_logs_flagged_created',
    })
    await queryInterface.addIndex('ai_request_logs', ['app_id', 'created_at'], {
      indexName: 'idx_logs_app_id_created',
    })
    await sequelize.query(`CREATE INDEX "idx_logs_framework_flagged" ON ai_request_logs (framework_id, flagged) WHERE framework_id IS NOT NULL`)
    await queryInterface.addIndex('ai_request_logs', [
      'created_at', 'flagged', 'duration_ms', 'framework_id', 'app_id', 'tokens_in', 'tokens_out',
    ], {
      indexName: 'idx_logs_covering_overview',
    })
  },
  async down(queryInterface) {
    await queryInterface.removeIndex('ai_request_logs', 'idx_logs_flagged_created')
    await queryInterface.removeIndex('ai_request_logs', 'idx_logs_app_id_created')
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "idx_logs_framework_flagged"`)
    await queryInterface.removeIndex('ai_request_logs', 'idx_logs_covering_overview')
  },
}
