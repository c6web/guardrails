'use strict'

module.exports = {
  async up(queryInterface) {
    const now = new Date()

    await queryInterface.bulkInsert('ai_providers', [
      {
        id: '00000010-0000-0000-0000-000000000004',
        name: 'Anthropic Claude Haiku 4.5',
        vendor: 'anthropic',
        endpoint: 'https://api.anthropic.com',
        api_key: null,
        notes: 'Anthropic Claude Haiku 4.5 — fast, low-latency model for high-throughput tasks.',
        model: 'claude-haiku-4-5-20251001',
        max_output_token: 64000,
        max_input_token: 200000,
        status: 'healthy',
        timeout_ms: 30000,
        requests_24h: 0,
        errors_24h: 0,
        avg_latency_ms: 0,
        created_at: now,
        updated_at: now,
      },
    ], { ignoreDuplicates: true })
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('ai_providers', { id: '00000010-0000-0000-0000-000000000004' }, {})
  },
}
