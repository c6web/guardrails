'use strict'

module.exports = {
  async up(queryInterface) {
    const tables = await queryInterface.describeTable('detectors').catch(() => ({}))
    if (tables.category) {
      await queryInterface.removeColumn('detectors', 'category')
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE detectors ADD COLUMN IF NOT EXISTS category VARCHAR(10) DEFAULT NULL`
    )
  },
}
