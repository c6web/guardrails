'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('group_memberships', {
      id: { type: Sequelize.DataTypes.UUID, defaultValue: Sequelize.DataTypes.UUIDV4, primaryKey: true },
      user_id: { type: Sequelize.DataTypes.UUID, allowNull: false },
      group_id: { type: Sequelize.DataTypes.UUID, allowNull: false },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
    })
    await queryInterface.addIndex('group_memberships', ['user_id'])
    await queryInterface.addIndex('group_memberships', ['group_id'])
  },
  async down(queryInterface) {
    await queryInterface.dropTable('group_memberships')
  },
}
