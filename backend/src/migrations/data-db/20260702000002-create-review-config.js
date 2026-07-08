'use strict'

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE review_config (
        id          INTEGER PRIMARY KEY DEFAULT 1,
        provider_id VARCHAR(50) REFERENCES ai_providers(id),
        created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT review_config_single_row CHECK (id = 1)
      )
    `)
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS review_config')
  },
}
