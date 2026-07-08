'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ai_request_logs', {
      id: { type: Sequelize.DataTypes.UUID, defaultValue: Sequelize.literal('gen_random_uuid()'), primaryKey: true },
      request_id: { type: Sequelize.DataTypes.STRING(100), allowNull: false, unique: true },
      app_id: { type: Sequelize.DataTypes.STRING(50), allowNull: false },
      app_name: { type: Sequelize.DataTypes.STRING(255), allowNull: false },
      model: { type: Sequelize.DataTypes.STRING(100), allowNull: false },
      method: { type: Sequelize.DataTypes.STRING(20), allowNull: false },
      path: { type: Sequelize.DataTypes.STRING(255), allowNull: false },
      source_ip: { type: Sequelize.DataTypes.STRING(45), allowNull: false },
      user_identifier: { type: Sequelize.DataTypes.STRING(255), allowNull: false },
      tokens_in: { type: Sequelize.DataTypes.INTEGER, allowNull: false },
      tokens_out: { type: Sequelize.DataTypes.INTEGER, allowNull: false },
      duration_ms: { type: Sequelize.DataTypes.INTEGER, allowNull: false },
      status_code: { type: Sequelize.DataTypes.SMALLINT, allowNull: false },
      flagged: { type: Sequelize.DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      owasp_category: { type: Sequelize.DataTypes.STRING(10), allowNull: true },
      detector: { type: Sequelize.DataTypes.STRING(100), allowNull: true },
      confidence: { type: Sequelize.DataTypes.FLOAT, allowNull: true },
      action: { type: Sequelize.DataTypes.STRING(20), allowNull: true },
      threat_title: { type: Sequelize.DataTypes.TEXT, allowNull: true },
      excerpt: { type: Sequelize.DataTypes.TEXT, allowNull: true },
      user_prompt: { type: Sequelize.DataTypes.TEXT, allowNull: true },
      response_body: { type: Sequelize.DataTypes.TEXT, allowNull: true },
      upstream_provider_id: { type: Sequelize.DataTypes.STRING(100), allowNull: true },
      upstream_provider_name: { type: Sequelize.DataTypes.STRING(255), allowNull: true },
      classifier_provider_id: { type: Sequelize.DataTypes.STRING(100), allowNull: true },
      classifier_provider_name: { type: Sequelize.DataTypes.STRING(255), allowNull: true },
      is_benign: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      marked_by: { type: Sequelize.DataTypes.STRING(255), allowNull: true },
      reason: { type: Sequelize.DataTypes.TEXT, allowNull: true },
      marked_at: { type: Sequelize.DataTypes.DATE, allowNull: true },
      is_classification_correct: { type: Sequelize.BOOLEAN, allowNull: true },
      correction_reason: { type: Sequelize.DataTypes.TEXT, allowNull: true },
      output_scan_flagged: { type: Sequelize.DataTypes.BOOLEAN, allowNull: true },
      output_scan_category: { type: Sequelize.DataTypes.STRING(50), allowNull: true },
      output_scan_confidence: { type: Sequelize.DataTypes.FLOAT, allowNull: true },
      output_scan_detector: { type: Sequelize.DataTypes.STRING(200), allowNull: true },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
    })
    await queryInterface.addIndex('ai_request_logs', ['app_id'])
    await queryInterface.addIndex('ai_request_logs', ['flagged'])
    await queryInterface.addIndex('ai_request_logs', ['created_at'])
  },
  async down(queryInterface) {
    await queryInterface.dropTable('ai_request_logs')
  },
}
