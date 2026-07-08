'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('ai_request_logs')
    if (!columns['raw_input_payload']) {
      await queryInterface.addColumn('ai_request_logs', 'raw_input_payload', {
        type: Sequelize.DataTypes.TEXT,
        allowNull: true,
      })
    }
    if (!columns['raw_output_payload']) {
      await queryInterface.addColumn('ai_request_logs', 'raw_output_payload', {
        type: Sequelize.DataTypes.TEXT,
        allowNull: true,
      })
    }
  },
  async down(queryInterface) {
    const columns = await queryInterface.describeTable('ai_request_logs')
    if (columns['raw_input_payload']) {
      await queryInterface.removeColumn('ai_request_logs', 'raw_input_payload')
    }
    if (columns['raw_output_payload']) {
      await queryInterface.removeColumn('ai_request_logs', 'raw_output_payload')
    }
  },
}
