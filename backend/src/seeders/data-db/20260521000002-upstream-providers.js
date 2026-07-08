'use strict'

module.exports = {
  async up(queryInterface) {
    const now = new Date()

    // Only seed the primary AI provider (OpenRouter GPT-OSS 20B).
    // All other sample providers removed per deployment requirements.
    await queryInterface.bulkInsert('ai_providers', [
      { id: '00000010-0000-0000-0000-000000000001', name: 'OpenRouter GPT-OSS 20B', vendor: 'openrouter', endpoint: 'https://openrouter.ai/api/v1', api_key: null, notes: 'Primary AI provider for gateway classification.', model: 'openai/gpt-oss-20b', max_output_token: 10240, max_input_token: 131072, status: 'healthy', timeout_ms: 240000, requests_24h: 0, errors_24h: 0, avg_latency_ms: 0, created_at: now, updated_at: now },
    ], { ignoreDuplicates: true })
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('ai_providers', null, {})
  },
}
