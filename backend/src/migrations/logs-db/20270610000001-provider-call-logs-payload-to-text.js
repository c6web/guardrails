'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('ai_provider_call_logs', 'request_payload', {
      type: Sequelize.TEXT,
      allowNull: true,
    })
    await queryInterface.changeColumn('ai_provider_call_logs', 'response_payload', {
      type: Sequelize.TEXT,
      allowNull: true,
    })
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('ai_provider_call_logs', 'request_payload', {
      type: Sequelize.JSONB,
      allowNull: true,
    })
    await queryInterface.changeColumn('ai_provider_call_logs', 'response_payload', {
      type: Sequelize.JSONB,
      allowNull: true,
    })
  },
}
