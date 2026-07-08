'use strict'

const now = new Date()

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('embedding_providers', [
      {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'OpenRouter Qwen3 4B embedding',
        vendor: 'openrouter',
        endpoint: 'https://openrouter.ai/api/v1',
        api_key: null,
        model: 'qwen/qwen3-embedding-4b',
        dimensions: 1024,
        timeout_ms: 30000,
        status: 'healthy',
        notes: 'OpenRouter Qwen3 4B embedding model, 1024 dimensions',
        requests_24h: 0,
        errors_24h: 0,
        avg_latency_ms: 0,
        created_at: now,
        updated_at: now,
      },
    ], { ignoreDuplicates: true })
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('embedding_providers', null, {})
  },
}
