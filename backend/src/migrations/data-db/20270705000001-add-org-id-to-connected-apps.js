'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('connected_apps', 'org_id', {
      type: Sequelize.DataTypes.UUID,
      allowNull: true,
    })
    await queryInterface.addIndex('connected_apps', ['org_id'])
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('connected_apps', ['org_id'])
    await queryInterface.removeColumn('connected_apps', 'org_id')
  },
}
