'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('embedding_providers', {
      id: {
        type: Sequelize.DataTypes.STRING(50),
        primaryKey: true,
      },
      name: { type: Sequelize.DataTypes.STRING(255), allowNull: false },
      vendor: { type: Sequelize.DataTypes.STRING(100), allowNull: false },
      endpoint: { type: Sequelize.DataTypes.STRING(512), allowNull: false },
      api_key: { type: Sequelize.DataTypes.TEXT, allowNull: true },
      model: { type: Sequelize.DataTypes.STRING(255), allowNull: true },
      dimensions: { type: Sequelize.DataTypes.INTEGER, allowNull: true },
      timeout_ms: { type: Sequelize.DataTypes.INTEGER, allowNull: false, defaultValue: 30000 },
      provider:   { type: Sequelize.DataTypes.STRING(255), allowNull: true },
      allow_fallbacks: { type: Sequelize.DataTypes.BOOLEAN, allowNull: true },
      data_collection: { type: Sequelize.DataTypes.STRING(50), allowNull: true },
      status: {
        type: Sequelize.DataTypes.ENUM('healthy', 'degraded', 'unhealthy'),
        allowNull: false,
        defaultValue: 'healthy',
      },
      notes: { type: Sequelize.DataTypes.TEXT, allowNull: true },
      requests_24h: { type: Sequelize.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      errors_24h: { type: Sequelize.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      avg_latency_ms: { type: Sequelize.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: {
        type: Sequelize.DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    }, { if_not_exists: true })

    await queryInterface.addIndex('embedding_providers', ['vendor']).catch(() => {})
  },

  async down(queryInterface) {
    await queryInterface.dropTable('embedding_providers', { if_exists: true })
  },
}
