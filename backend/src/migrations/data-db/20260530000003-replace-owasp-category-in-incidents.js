'use strict'

module.exports = {
  async up(queryInterface) {
    const tables = await queryInterface.describeTable('detection_frameworks').catch(() => null)
    if (tables) {
      await queryInterface.sequelize.query(
        `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS framework_id VARCHAR(50) NULL REFERENCES detection_frameworks(id) ON DELETE SET NULL`
      )
    }
    await queryInterface.removeColumn('incidents', 'owasp_category').catch(() => {})
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE incidents DROP COLUMN IF EXISTS framework_id`)
    await queryInterface.sequelize.query(
      `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS owasp_category VARCHAR(16) DEFAULT NULL`
    )
  },
}
