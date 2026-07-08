'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    const { query } = queryInterface.sequelize;
    const columns = await queryInterface.describeTable('connected_apps');
    
    if (!columns.max_tokens) {
      await queryInterface.addColumn('connected_apps', 'max_tokens', {
        type: Sequelize.DataTypes.INTEGER,
        allowNull: true,
      })
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable('connected_apps');
    
    if (columns.max_tokens) {
      await queryInterface.removeColumn('connected_apps', 'max_tokens')
    }
  },
}
