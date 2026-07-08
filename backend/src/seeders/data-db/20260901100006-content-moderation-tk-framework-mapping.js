'use strict'

module.exports = {
  async up(queryInterface) {
    const mappings = [
      { framework_id: 'content-mod-cm01', threat_knowledge_id: 'f0000000-0000-0000-0000-000000000011' },
      { framework_id: 'content-mod-cm02', threat_knowledge_id: 'f0000000-0000-0000-0000-000000000012' },
      { framework_id: 'content-mod-cm03', threat_knowledge_id: 'f0000000-0000-0000-0000-000000000013' },
      { framework_id: 'content-mod-cm04', threat_knowledge_id: 'f0000000-0000-0000-0000-000000000014' },
      { framework_id: 'content-mod-cm05', threat_knowledge_id: 'f0000000-0000-0000-0000-000000000015' },
    ]

    await queryInterface.bulkInsert('framework_threat_knowledge', mappings, { ignoreDuplicates: true })
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM framework_threat_knowledge WHERE framework_id IN ('content-mod-cm01','content-mod-cm02','content-mod-cm03','content-mod-cm04','content-mod-cm05')`
    )
  },
}
