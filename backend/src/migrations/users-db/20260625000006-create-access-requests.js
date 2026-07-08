'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('access_requests', {
      id: { type: Sequelize.DataTypes.UUID, defaultValue: Sequelize.DataTypes.UUIDV4, primaryKey: true },
      full_name: { type: Sequelize.DataTypes.STRING(200), allowNull: false },
      email: { type: Sequelize.DataTypes.STRING(255), allowNull: false },
      company: { type: Sequelize.DataTypes.STRING(200), allowNull: true },
      reason: { type: Sequelize.DataTypes.TEXT, allowNull: true },
      status: {
        type: Sequelize.DataTypes.ENUM('pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'pending',
      },
      admin_notes: { type: Sequelize.DataTypes.TEXT, allowNull: true },
      reviewed_by: { type: Sequelize.DataTypes.UUID, allowNull: true },
      reviewed_at: { type: Sequelize.DataTypes.DATE, allowNull: true },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
    })
    await queryInterface.addIndex('access_requests', ['email'])
    await queryInterface.addIndex('access_requests', ['status'])
  },

  async down(queryInterface) {
    await queryInterface.dropTable('access_requests')
  },
}
