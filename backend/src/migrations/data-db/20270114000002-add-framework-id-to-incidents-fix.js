'use strict'

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE incidents
      ADD COLUMN IF NOT EXISTS framework_id VARCHAR(50) NULL
    `)
    await queryInterface.sequelize.query(`
      ALTER TABLE incidents
      DROP COLUMN IF EXISTS owasp_category
    `)
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE incidents DROP COLUMN IF EXISTS framework_id
    `)
    await queryInterface.sequelize.query(`
      ALTER TABLE incidents ADD COLUMN IF NOT EXISTS owasp_category VARCHAR(16) DEFAULT NULL
    `)
  },
}
