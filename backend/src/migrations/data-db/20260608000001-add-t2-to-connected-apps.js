module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE connected_apps
        ADD COLUMN IF NOT EXISTS enable_t2 BOOLEAN NOT NULL DEFAULT TRUE;
    `)
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE connected_apps DROP COLUMN IF EXISTS enable_t2;
    `)
  },
}
