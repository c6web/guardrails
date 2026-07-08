'use strict'

module.exports = {
  async up(queryInterface) {
    const tables = await queryInterface.showAllTables()
    if (tables.includes('tool_audit_log')) {
      await queryInterface.dropTable('tool_audit_log')
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.createTable('tool_audit_log', {
      id: {
        type: Sequelize.DataTypes.UUID,
        defaultValue: Sequelize.DataTypes.UUIDV4,
        primaryKey: true,
      },
      request_id: { type: Sequelize.DataTypes.STRING(64), allowNull: true },
      app_id: {
        type: Sequelize.DataTypes.UUID,
        allowNull: false,
        references: { model: 'connected_apps', key: 'id' },
        onDelete: 'CASCADE',
      },
      tool_name: { type: Sequelize.DataTypes.STRING(128), allowNull: false },
      invocation_count: { type: Sequelize.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      approved: { type: Sequelize.DataTypes.BOOLEAN, allowNull: true },
      violation_flag: { type: Sequelize.DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
    })
  },
}
