'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if column already exists (idempotent)
    const columns = await queryInterface.describeTable('threat_knowledge')
    if (!columns['owasp_threat_id']) {
      await queryInterface.addColumn('threat_knowledge', 'owasp_threat_id', {
        type: Sequelize.DataTypes.UUID,
        allowNull: true,
        references: { model: 'owasp_threats', key: 'id' },
        onDelete: 'SET NULL',
      })

      // Create index for efficient lookups
      await queryInterface.addIndex('threat_knowledge', ['owasp_threat_id'])

      // Populate the FK from existing threat knowledge names
      // Extract OWASP code from names like "OWASP LLM01 — Prompt Injection"
      const { DataTypes } = Sequelize
      await queryInterface.sequelize.query(`
        UPDATE threat_knowledge tk
        SET owasp_threat_id = ot.id
        FROM owasp_threats ot
        WHERE tk.name LIKE '%' || ot.code || ' — %' ESCAPE '!'
          AND tk.owasp_threat_id IS NULL
      `)
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('threat_knowledge', 'owasp_threat_id')
  },
}
