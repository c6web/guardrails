'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = [
      { from: 'email_otp_enabled', to: 'otp_enabled', type: Sequelize.DataTypes.BOOLEAN },
      { from: 'email_otp_verified_at', to: 'otp_verified_at', type: Sequelize.DataTypes.DATE },
    ]
    for (const { from, to, type } of cols) {
      try {
        await queryInterface.renameColumn('users', from, to)
      } catch (e) {
        // column may not exist (already renamed or never had email_otp_ prefix) — safe to ignore
      }
    }
  },

  async down() {
    throw new Error('Rollback not supported — columns intentionally renamed')
  }
}
