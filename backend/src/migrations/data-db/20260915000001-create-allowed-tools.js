'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('allowed_tools', {
      id: { type: Sequelize.DataTypes.UUID, defaultValue: Sequelize.DataTypes.UUIDV4, primaryKey: true },
      app_id: {
        type: Sequelize.DataTypes.UUID,
        allowNull: false,
        references: { model: 'connected_apps', key: 'id' },
        onDelete: 'CASCADE',
      },
      tool_name: {
        type: Sequelize.DataTypes.STRING(128),
        allowNull: false,
      },
      description: {
        type: Sequelize.DataTypes.TEXT,
        allowNull: true,
      },
      parameters_schema: {
        type: Sequelize.DataTypes.JSONB,
        allowNull: true,
      },
      max_calls_per_request: {
        type: Sequelize.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 10,
      },
      requires_approval: {
        type: Sequelize.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      active: {
        type: Sequelize.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
    })

    await queryInterface.createTable('tool_audit_log', {
      id: { type: Sequelize.DataTypes.UUID, defaultValue: Sequelize.DataTypes.UUIDV4, primaryKey: true },
      request_id: {
        type: Sequelize.DataTypes.STRING(64),
        allowNull: true,
      },
      app_id: {
        type: Sequelize.DataTypes.UUID,
        allowNull: false,
        references: { model: 'connected_apps', key: 'id' },
        onDelete: 'CASCADE',
      },
      tool_name: {
        type: Sequelize.DataTypes.STRING(128),
        allowNull: false,
      },
      invocation_count: {
        type: Sequelize.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
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
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.DataTypes.NOW },
    })

    await queryInterface.addIndex('allowed_tools', ['app_id', 'tool_name'], { unique: true })
    await queryInterface.addIndex('tool_audit_log', ['app_id', 'created_at'])
  },
  async down(queryInterface) {
    await queryInterface.dropTable('tool_audit_log')
    await queryInterface.dropTable('allowed_tools')
  },
}
