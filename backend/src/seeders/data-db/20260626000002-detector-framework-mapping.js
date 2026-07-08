'use strict'

module.exports = {
  async up(queryInterface) {
    // Map detectors to their corresponding detection frameworks based on OWASP category comments
    const mappings = [
      // LLM01 — Prompt Injection
      { detector_id: '00000000-0000-0000-0001-000000000001', framework_id: 'owasp-2025-llm01' },
      { detector_id: '00000000-0000-0000-0001-000000000002', framework_id: 'owasp-2025-llm01' },
      { detector_id: '00000000-0000-0000-0001-000000000003', framework_id: 'owasp-2025-llm01' },
      // LLM02 — Sensitive Information Disclosure
      { detector_id: '00000000-0000-0000-0002-000000000001', framework_id: 'owasp-2025-llm02' },
      { detector_id: '00000000-0000-0000-0002-000000000002', framework_id: 'owasp-2025-llm02' },
      { detector_id: '00000000-0000-0000-0002-000000000003', framework_id: 'owasp-2025-llm02' },
      { detector_id: '00000000-0000-0000-0002-000000000004', framework_id: 'owasp-2025-llm02' },
      // LLM05 — Improper Output Handling
      { detector_id: '00000000-0000-0000-0005-000000000001', framework_id: 'owasp-2025-llm05' },
      { detector_id: '00000000-0000-0000-0005-000000000002', framework_id: 'owasp-2025-llm05' },
      { detector_id: '00000000-0000-0000-0005-000000000003', framework_id: 'owasp-2025-llm05' },
      // LLM06 — Excessive Agency
      { detector_id: '00000000-0000-0000-0006-000000000001', framework_id: 'owasp-2025-llm06' },
      // LLM07 — System Prompt Leakage
      { detector_id: '00000000-0000-0000-0007-000000000001', framework_id: 'owasp-2025-llm07' },
      // Migrated output detectors (0010 segment) — LLM02 Sensitive Information Disclosure
      { detector_id: '00000000-0000-0010-0000-000000000001', framework_id: 'owasp-2025-llm02' },
      { detector_id: '00000000-0000-0010-0000-000000000002', framework_id: 'owasp-2025-llm02' },
      { detector_id: '00000000-0000-0010-0000-000000000003', framework_id: 'owasp-2025-llm02' },
      { detector_id: '00000000-0000-0010-0000-000000000004', framework_id: 'owasp-2025-llm02' },
      { detector_id: '00000000-0000-0010-0000-000000000005', framework_id: 'owasp-2025-llm02' },
      { detector_id: '00000000-0000-0010-0000-000000000006', framework_id: 'owasp-2025-llm02' },
      { detector_id: '00000000-0000-0010-0000-000000000007', framework_id: 'owasp-2025-llm02' },
      { detector_id: '00000000-0000-0010-0000-000000000008', framework_id: 'owasp-2025-llm02' },
      { detector_id: '00000000-0000-0010-0000-000000000009', framework_id: 'owasp-2025-llm02' },
      { detector_id: '00000000-0000-0010-0000-000000000010', framework_id: 'owasp-2025-llm05' },
      { detector_id: '00000000-0000-0010-0000-000000000011', framework_id: 'owasp-2025-llm02' },
      { detector_id: '00000000-0000-0010-0000-000000000012', framework_id: 'owasp-2025-llm02' },
      // Regex detectors from existing seeder — LLM02 and LLM05
      { detector_id: '00000000-0000-0000-0008-000000000001', framework_id: 'owasp-2025-llm02' },
      { detector_id: '00000000-0000-0000-0008-000000000002', framework_id: 'owasp-2025-llm02' },
    ]

    await queryInterface.bulkInsert('detector_framework_mapping', mappings, { ignoreDuplicates: true })
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM detector_framework_mapping WHERE framework_id IN ('owasp-2025-llm01','owasp-2025-llm02','owasp-2025-llm03','owasp-2025-llm04','owasp-2025-llm05','owasp-2025-llm06','owasp-2025-llm07','owasp-2025-llm08','owasp-2025-llm09','owasp-2025-llm10')`
    )
  },
}
