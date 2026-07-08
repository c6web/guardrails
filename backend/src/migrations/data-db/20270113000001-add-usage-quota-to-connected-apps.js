module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE connected_apps
        ADD COLUMN IF NOT EXISTS quota_mode TEXT NOT NULL DEFAULT 'unlimited',
        ADD COLUMN IF NOT EXISTS quota_limit INTEGER,
        ADD COLUMN IF NOT EXISTS quota_warning_limit INTEGER,
        ADD COLUMN IF NOT EXISTS quota_enforcement TEXT NOT NULL DEFAULT 'hard',
        ADD COLUMN IF NOT EXISTS quota_reset_day SMALLINT,
        ADD COLUMN IF NOT EXISTS quota_period_start TIMESTAMPTZ;
    `)
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE connected_apps
        DROP COLUMN IF EXISTS quota_mode,
        DROP COLUMN IF EXISTS quota_limit,
        DROP COLUMN IF EXISTS quota_warning_limit,
        DROP COLUMN IF EXISTS quota_enforcement,
        DROP COLUMN IF EXISTS quota_reset_day,
        DROP COLUMN IF EXISTS quota_period_start;
    `)
  },
}
