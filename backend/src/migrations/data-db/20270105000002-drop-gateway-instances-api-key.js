'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // Drop the legacy plaintext api_key column — replaced by gateway_api_keys table
    const tableDesc = await queryInterface.describeTable('gateway_instances')
    if (tableDesc['api_key']) {
      await queryInterface.removeColumn('gateway_instances', 'api_key')
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('gateway_instances', 'api_key', {
      type: Sequelize.STRING(500),
      allowNull: true,
    })
  },
}
