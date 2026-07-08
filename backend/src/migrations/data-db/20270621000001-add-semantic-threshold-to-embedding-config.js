'use strict'

module.exports = {
  async up(queryInterface) {
    const tables = await queryInterface.showAllTables()
    if (!tables.includes('embedding_provider_config')) return
    await queryInterface.sequelize.query('ALTER TABLE embedding_provider_config ADD COLUMN IF NOT EXISTS semantic_threshold DOUBLE PRECISION NOT NULL DEFAULT 0.75')
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE embedding_provider_config DROP COLUMN IF EXISTS semantic_threshold')
  },
}
