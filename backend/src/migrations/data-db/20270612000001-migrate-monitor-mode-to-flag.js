'use strict'

module.exports = {
  async up(queryInterface) {
    const result = await queryInterface.sequelize.query(
      `UPDATE detectors SET mode = 'flag' WHERE mode = 'monitor'`,
    )
    console.log(`[migration] Converted ${result[1]?.rowCount || 0} detectors from 'monitor' to 'flag'`)
  },

  async down(queryInterface) {
    // No-op: cannot distinguish which were originally 'monitor'
  },
}
