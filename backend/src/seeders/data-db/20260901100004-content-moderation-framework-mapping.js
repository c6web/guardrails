'use strict'

module.exports = {
  async up(queryInterface) {
    const mappings = [
      // CM01 — Inappropriate / Adult Content
      { detector_id: '00000000-0000-0000-c001-000000000001', framework_id: 'content-mod-cm01' },
      // CM02 — Hate Speech / Harassment
      { detector_id: '00000000-0000-0000-c002-000000000001', framework_id: 'content-mod-cm02' },
      // CM03 — Violence / Gore
      { detector_id: '00000000-0000-0000-c003-000000000001', framework_id: 'content-mod-cm03' },
      // CM04 — Illegal Activities
      { detector_id: '00000000-0000-0000-c004-000000000001', framework_id: 'content-mod-cm04' },
      // CM05 — Self-Harm
      { detector_id: '00000000-0000-0000-c005-000000000001', framework_id: 'content-mod-cm05' },
    ]

    await queryInterface.bulkInsert('detector_framework_mapping', mappings, { ignoreDuplicates: true })
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM detector_framework_mapping WHERE framework_id IN ('content-mod-cm01','content-mod-cm02','content-mod-cm03','content-mod-cm04','content-mod-cm05')`
    )
  },
}
