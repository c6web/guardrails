'use strict'
module.exports = {
  async up(queryInterface) {
    await queryInterface.dropTable('owasp_threats')
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.createTable('owasp_threats', {
      id: { type: Sequelize.DataTypes.UUID, defaultValue: Sequelize.DataTypes.UUIDV4, primaryKey: true },
      code: { type: Sequelize.DataTypes.STRING(10), allowNull: false, unique: true },
      name: { type: Sequelize.DataTypes.STRING(255), allowNull: false },
      short_name: { type: Sequelize.DataTypes.STRING(100), allowNull: false },
      description: { type: Sequelize.DataTypes.TEXT, allowNull: false },
      color: {
        type: Sequelize.DataTypes.ENUM('danger', 'warning', 'info'),
        allowNull: false,
      },
      display_order: { type: Sequelize.DataTypes.INTEGER, allowNull: false },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
    })
    await queryInterface.addIndex('owasp_threats', ['code'])
  },
}
