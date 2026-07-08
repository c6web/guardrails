'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('connected_apps');

    if (!columns.enable_response_cache) {
      await queryInterface.addColumn('connected_apps', 'enable_response_cache', {
        type: Sequelize.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      })
    }

    if (!columns.cache_ttl_seconds) {
      await queryInterface.addColumn('connected_apps', 'cache_ttl_seconds', {
        type: Sequelize.DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
      })
    }

    if (!columns.multi_turn_semantic_enabled) {
      await queryInterface.addColumn('connected_apps', 'multi_turn_semantic_enabled', {
        type: Sequelize.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      })
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable('connected_apps');

    if (columns.enable_response_cache) {
      await queryInterface.removeColumn('connected_apps', 'enable_response_cache')
    }

    if (columns.cache_ttl_seconds) {
      await queryInterface.removeColumn('connected_apps', 'cache_ttl_seconds')
    }

    if (columns.multi_turn_semantic_enabled) {
      await queryInterface.removeColumn('connected_apps', 'multi_turn_semantic_enabled')
    }
  },
}
