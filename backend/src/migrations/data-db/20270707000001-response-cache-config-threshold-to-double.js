'use strict'

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE response_cache_config ALTER COLUMN semantic_threshold TYPE DOUBLE PRECISION USING semantic_threshold::double precision'
    )
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE response_cache_config ALTER COLUMN semantic_threshold TYPE NUMERIC USING semantic_threshold::numeric'
    )
  },
}
