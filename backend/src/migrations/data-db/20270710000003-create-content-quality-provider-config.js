'use strict'

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE content_quality_provider_config (
        id              INTEGER PRIMARY KEY DEFAULT 1,
        vendor          VARCHAR(50) NOT NULL DEFAULT 'trulens',
        service_url     TEXT NULL,
        service_api_key TEXT NULL,
        timeout_ms      INTEGER NOT NULL DEFAULT 10000,
        provider_id     VARCHAR(50) REFERENCES ai_providers(id),
        created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT content_quality_provider_config_single_row CHECK (id = 1)
      )
    `)
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS content_quality_provider_config')
  },
}
