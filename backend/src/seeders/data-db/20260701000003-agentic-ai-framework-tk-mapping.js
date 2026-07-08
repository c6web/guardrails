'use strict'

module.exports = {
  async up(queryInterface) {
    const ids = []
    for (let i = 1; i <= 0x1e; i++) {
      ids.push(`f0000000-0000-0000-00a1-${(i).toString(16).padStart(12, '0')}`)
    }
    const mappings = ids.map(id => ({
      framework_id: 'agentic-ai-2026',
      threat_knowledge_id: id,
    }))
    await queryInterface.bulkInsert('framework_threat_knowledge', mappings, { ignoreDuplicates: true })
  },

  async down(queryInterface) {
    const ids = []
    for (let i = 1; i <= 0x1e; i++) {
      ids.push(`f0000000-0000-0000-00a1-${(i).toString(16).padStart(12, '0')}`)
    }
    await queryInterface.sequelize.query(
      `DELETE FROM framework_threat_knowledge WHERE framework_id = 'agentic-ai-2026' AND threat_knowledge_id IN (${ids.map(id => `'${id}'`).join(',')})`
    )
  },
}
