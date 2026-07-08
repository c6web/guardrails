module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE ai_request_logs
        ADD COLUMN IF NOT EXISTS t2_flagged    BOOLEAN,
        ADD COLUMN IF NOT EXISTS t2_confidence FLOAT,
        ADD COLUMN IF NOT EXISTS t2_reason     TEXT;
    `)
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE ai_request_logs
        DROP COLUMN IF EXISTS t2_flagged,
        DROP COLUMN IF EXISTS t2_confidence,
        DROP COLUMN IF EXISTS t2_reason;
    `)
  },
}
