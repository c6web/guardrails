'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('connected_apps', 'primary_provider_id', {
      type: Sequelize.DataTypes.UUID,
      allowNull: true,
    })
    await queryInterface.addColumn('connected_apps', 'backup1_provider_id', {
      type: Sequelize.DataTypes.UUID,
      allowNull: true,
    })
    await queryInterface.addColumn('connected_apps', 'backup2_provider_id', {
      type: Sequelize.DataTypes.UUID,
      allowNull: true,
    })

    try {
      await queryInterface.addConstraint('connected_apps', {
        fields: ['primary_provider_id'],
        type: 'foreign key',
        name: 'fk_connected_apps_primary_provider_id',
        references: { table: 'ai_providers', field: 'id' },
        onDelete: 'SET NULL',
      })
    } catch (e) {
      // FK may already exist or referenced table may not exist yet
    }

    try {
      await queryInterface.addConstraint('connected_apps', {
        fields: ['backup1_provider_id'],
        type: 'foreign key',
        name: 'fk_connected_apps_backup1_provider_id',
        references: { table: 'ai_providers', field: 'id' },
        onDelete: 'SET NULL',
      })
    } catch (e) {
      // FK may already exist or referenced table may not exist yet
    }

    try {
      await queryInterface.addConstraint('connected_apps', {
        fields: ['backup2_provider_id'],
        type: 'foreign key',
        name: 'fk_connected_apps_backup2_provider_id',
        references: { table: 'ai_providers', field: 'id' },
        onDelete: 'SET NULL',
      })
    } catch (e) {
      // FK may already exist or referenced table may not exist yet
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('connected_apps', 'primary_provider_id')
    await queryInterface.removeColumn('connected_apps', 'backup1_provider_id')
    await queryInterface.removeColumn('connected_apps', 'backup2_provider_id')
  },
}
