'use strict'

module.exports = {
  async up(queryInterface) {
    const existing = await queryInterface.sequelize.query(
      `SELECT id FROM content_quality_judge_prompts LIMIT 1`,
      { type: 'SELECT' }
    )
    if (existing && existing.length > 0) return

    const now = new Date()

    await queryInterface.bulkInsert('content_quality_judge_prompts', [
      {
        id: '00000000-0000-0000-0000-000000000201',
        name: 'Default Content Quality Judge (baseline)',
        description: 'Baseline groundedness + answer relevance scoring criteria. Passed through to the Content Quality Provider as scoring guidance alongside the prompt context and the AI response.',
        system_prompt: `Score the assistant's response against the provided context (the full prompt: system \
instructions + user message + conversation history).

Groundedness: does every material claim in the response trace back to something stated or \
reasonably inferable from the context? Penalize invented facts, numbers, names, or citations \
that are not supported by the context.

Answer relevance: does the response actually address what was asked? Penalize responses that \
are evasive, off-topic, or answer a different question than the one in the context.

Do not penalize a response for being concise, for declining an unsafe request, or for asking a \
clarifying question when the context is genuinely ambiguous — those are not quality failures.`,
        threshold: 0.7,
        max_output_tokens: 10240,
        is_active: true,
        is_system: false,
        is_default: true,
        created_at: now,
        updated_at: now,
      },
    ])
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('content_quality_judge_prompts', {
      id: ['00000000-0000-0000-0000-000000000201'],
    })
  },
}
