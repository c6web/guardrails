'use strict'
module.exports = {
  async up(queryInterface) {
    try {
      await queryInterface.removeColumn('users', 'full_name')
    } catch (e) {
      // Column doesn't exist — safe to skip
      if (!e.message.includes('does not exist')) throw e
    }
  },

  async down(queryInterface) {
    throw new Error('Rollback not supported — full_name has been intentionally removed')
  }
}
