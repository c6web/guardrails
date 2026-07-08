'use strict'

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      "INSERT INTO embedding_provider_config (id) VALUES (1) ON CONFLICT DO NOTHING"
    ).catch(() => {})
    await queryInterface.sequelize.query(
      "UPDATE embedding_provider_config SET primary_id = '550e8400-e29b-41d4-a716-446655440000' WHERE id = 1 AND primary_id IS NULL"
    ).catch(() => {})
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "UPDATE embedding_provider_config SET primary_id = NULL WHERE id = 1 AND primary_id = '550e8400-e29b-41d4-a716-446655440000'"
    ).catch(() => {})
  },
}
