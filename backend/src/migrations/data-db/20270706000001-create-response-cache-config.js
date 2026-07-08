'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('response_cache_config', {
      id: {
        type: Sequelize.DataTypes.INTEGER,
        primaryKey: true,
        defaultValue: 1,
      },
      enabled: {
        type: Sequelize.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      exact_match_enabled: {
        type: Sequelize.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      semantic_match_enabled: {
        type: Sequelize.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      semantic_threshold: {
        type: Sequelize.DataTypes.DECIMAL,
        allowNull: false,
        defaultValue: 0.97,
      },
    })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('response_cache_config')
  },
}
