'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('detectors')
    if (!tableDesc['scanning_scope']) {
      await queryInterface.addColumn('detectors', 'scanning_scope', {
        type: Sequelize.STRING(10),
        allowNull: false,
        defaultValue: 'input',
      })
      await queryInterface.sequelize.query(
        `ALTER TABLE detectors ADD CONSTRAINT check_scanning_scope CHECK (scanning_scope IN ('input', 'output', 'both'))`
      )
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE detectors DROP CONSTRAINT IF EXISTS check_scanning_scope`
    )
    await queryInterface.removeColumn('detectors', 'scanning_scope')
  },
}
