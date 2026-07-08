'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if junction table already exists (idempotent)
    const tables = await queryInterface.showAllTables()
    if (!tables.includes('framework_threat_knowledge')) {
      // Create junction table with composite primary key
      await queryInterface.createTable('framework_threat_knowledge', {
        framework_id: {
          type: Sequelize.STRING(50),
          allowNull: false,
          primaryKey: true,
          references: { model: 'detection_frameworks', key: 'id' },
          onDelete: 'CASCADE',
        },
        threat_knowledge_id: {
          type: Sequelize.UUID,
          allowNull: false,
          primaryKey: true,
          references: { model: 'threat_knowledge', key: 'id' },
          onDelete: 'CASCADE',
        },
      })
    }

    // Check if the old FK column still exists and migrate data if so
    const columns = await queryInterface.describeTable('detection_frameworks')
    if (columns['threat_knowledge_id']) {
      // Migrate existing 1-to-1 data into junction table
      await queryInterface.sequelize.query(`
        INSERT INTO framework_threat_knowledge (framework_id, threat_knowledge_id)
        SELECT id AS framework_id, threat_knowledge_id
        FROM detection_frameworks
        WHERE threat_knowledge_id IS NOT NULL
        ON CONFLICT DO NOTHING
      `)

      // Drop the old FK column
      await queryInterface.removeColumn('detection_frameworks', 'threat_knowledge_id')
    }
  },

  async down(queryInterface, Sequelize) {
    // Re-add the column
    const columns = await queryInterface.describeTable('detection_frameworks')
    if (!columns['threat_knowledge_id']) {
      await queryInterface.addColumn('detection_frameworks', 'threat_knowledge_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'threat_knowledge', key: 'id' },
        onDelete: 'SET NULL',
      })
    }

    // Restore first mapping per framework
    await queryInterface.sequelize.query(`
      UPDATE detection_frameworks df
      SET threat_knowledge_id = ftk.threat_knowledge_id
      FROM framework_threat_knowledge ftk
      WHERE ftk.framework_id = df.id
    `)

    // Drop junction table
    await queryInterface.dropTable('framework_threat_knowledge')
  },
}
