'use strict'

module.exports = {
  async up(queryInterface) {
    const tables = await queryInterface.showAllTables()
    if (!tables.includes('threat_knowledge')) return

    // Check if embedding column is already dimensionless (atttypmod -1 means no dimension constraint)
    const [cols] = await queryInterface.sequelize.query(
      `SELECT atttypmod FROM pg_attribute pa
       JOIN pg_class pc ON pc.oid = pa.attrelid
       WHERE pc.relname = 'threat_knowledge' AND pa.attname = 'embedding' AND pa.attnum > 0`
    )
    if (cols.length === 0 || cols[0].atttypmod === -1) return  // already dimensionless or missing

    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_threat_knowledge_hnswnn')
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector')
    await queryInterface.sequelize.query('ALTER TABLE threat_knowledge ADD COLUMN IF NOT EXISTS embedding_new vector')
    await queryInterface.sequelize.query('UPDATE threat_knowledge SET embedding_new = embedding::vector WHERE embedding IS NOT NULL')
    await queryInterface.sequelize.query('ALTER TABLE threat_knowledge DROP COLUMN IF EXISTS embedding')
    await queryInterface.sequelize.query('ALTER TABLE threat_knowledge RENAME COLUMN embedding_new TO embedding')
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE threat_knowledge ADD COLUMN IF NOT EXISTS embedding_old vector(1024)')
    await queryInterface.sequelize.query('UPDATE threat_knowledge SET embedding_old = embedding::vector(1024) WHERE array_length(embedding::real[], 1) = 1024')
    await queryInterface.sequelize.query('ALTER TABLE threat_knowledge DROP COLUMN IF EXISTS embedding')
    await queryInterface.sequelize.query('ALTER TABLE threat_knowledge RENAME COLUMN embedding_old TO embedding')
    await queryInterface.sequelize.query('CREATE INDEX IF NOT EXISTS idx_threat_knowledge_hnswnn ON threat_knowledge USING HNSW (embedding vector_cos_ops)')
  },
}
