'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_activity_logs', {
      id: { type: Sequelize.DataTypes.UUID, defaultValue: Sequelize.literal('gen_random_uuid()'), primaryKey: true },
      user_id: { type: Sequelize.DataTypes.UUID, allowNull: true },
      user_email: { type: Sequelize.DataTypes.STRING(255), allowNull: false },
      activity_type: { type: Sequelize.DataTypes.STRING(100), allowNull: false },
      details: { type: Sequelize.DataTypes.JSONB, allowNull: false },
      ip_address: { type: Sequelize.DataTypes.STRING(45), allowNull: false },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
    })
    await queryInterface.addIndex('user_activity_logs', ['user_id'])
    await queryInterface.addIndex('user_activity_logs', ['created_at'])
  },
  async down(queryInterface) {
    await queryInterface.dropTable('user_activity_logs')
  },
}
