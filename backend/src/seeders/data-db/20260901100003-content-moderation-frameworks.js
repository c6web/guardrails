'use strict'

module.exports = {
  async up(queryInterface) {
    const now = new Date()
    await queryInterface.bulkInsert('detection_frameworks', [
      {
        id: 'content-mod-cm01',
        framework_code: 'CM01',
        name: 'Inappropriate / Adult Content',
        description: 'Requests for sexual content, explicit material, erotica, pornographic descriptions, or adult-only content not appropriate for general audiences.',
        display_order: 11,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'content-mod-cm02',
        framework_code: 'CM02',
        name: 'Hate Speech / Harassment',
        description: 'Offensive language targeting individuals or groups based on protected characteristics, including racial or ethnic slurs, incitement to hatred, discrimination, or targeted harassment.',
        display_order: 12,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'content-mod-cm03',
        framework_code: 'CM03',
        name: 'Violence / Gore',
        description: 'Requests for graphic violence descriptions, torture, gore, dismemberment, or detailed accounts of harm to persons or animals.',
        display_order: 13,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'content-mod-cm04',
        framework_code: 'CM04',
        name: 'Illegal Activities',
        description: 'Instructions for illegal acts such as drug synthesis, weapons manufacturing, explosive devices, human trafficking, or other criminal activity.',
        display_order: 14,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'content-mod-cm05',
        framework_code: 'CM05',
        name: 'Self-Harm',
        description: 'Content promoting suicide, self-injury methods, eating disorders, or other self-destructive behaviors presented as advice or instructions.',
        display_order: 15,
        created_at: now,
        updated_at: now,
      },
    ], { ignoreDuplicates: true })
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('detection_frameworks', {
      id: ['content-mod-cm01', 'content-mod-cm02', 'content-mod-cm03', 'content-mod-cm04', 'content-mod-cm05'],
    }, {})
  },
}
