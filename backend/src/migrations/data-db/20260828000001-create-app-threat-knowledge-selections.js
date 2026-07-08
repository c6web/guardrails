'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables()
    if (!tables.includes('app_threat_knowledge_selections')) {
      await queryInterface.createTable('app_threat_knowledge_selections', {
        app_id: {
          type: Sequelize.UUID,
          allowNull: false,
          primaryKey: true,
          references: { model: 'connected_apps', key: 'id' },
          onDelete: 'CASCADE',
        },
        threat_knowledge_id: {
          type: Sequelize.UUID,
          allowNull: false,
          primaryKey: true,
          references: { model: 'threat_knowledge', key: 'id' },
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
    await queryInterface.dropTable('app_threat_knowledge_selections')
  },
}
