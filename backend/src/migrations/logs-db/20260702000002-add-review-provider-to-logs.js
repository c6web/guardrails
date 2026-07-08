'use strict'

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE quality_review_logs
      ADD COLUMN review_provider_name VARCHAR(255) NULL,
      ADD COLUMN review_model VARCHAR(255) NULL
    `)
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE quality_review_logs
      DROP COLUMN review_provider_name,
      DROP COLUMN review_model
    `)
  },
}
