'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('ai_request_logs')
    if (!columns['gateway_instance_id']) {
      await queryInterface.addColumn('ai_request_logs', 'gateway_instance_id', {
        type: Sequelize.DataTypes.STRING(50),
        allowNull: true,
      })
      await queryInterface.addIndex('ai_request_logs', ['gateway_instance_id'])
    }
  },
  async down(queryInterface) {
    const columns = await queryInterface.describeTable('ai_request_logs')
    if (columns['gateway_instance_id']) {
      await queryInterface.removeIndex('ai_request_logs', ['gateway_instance_id'])
      await queryInterface.removeColumn('ai_request_logs', 'gateway_instance_id')
    }
  },
}
