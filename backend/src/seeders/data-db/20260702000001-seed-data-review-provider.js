'use strict'

const PROVIDER_ID = '00000010-0000-0000-0000-000000000001'

module.exports = {
  async up(queryInterface) {
    const now = new Date()

    // Upsert the AI provider for review
    await queryInterface.bulkInsert('ai_providers', [
      {
        id: PROVIDER_ID,
        name: 'OpenRouter GPT-OSS 20B',
        vendor: 'openrouter',
        endpoint: 'https://openrouter.ai/api/v1',
        api_key: null,
        notes: 'OpenRouter-hosted GPT-OSS 20B — used for threat knowledge, detector, and tool guardrail quality reviews.',
        model: 'gpt-oss-20b',
        max_output_token: 4096,
        max_input_token: 32000,
        status: 'healthy',
        timeout_ms: 120000,
        requests_24h: 0,
        errors_24h: 0,
        avg_latency_ms: 0,
        created_at: now,
        updated_at: now,
      },
    ], { ignoreDuplicates: true })

    // Upsert the review config singleton row
    const existing = await queryInterface.sequelize.query(
      `SELECT id FROM review_config WHERE id = 1 LIMIT 1`,
      { type: 'SELECT' }
    )
    if (!existing || existing.length === 0) {
      await queryInterface.bulkInsert('review_config', [
        { id: 1, provider_id: PROVIDER_ID, created_at: now, updated_at: now },
      ])
    } else {
      await queryInterface.sequelize.query(
        `UPDATE review_config SET provider_id = :provider_id, updated_at = NOW() WHERE id = 1`,
        { replacements: { provider_id: PROVIDER_ID } }
      )
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE review_config SET provider_id = NULL, updated_at = NOW() WHERE id = 1`
    )
    await queryInterface.bulkDelete('ai_providers', { id: PROVIDER_ID }, {})
  },
}
