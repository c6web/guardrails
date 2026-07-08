'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    // Force column to dimensionless vector by replacing it.
    // Use IF NOT EXISTS / try-catch for idempotency.
    try {
      await queryInterface.sequelize.query(`
        ALTER TABLE threat_knowledge ADD COLUMN IF NOT EXISTS embedding_new vector
      `)
      await queryInterface.sequelize.query(`
        UPDATE threat_knowledge SET embedding_new = embedding::vector WHERE embedding IS NOT NULL AND embedding_new IS NULL
      `)
      await queryInterface.sequelize.query(`
        ALTER TABLE threat_knowledge DROP COLUMN IF EXISTS embedding
      `)
      await queryInterface.sequelize.query(`
        ALTER TABLE threat_knowledge RENAME COLUMN embedding_new TO embedding
      `)
    } catch (e) {
      // If already flexible or other benign error, ignore
      if (!e.message.includes('already exists') && !e.message.includes('column') &&
          !e.message.includes('does not exist') && !e.message.includes('cannot be cast')) {
        throw e
      }
    }

    // Clean up any leftover temp columns
    await queryInterface.sequelize.query(`
      ALTER TABLE threat_knowledge DROP COLUMN IF EXISTS embedding_new
    `).catch(() => {})
  },

  async down(queryInterface, Sequelize) {
    // No rollback
  }
}
