'use strict'

module.exports = {
  async up(queryInterface) {
    const now = new Date()

    await queryInterface.bulkInsert('ai_providers', [
      {
        id: '00000010-0000-0000-0000-000000000003',
        name: 'OpenAI GPT 5.4 Nano',
        vendor: 'openai',
        endpoint: 'https://api.openai.com/v1',
        api_key: null,
        notes: 'OpenAI GPT-5.4 Nano — ultra-lightweight model optimised for high-throughput low-latency tasks.',
        model: 'gpt-5.4-nano',
        max_output_token: 128000,
        max_input_token: 128000,
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
    await queryInterface.bulkDelete('ai_providers', { id: '00000010-0000-0000-0000-000000000003' }, {})
  },
}
