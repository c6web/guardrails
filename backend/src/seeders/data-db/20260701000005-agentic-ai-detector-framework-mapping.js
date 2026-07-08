'use strict'

module.exports = {
  async up(queryInterface) {
    const mappings = []
    for (let i = 1; i <= 15; i++) {
      mappings.push({
        detector_id: `00000000-0000-0000-00a1-${(i).toString(16).padStart(12, '0')}`,
        framework_id: 'agentic-ai-2026',
      })
    }
    await queryInterface.bulkInsert('detector_framework_mapping', mappings, { ignoreDuplicates: true })
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM detector_framework_mapping WHERE framework_id = 'agentic-ai-2026'`
    )
  },
}
