'use strict'

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      'INSERT INTO response_cache_config (id) VALUES (1) ON CONFLICT DO NOTHING'
    ).catch(() => {})
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('response_cache_config', { id: 1 })
  },
}
