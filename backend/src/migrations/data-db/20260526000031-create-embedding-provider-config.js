'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('embedding_provider_config', {
      id: {
        type: Sequelize.DataTypes.INTEGER,
        primaryKey: true,
        defaultValue: 1,
      },
      primary_id: {
        type: Sequelize.DataTypes.STRING(50),
        allowNull: true,
        defaultValue: null,
      },
      backup1_id: {
        type: Sequelize.DataTypes.STRING(50),
        allowNull: true,
        defaultValue: null,
      },
      backup2_id: {
        type: Sequelize.DataTypes.STRING(50),
        allowNull: true,
        defaultValue: null,
      },
    })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('embedding_provider_config')
  },
}
