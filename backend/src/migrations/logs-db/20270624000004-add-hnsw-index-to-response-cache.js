'use strict'

module.exports = {
  async up(queryInterface) {
    const { sequelize } = queryInterface

    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_response_cache_semantic_hnsw
       ON response_cache
       USING HNSW (embedding vector_cos_ops)`
    ).catch(() => {})

    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_response_cache_lookup
       ON response_cache (app_id, expires_at)`
    ).catch(() => {})
  },

  async down(queryInterface) {
    const { sequelize } = queryInterface

    await sequelize.query('DROP INDEX IF EXISTS idx_response_cache_semantic_hnsw')
    await sequelize.query('DROP INDEX IF EXISTS idx_response_cache_lookup')
  },
}
