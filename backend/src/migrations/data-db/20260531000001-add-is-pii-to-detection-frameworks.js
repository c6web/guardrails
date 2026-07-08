'use strict'

module.exports = {
  async up(queryInterface) {
    const tables = await queryInterface.showAllTables()
    if (!tables.includes('detection_frameworks')) return

    await queryInterface.sequelize.query(`
      ALTER TABLE detection_frameworks
      ADD COLUMN IF NOT EXISTS is_pii BOOLEAN NOT NULL DEFAULT false
    `)
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE detection_frameworks
      DROP COLUMN IF EXISTS is_pii
    `)
  },
}
