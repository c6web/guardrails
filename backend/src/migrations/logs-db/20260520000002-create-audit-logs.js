'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('audit_logs', {
      id: { type: Sequelize.DataTypes.UUID, defaultValue: Sequelize.literal('gen_random_uuid()'), primaryKey: true },
      actor_id: { type: Sequelize.DataTypes.UUID, allowNull: true },
      actor_email: { type: Sequelize.DataTypes.STRING(255), allowNull: false },
      action: { type: Sequelize.DataTypes.STRING(100), allowNull: false },
      resource_type: { type: Sequelize.DataTypes.STRING(100), allowNull: false },
      resource_id: { type: Sequelize.DataTypes.STRING(255), allowNull: false },
      details: { type: Sequelize.DataTypes.JSONB, allowNull: false },
      ip_address: { type: Sequelize.DataTypes.STRING(45), allowNull: false },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
    })
    await queryInterface.addIndex('audit_logs', ['actor_id'])
    await queryInterface.addIndex('audit_logs', ['resource_type', 'resource_id'])
    await queryInterface.addIndex('audit_logs', ['created_at'])
  },
  async down(queryInterface) {
    await queryInterface.dropTable('audit_logs')
  },
}
