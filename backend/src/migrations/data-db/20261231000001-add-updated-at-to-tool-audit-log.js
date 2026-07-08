'use strict'
const { Sequelize } = require('sequelize')
module.exports = {
  async up(queryInterface) {
    const columns = await queryInterface.describeTable('tool_audit_log')
    if (!columns.updated_at) {
      await queryInterface.addColumn('tool_audit_log', 'updated_at', {
        type: Sequelize.DataTypes.DATE,
        allowNull: true,
      })
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('tool_audit_log', 'updated_at')
  },
}
