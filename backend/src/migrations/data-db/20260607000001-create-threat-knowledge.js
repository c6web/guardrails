'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;').catch(() => {})

    const tables = await queryInterface.showAllTables()
    if (!tables.includes('threat_knowledge')) {
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS "threat_knowledge" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "name" VARCHAR(200) NOT NULL,
          "description" TEXT NOT NULL,
          "threat_context" TEXT,
          "embedding" vector(1024),
          "embedding_at" TIMESTAMP,
          "created_by" UUID,
          "updated_by" UUID,
          "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
      `)
      await queryInterface.addIndex('threat_knowledge', ['name']).catch(() => {})
      await queryInterface.addIndex('threat_knowledge', ['created_by']).catch(() => {})
      await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_threat_knowledge_hnswnn
          ON threat_knowledge USING HNSW (embedding vector_cos_ops)
      `).catch(() => {})
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('threat_knowledge', { if_exists: true })
  },
}
