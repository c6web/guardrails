'use strict'
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;')
  },
  async down() {
    // Safe no-op: do not drop the extension as other tables may depend on it
  },
}
