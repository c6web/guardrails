'use strict'

module.exports = {
  async up(queryInterface) {
    const now = new Date()

    await queryInterface.bulkInsert('ai_providers', [
      {
        id: '00000010-0000-0000-0000-000000000002',
        name: 'Google Gemini 3.1 Flash Lite',
        vendor: 'google-gemini',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
        api_key: null,
        notes: 'Google Gemini 3.1 Flash Lite — fast and efficient multimodal model.',
        model: 'gemini-3.1-flash-lite',
        max_output_token: 65535,
        max_input_token: 1048576,
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
    await queryInterface.bulkDelete('ai_providers', { id: '00000010-0000-0000-0000-000000000002' }, {})
  },
}
