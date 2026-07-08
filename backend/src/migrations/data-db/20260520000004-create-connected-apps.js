'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('connected_apps', {
      id: { type: Sequelize.DataTypes.UUID, defaultValue: Sequelize.DataTypes.UUIDV4, primaryKey: true },
      name: { type: Sequelize.DataTypes.STRING(255), allowNull: false },
      team: { type: Sequelize.DataTypes.STRING(100), allowNull: true },
      env: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      status: {
        type: Sequelize.DataTypes.ENUM('enable', 'disable'),
        allowNull: false,
        defaultValue: 'enable',
      },
      owner: { type: Sequelize.DataTypes.STRING(100), allowNull: true },
      owner_email: { type: Sequelize.DataTypes.STRING(255), allowNull: true },
      classifier_threshold: { type: Sequelize.DataTypes.FLOAT, allowNull: true, defaultValue: null },
      classifier_prompt: { type: Sequelize.DataTypes.TEXT, allowNull: true, defaultValue: null },
      mode: { type: Sequelize.DataTypes.TEXT, allowNull: false, defaultValue: 'guard' },
      rps: { type: Sequelize.DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
      lat_avg: { type: Sequelize.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      p95: { type: Sequelize.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      blocked_count: { type: Sequelize.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      total_requests: { type: Sequelize.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      sla: { type: Sequelize.DataTypes.FLOAT, allowNull: false, defaultValue: 100 },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
    })
  },
  async down(queryInterface) {
    await queryInterface.dropTable('connected_apps')
  },
}
