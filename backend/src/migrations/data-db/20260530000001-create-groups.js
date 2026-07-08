'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('groups', {
      id: { type: Sequelize.DataTypes.UUID, defaultValue: Sequelize.DataTypes.UUIDV4, primaryKey: true },
      name: { type: Sequelize.DataTypes.STRING(100), allowNull: false },
      role: {
        type: Sequelize.DataTypes.ENUM('admin', 'viewer', 'user'),
        allowNull: false,
      },
      is_default: { type: Sequelize.DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
    })
    await queryInterface.addIndex('groups', ['name'])
  },
  async down(queryInterface) {
    await queryInterface.dropTable('groups')
  },
}
