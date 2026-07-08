'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables()

    // Drop old allowed_tools table (tool_audit_log references connected_apps, not allowed_tools — safe to drop separately)
    if (tables.includes('allowed_tools')) {
      await queryInterface.dropTable('allowed_tools')
    }

    // Create centralized tool guardrails library (no app_id)
    if (!tables.includes('tool_guardrails')) {
      await queryInterface.createTable('tool_guardrails', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.DataTypes.UUIDV4,
          primaryKey: true,
        },
        tool_name: {
          type: Sequelize.STRING(128),
          allowNull: false,
          unique: true,
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        parameters_schema: {
          type: Sequelize.JSONB,
          allowNull: true,
        },
        active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        quality_review_result: {
          type: Sequelize.STRING(20),
          allowNull: true,
        },
        quality_review_reason: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        quality_reviewed_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        quality_reviewed_by: {
          type: Sequelize.UUID,
          allowNull: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()'),
        },
      })
    }

    // Create per-app tool blocking selections (empty = nothing blocked = all allowed)
    if (!tables.includes('app_tool_guardrail_selections')) {
      await queryInterface.createTable('app_tool_guardrail_selections', {
        app_id: {
          type: Sequelize.UUID,
          allowNull: false,
          primaryKey: true,
          references: { model: 'connected_apps', key: 'id' },
          onDelete: 'CASCADE',
        },
        tool_guardrail_id: {
          type: Sequelize.UUID,
          allowNull: false,
          primaryKey: true,
          references: { model: 'tool_guardrails', key: 'id' },
          onDelete: 'CASCADE',
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()'),
        },
      })
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('app_tool_guardrail_selections')
    await queryInterface.dropTable('tool_guardrails')
  },
}
