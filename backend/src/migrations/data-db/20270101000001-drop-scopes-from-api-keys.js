'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('api_keys')
    if (tableDesc['scopes']) {
      await queryInterface.removeColumn('api_keys', 'scopes')
    }
  },
  async down(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('api_keys')
    if (!tableDesc['scopes']) {
      await queryInterface.addColumn('api_keys', 'scopes', {
        type: Sequelize.DataTypes.ARRAY(Sequelize.DataTypes.TEXT),
        allowNull: true,
        defaultValue: [],
      })
    }
  },
}
