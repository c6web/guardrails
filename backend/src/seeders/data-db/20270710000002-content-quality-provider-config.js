'use strict'

module.exports = {
  async up(queryInterface) {
    const existing = await queryInterface.sequelize.query(
      `SELECT id FROM content_quality_provider_config LIMIT 1`,
      { type: 'SELECT' }
    )
    if (existing && existing.length > 0) return

    await queryInterface.bulkInsert('content_quality_provider_config', [
      {
        id: 1,
        vendor: 'trulens',
        service_url: null,
        service_api_key: null,
        timeout_ms: 10000,
        provider_id: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ])
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('content_quality_provider_config', { id: 1 })
  },
}
