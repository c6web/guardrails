'use strict'

// Marks the seeded baseline Content Quality Judge prompt as restorable — distinct
// from is_system (which locks editing). This one is deliberately editable (see
// migration 20270711000001) but, being the only preset most installs will ever
// have, needs a documented "undo" path if an admin edits it into a broken state.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE content_quality_judge_prompts
        ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;
    `)
    await queryInterface.sequelize.query(`
      UPDATE content_quality_judge_prompts
      SET is_default = true
      WHERE id = '00000000-0000-0000-0000-000000000201';
    `)
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE content_quality_judge_prompts DROP COLUMN IF EXISTS is_default;
    `)
  },
}
