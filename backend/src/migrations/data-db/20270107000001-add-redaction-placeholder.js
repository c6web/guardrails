'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    const detectorsDesc = await queryInterface.describeTable('detectors')
    if (!detectorsDesc['redaction_placeholder']) {
      await queryInterface.addColumn('detectors', 'redaction_placeholder', {
        type: Sequelize.DataTypes.STRING(255),
        allowNull: true,
        defaultValue: '[REDACTED]',
      })
    }

  },

  async down(queryInterface) {
    await queryInterface.removeColumn('detectors', 'redaction_placeholder')
  },
}
