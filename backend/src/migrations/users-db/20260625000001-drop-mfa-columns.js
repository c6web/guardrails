'use strict'
module.exports = {
  async up(queryInterface) {
    const cols = ['mfa_enabled', 'mfa_type']
    for (const col of cols) {
      try {
        await queryInterface.removeColumn('users', col)
      } catch (e) {
        if (!e.message.includes('does not exist')) throw e
      }
    }
  },

  async down() {
    throw new Error('Rollback not supported — mfa columns intentionally removed')
  }
}
