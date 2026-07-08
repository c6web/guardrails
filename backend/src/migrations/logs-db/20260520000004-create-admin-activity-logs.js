'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('admin_activity_logs', {
      id: { type: Sequelize.DataTypes.UUID, defaultValue: Sequelize.literal('gen_random_uuid()'), primaryKey: true },
      admin_id: { type: Sequelize.DataTypes.UUID, allowNull: false },
      admin_email: { type: Sequelize.DataTypes.STRING(255), allowNull: false },
      action: { type: Sequelize.DataTypes.STRING(100), allowNull: false },
      target_type: { type: Sequelize.DataTypes.STRING(100), allowNull: false },
      target_id: { type: Sequelize.DataTypes.STRING(255), allowNull: true },
      before_state: { type: Sequelize.DataTypes.JSONB, allowNull: true },
      after_state: { type: Sequelize.DataTypes.JSONB, allowNull: true },
      ip_address: { type: Sequelize.DataTypes.STRING(45), allowNull: false },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
    })
    await queryInterface.addIndex('admin_activity_logs', ['admin_id'])
    await queryInterface.addIndex('admin_activity_logs', ['created_at'])
  },
  async down(queryInterface) {
    await queryInterface.dropTable('admin_activity_logs')
  },
}
