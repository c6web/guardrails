'use strict'

module.exports = {
  async up(queryInterface) {
    const now = new Date()

    await queryInterface.bulkInsert('embedding_providers', [
      {
        id: '0a254cbf-75b3-436b-b01f-284f737c5b3d',
        name: 'Gemini Embedding 2',
        vendor: 'google-gemini',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta',
        api_key: null,
        model: 'gemini-embedding-2',
        dimensions: 3072,
        timeout_ms: 30000,
        status: 'healthy',
        notes: null,
        requests_24h: 0,
        errors_24h: 0,
        avg_latency_ms: 0,
        created_at: now,
        updated_at: now,
      },
    ], { ignoreDuplicates: true })
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('embedding_providers', { id: '0a254cbf-75b3-436b-b01f-284f737c5b3d' }, {})
  },
}
