'use strict'

module.exports = {
  async up(queryInterface) {
    // Use raw SQL to avoid Sequelize transaction wrapping issues
    // where createTable + ALTER TABLE FK would roll back the whole thing
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS "detection_frameworks" (
        "id" VARCHAR(50) NOT NULL,
        "framework_code" VARCHAR(20) NOT NULL,
        "name" VARCHAR(255) NOT NULL,
        "description" TEXT NOT NULL,
        "display_order" INTEGER NOT NULL DEFAULT 0,
        "is_pii" BOOLEAN NOT NULL DEFAULT false,
        "threat_knowledge_id" UUID,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY ("id")
      )
    `)

    try {
      await queryInterface.sequelize.query(`
        ALTER TABLE detection_frameworks
        ADD CONSTRAINT detection_frameworks_threat_knowledge_id_fkey
        FOREIGN KEY (threat_knowledge_id) REFERENCES threat_knowledge(id) ON DELETE SET NULL
      `)
    } catch (e) {
      // FK may already exist or referenced table may not exist yet
    }
  },

  async down(queryInterface) {
    try {
      await queryInterface.sequelize.query(`
        ALTER TABLE detection_frameworks DROP CONSTRAINT IF EXISTS detection_frameworks_threat_knowledge_id_fkey
      `)
    } catch (e) {}
    await queryInterface.dropTable('detection_frameworks')
  },
}
