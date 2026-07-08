'use strict'

module.exports = {
  async up(queryInterface) {
    const existing = await queryInterface.sequelize.query(
      `SELECT id FROM content_quality_judge_prompts WHERE id = '00000000-0000-0000-0000-000000000202'`,
      { type: 'SELECT' }
    )
    if (existing && existing.length > 0) return

    const now = new Date()

    await queryInterface.bulkInsert('content_quality_judge_prompts', [
      {
        id: '00000000-0000-0000-0000-000000000202',
        name: 'Advanced Content Quality Judge (beta)',
        description: 'Experimental judge criteria with deeper grounding checks: partial/graded groundedness instead of pass-fail, citation and numeric-fidelity checking, multi-turn context tracking, and confidence-calibration guidance.',
        system_prompt: `Score the assistant's response against the provided context (the full prompt: system \
instructions + user message + conversation history) using deeper, more granular criteria than a \
basic pass/fail groundedness check.

GROUNDEDNESS (graded, not binary): score based on the proportion of material claims that trace \
back to the context, not an all-or-nothing judgment. A response with five supported claims and \
one fabricated detail should score noticeably lower than one that is fully supported, but \
noticeably higher than one that is mostly fabricated. Call out exactly which claims are \
unsupported in your reasoning.

CITATION AND NUMERIC FIDELITY: when the response quotes, paraphrases, or cites a number, date, \
name, or statistic from the context, check it against the source precisely — a subtly altered \
figure or misattributed quote is a grounding failure even if the surrounding claim is directionally \
correct.

MULTI-TURN CONTEXT: when the context includes conversation history, ground claims against the \
entire relevant history, not just the most recent turn — a response can be well-supported by \
something stated several turns earlier.

RELEVANCE (scoped, not just topical): a response that is topically related but only answers part \
of a multi-part question, or answers a different question than the one actually asked, should \
score lower on relevance even if every individual claim it makes is grounded. Conversely, do not \
penalize a response for being appropriately scoped to what was actually asked.

CONFIDENCE CALIBRATION: flag responses that state uncertain or ambiguous information with \
unwarranted confidence — the context being unclear on a point is not license for the response to \
assert a specific answer as fact.

Do not penalize a response for being concise, for declining an unsafe request, or for asking a \
clarifying question when the context is genuinely ambiguous — those are not quality failures.`,
        threshold: 0.75,
        max_output_tokens: 10240,
        is_active: false,
        is_system: false,
        created_at: now,
        updated_at: now,
      },
    ])
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('content_quality_judge_prompts', {
      id: ['00000000-0000-0000-0000-000000000202'],
    })
  },
}
