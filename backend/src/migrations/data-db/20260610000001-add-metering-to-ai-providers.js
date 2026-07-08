module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE ai_providers
        ADD COLUMN IF NOT EXISTS meter_mode TEXT NOT NULL DEFAULT 'unlimited',
        ADD COLUMN IF NOT EXISTS meter_metric TEXT NOT NULL DEFAULT 'requests',
        ADD COLUMN IF NOT EXISTS meter_limit NUMERIC,
        ADD COLUMN IF NOT EXISTS meter_warning_limit NUMERIC,
        ADD COLUMN IF NOT EXISTS meter_enforcement TEXT NOT NULL DEFAULT 'soft',
        ADD COLUMN IF NOT EXISTS meter_reset_day SMALLINT,
        ADD COLUMN IF NOT EXISTS price_per_1k_input NUMERIC,
        ADD COLUMN IF NOT EXISTS price_per_1k_output NUMERIC,
        ADD COLUMN IF NOT EXISTS meter_period_start TIMESTAMPTZ;
    `)
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE ai_providers
        DROP COLUMN IF EXISTS meter_mode,
        DROP COLUMN IF EXISTS meter_metric,
        DROP COLUMN IF EXISTS meter_limit,
        DROP COLUMN IF EXISTS meter_warning_limit,
        DROP COLUMN IF EXISTS meter_enforcement,
        DROP COLUMN IF EXISTS meter_reset_day,
        DROP COLUMN IF EXISTS price_per_1k_input,
        DROP COLUMN IF EXISTS price_per_1k_output,
        DROP COLUMN IF EXISTS meter_period_start;
    `)
  },
}
