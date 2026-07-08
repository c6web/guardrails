'use strict'

module.exports = {
  async up(queryInterface) {
    const now = new Date()

    await queryInterface.bulkInsert('ai_providers', [
      {
        id: '00000010-0000-0000-0000-000000000001',
        name: 'OpenRouter GPT-OSS 20B',
        vendor: 'openrouter',
        endpoint: 'https://openrouter.ai/api/v1',
        api_key: null,
        model: 'openai/gpt-oss-20b',
        max_output_token: 10240,
        provider: 'openai/gpt-oss-20b',
        allow_fallbacks: true,
        data_collection: 'deny',
        notes: 'OpenRouter GPT OSS 20B, Max Token 10240',
        status: 'healthy',
        timeout_ms: 240000,
        requests_24h: 0,
        errors_24h: 0,
        avg_latency_ms: 0,
        created_at: now,
        updated_at: now,
      },
    ], { ignoreDuplicates: true })

    // Only set defaults if not already configured (all three are NULL)
    await queryInterface.sequelize.query(
      "UPDATE classifier_config SET primary_id = '00000010-0000-0000-0000-000000000001', backup1_id = NULL, backup2_id = NULL WHERE id = 1 AND primary_id IS NULL AND backup1_id IS NULL AND backup2_id IS NULL"
    ).catch(() => {})
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('ai_providers', { id: '00000010-0000-0000-0000-000000000001' }, {})
    await queryInterface.sequelize.query(
      "UPDATE classifier_config SET primary_id = NULL WHERE id = 1 AND primary_id = '00000010-0000-0000-0000-000000000001'"
    ).catch(() => {})
  },
}
