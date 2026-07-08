'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ai_provider_call_logs', {
      id:               { type: Sequelize.DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      request_id:       { type: Sequelize.DataTypes.STRING(100), allowNull: true },
      call_type:        { type: Sequelize.DataTypes.STRING(32),  allowNull: false },
      source:           { type: Sequelize.DataTypes.STRING(50),  allowNull: false, defaultValue: 'pipeline' },
      app_id:           { type: Sequelize.DataTypes.STRING(50),  allowNull: true },
      app_name:         { type: Sequelize.DataTypes.STRING(255), allowNull: true },
      provider_id:      { type: Sequelize.DataTypes.STRING(100), allowNull: true },
      provider_name:    { type: Sequelize.DataTypes.STRING(255), allowNull: true },
      vendor:           { type: Sequelize.DataTypes.STRING(50),  allowNull: true },
      model:            { type: Sequelize.DataTypes.STRING(200), allowNull: true },
      endpoint:         { type: Sequelize.DataTypes.STRING(500), allowNull: true },
      request_payload:  { type: Sequelize.DataTypes.JSONB,       allowNull: true },
      response_payload: { type: Sequelize.DataTypes.JSONB,       allowNull: true },
      tokens_in:        { type: Sequelize.DataTypes.INTEGER,     allowNull: true },
      tokens_out:       { type: Sequelize.DataTypes.INTEGER,     allowNull: true },
      tokens_total:     { type: Sequelize.DataTypes.INTEGER,     allowNull: true },
      duration_ms:      { type: Sequelize.DataTypes.INTEGER,     allowNull: false, defaultValue: 0 },
      status_code:      { type: Sequelize.DataTypes.SMALLINT,    allowNull: true },
      success:          { type: Sequelize.DataTypes.BOOLEAN,     allowNull: false, defaultValue: false },
      error_message:    { type: Sequelize.DataTypes.TEXT,        allowNull: true },
      triggered_by:     { type: Sequelize.DataTypes.STRING(255), allowNull: true },
      created_at:       { type: Sequelize.DataTypes.DATE,        allowNull: false },
    })
    await queryInterface.addIndex('ai_provider_call_logs', ['request_id'])
    await queryInterface.addIndex('ai_provider_call_logs', ['provider_id'])
    await queryInterface.addIndex('ai_provider_call_logs', ['call_type'])
    await queryInterface.addIndex('ai_provider_call_logs', ['success'])
    await queryInterface.addIndex('ai_provider_call_logs', ['model'])
    await queryInterface.addIndex('ai_provider_call_logs', ['created_at'])
  },
  async down(queryInterface) {
    await queryInterface.dropTable('ai_provider_call_logs')
  },
}
