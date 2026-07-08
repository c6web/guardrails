'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ai_providers', {
      id:             { type: Sequelize.STRING(50),  primaryKey: true, allowNull: false },
      name:           { type: Sequelize.STRING(255), allowNull: false },
      vendor:         { type: Sequelize.STRING(100), allowNull: false },
      endpoint:       { type: Sequelize.STRING(512), allowNull: false },
      api_key:        { type: Sequelize.TEXT,        allowNull: true  },
      notes:          { type: Sequelize.TEXT,        allowNull: true  },
      model:          { type: Sequelize.STRING(255), allowNull: true  },
      max_tokens:     { type: Sequelize.INTEGER,     allowNull: true  },
      status: {
        type: Sequelize.ENUM('healthy', 'degraded', 'unhealthy'),
        allowNull: false,
        defaultValue: 'healthy',
      },
      timeout_ms:     { type: Sequelize.INTEGER, allowNull: false, defaultValue: 30000 },
      provider:       { type: Sequelize.STRING(255), allowNull: true },
      allow_fallbacks: { type: Sequelize.BOOLEAN,    allowNull: true },
      data_collection: { type: Sequelize.STRING(50),  allowNull: true },
      requests_24h:   { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      errors_24h:     { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      avg_latency_ms: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at:     { type: Sequelize.DATE,    allowNull: false, defaultValue: Sequelize.NOW },
      updated_at:     { type: Sequelize.DATE,    allowNull: false, defaultValue: Sequelize.NOW },
    })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ai_providers')
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_ai_providers_status"')
  },
}
