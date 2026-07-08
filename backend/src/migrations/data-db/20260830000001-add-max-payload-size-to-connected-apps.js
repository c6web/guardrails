'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    const { query } = queryInterface.sequelize;
    const columns = await queryInterface.describeTable('connected_apps');
    
    if (!columns.max_payload_size) {
      await queryInterface.addColumn('connected_apps', 'max_payload_size', {
        type: Sequelize.DataTypes.INTEGER,
        allowNull: true,
      })
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable('connected_apps');
    
    if (columns.max_payload_size) {
      await queryInterface.removeColumn('connected_apps', 'max_payload_size')
    }
  },
}
