'use strict'

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE connected_apps
        ADD COLUMN IF NOT EXISTS enable_content_quality_scan BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS content_quality_scan_mode TEXT NULL,
        ADD COLUMN IF NOT EXISTS content_quality_scan_threshold DOUBLE PRECISION NULL;
    `)
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE connected_apps
        DROP COLUMN IF EXISTS enable_content_quality_scan,
        DROP COLUMN IF EXISTS content_quality_scan_mode,
        DROP COLUMN IF EXISTS content_quality_scan_threshold;
    `)
  },
}
