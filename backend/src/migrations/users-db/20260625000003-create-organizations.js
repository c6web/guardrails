'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('organizations', {
      id: { type: Sequelize.DataTypes.UUID, defaultValue: Sequelize.DataTypes.UUIDV4, primaryKey: true },
      name: { type: Sequelize.DataTypes.STRING(200), allowNull: false },
      owner_user_id: { type: Sequelize.DataTypes.UUID, allowNull: true },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
    })
    await queryInterface.addIndex('organizations', ['owner_user_id'])
  },

  async down(queryInterface) {
    await queryInterface.dropTable('organizations')
  },
}
