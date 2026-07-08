'use strict'

module.exports = {
  async up(queryInterface) {
    const now = new Date()
    await queryInterface.bulkInsert('upstream_provider_links', [
      { ai_provider_id: '00000010-0000-0000-0000-000000000001', is_default: true, created_at: now },
    ], { ignoreDuplicates: true })
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('upstream_provider_links', null, {})
  },
}
