'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('reload_logs', {
      id: { type: Sequelize.DataTypes.UUID, defaultValue: Sequelize.literal('gen_random_uuid()'), primaryKey: true },
      triggered_by: { type: Sequelize.DataTypes.STRING(50), allowNull: false },
      key_prefix: { type: Sequelize.DataTypes.STRING(20), allowNull: false },
      gateway_instance_id: { type: Sequelize.DataTypes.STRING(100), allowNull: true },
      source_ip: { type: Sequelize.DataTypes.STRING(45), allowNull: false },
      result: { type: Sequelize.DataTypes.STRING(20), allowNull: false },
      error_message: { type: Sequelize.DataTypes.TEXT, allowNull: true },
      duration_ms: { type: Sequelize.DataTypes.BIGINT, allowNull: false },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
    })
    await queryInterface.addIndex('reload_logs', ['created_at'])
    await queryInterface.addIndex('reload_logs', ['result'])
  },
  async down(queryInterface) {
    await queryInterface.dropTable('reload_logs')
  },
}
