'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables()
    if (tables.includes('tool_audit_log')) return

    await queryInterface.createTable('tool_audit_log', {
      id: {
        type: Sequelize.DataTypes.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      request_id: {
        type: Sequelize.DataTypes.STRING(100),
        allowNull: true,
      },
      app_id: {
        type: Sequelize.DataTypes.UUID,
        allowNull: false,
      },
      app_name: {
        type: Sequelize.DataTypes.STRING(255),
        allowNull: true,
      },
      tool_name: {
        type: Sequelize.DataTypes.STRING(128),
        allowNull: false,
      },
      invocation_count: {
        type: Sequelize.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      approved: {
        type: Sequelize.DataTypes.BOOLEAN,
        allowNull: true,
      },
      violation_flag: {
        type: Sequelize.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      created_at: {
        type: Sequelize.DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    })

    await queryInterface.addIndex('tool_audit_log', ['app_id', 'created_at'])
    await queryInterface.addIndex('tool_audit_log', ['request_id'])
  },

  async down(queryInterface) {
    await queryInterface.dropTable('tool_audit_log')
  },
}
