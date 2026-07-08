'use strict'
module.exports = {
  async up(queryInterface) {
    // ALTER TYPE ADD VALUE cannot run inside a transaction block
    await queryInterface.sequelize.query(
      `COMMIT; ALTER TYPE "enum_groups_role" ADD VALUE IF NOT EXISTS 'knowledge_admin';`
    )
  },
  async down() {
    // Postgres has no DROP VALUE for ENUM; requires recreating the column type.
  },
}
