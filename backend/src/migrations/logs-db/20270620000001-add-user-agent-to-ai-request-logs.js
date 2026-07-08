'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('ai_request_logs', 'user_agent', {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
    })
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('ai_request_logs', 'user_agent')
  },
}
