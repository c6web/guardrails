'use strict'

module.exports = {
  async up(queryInterface) {
    const tables = await queryInterface.showAllTables()
    if (!tables.includes('embedding_provider_config')) return
    await queryInterface.sequelize.query('ALTER TABLE embedding_provider_config ADD COLUMN IF NOT EXISTS dimensions INTEGER DEFAULT 1024')
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE embedding_provider_config DROP COLUMN IF EXISTS dimensions')
  },
}
