'use strict'

module.exports = {
  async up(queryInterface) {
    // Map each detection framework to its corresponding threat knowledge entry
    const mappings = [
      { framework_id: 'owasp-2025-llm01', threat_knowledge_id: 'f0000000-0000-0000-0000-000000000001' },
      { framework_id: 'owasp-2025-llm02', threat_knowledge_id: 'f0000000-0000-0000-0000-000000000002' },
      { framework_id: 'owasp-2025-llm03', threat_knowledge_id: 'f0000000-0000-0000-0000-000000000003' },
      { framework_id: 'owasp-2025-llm04', threat_knowledge_id: 'f0000000-0000-0000-0000-000000000004' },
      { framework_id: 'owasp-2025-llm05', threat_knowledge_id: 'f0000000-0000-0000-0000-000000000005' },
      { framework_id: 'owasp-2025-llm06', threat_knowledge_id: 'f0000000-0000-0000-0000-000000000006' },
      { framework_id: 'owasp-2025-llm07', threat_knowledge_id: 'f0000000-0000-0000-0000-000000000007' },
      { framework_id: 'owasp-2025-llm08', threat_knowledge_id: 'f0000000-0000-0000-0000-000000000008' },
      { framework_id: 'owasp-2025-llm09', threat_knowledge_id: 'f0000000-0000-0000-0000-000000000009' },
      { framework_id: 'owasp-2025-llm10', threat_knowledge_id: 'f0000000-0000-0000-0000-000000000010' },
    ]

    await queryInterface.bulkInsert('framework_threat_knowledge', mappings, { ignoreDuplicates: true })
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM framework_threat_knowledge WHERE framework_id IN ('owasp-2025-llm01','owasp-2025-llm02','owasp-2025-llm03','owasp-2025-llm04','owasp-2025-llm05','owasp-2025-llm06','owasp-2025-llm07','owasp-2025-llm08','owasp-2025-llm09','owasp-2025-llm10')`
    )
  },
}
