module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE threat_knowledge
        ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manual',
        ADD COLUMN IF NOT EXISTS origin_request_id TEXT;
    `)
    await queryInterface.sequelize.query(`
      UPDATE threat_knowledge SET source = 'seed' WHERE source = 'manual';
    `)
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_threat_knowledge_status ON threat_knowledge (status);
    `)
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_threat_knowledge_source ON threat_knowledge (source);
    `)
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_threat_knowledge_source;
      DROP INDEX IF EXISTS idx_threat_knowledge_status;
      ALTER TABLE threat_knowledge
        DROP COLUMN IF EXISTS origin_request_id,
        DROP COLUMN IF EXISTS source,
        DROP COLUMN IF EXISTS status;
    `)
  },
}
