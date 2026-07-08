'use strict'

// The seeded default Content Quality Judge prompt was locked (is_system=true),
// mirroring the T2 Agent Prompt pattern. Unlike T2 prompts, criteria text here
// has no engine-appended JSON contract to protect and no security-sensitive
// behavior an accidental edit could break — it's plain guidance text passed
// through to the Content Quality Provider. Locking the *only* seeded row left
// the whole page looking read-only (no Edit button ever appears since it's
// gated on !is_system) with no unlocked alternative to fall back to.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE content_quality_judge_prompts
       SET is_system = false,
           description = replace(description, ' — locked, non-editable.', '.')
       WHERE is_system = true`
    )
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE content_quality_judge_prompts
       SET is_system = true
       WHERE id = '00000000-0000-0000-0000-000000000201'`
    )
  },
}
