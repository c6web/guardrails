'use strict'

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE connected_apps
        ADD COLUMN detectors_custom BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN threat_knowledge_custom BOOLEAN NOT NULL DEFAULT false
    `)
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE connected_apps
        DROP COLUMN detectors_custom,
        DROP COLUMN threat_knowledge_custom
    `)
  },
}
