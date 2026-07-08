'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `ALTER TABLE detectors ADD COLUMN IF NOT EXISTS category VARCHAR(10) DEFAULT NULL`
    )
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('detectors', 'category')
  },
}
