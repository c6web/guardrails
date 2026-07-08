module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE connected_apps
        ADD COLUMN IF NOT EXISTS enable_knowledge_dev BOOLEAN NOT NULL DEFAULT FALSE;
    `)
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE connected_apps DROP COLUMN IF EXISTS enable_knowledge_dev;
    `)
  },
}
