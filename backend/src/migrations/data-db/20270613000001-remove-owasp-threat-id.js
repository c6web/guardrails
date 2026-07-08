'use strict'

module.exports = {
  async up(queryInterface) {
    const columns = await queryInterface.describeTable('threat_knowledge')
    if (columns['owasp_threat_id']) {
      await queryInterface.removeIndex('threat_knowledge', ['owasp_threat_id']).catch(() => {})
      await queryInterface.removeColumn('threat_knowledge', 'owasp_threat_id')
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('threat_knowledge', 'owasp_threat_id', {
      type: Sequelize.DataTypes.UUID,
      allowNull: true,
      references: { model: 'owasp_threats', key: 'id' },
      onDelete: 'SET NULL',
    })
  },
}
