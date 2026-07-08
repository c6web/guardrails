'use strict'
module.exports = {
  async up(queryInterface) {
    await queryInterface.renameColumn('ai_request_logs', 'user_identifier', 'app_api_key')
  },
  async down(queryInterface) {
    await queryInterface.renameColumn('ai_request_logs', 'app_api_key', 'user_identifier')
  },
}
