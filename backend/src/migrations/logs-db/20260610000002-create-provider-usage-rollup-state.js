'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('provider_usage_rollup_state', {
      id:                  { type: Sequelize.DataTypes.INTEGER, primaryKey: true },
      last_processed_at:   { type: Sequelize.DataTypes.DATE, allowNull: false },
      updated_at:          { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    })
    // Seed singleton row — start from now so only future logs are aggregated
    await queryInterface.sequelize.query(
      `INSERT INTO provider_usage_rollup_state (id, last_processed_at, updated_at)
       VALUES (1, NOW(), NOW())
       ON CONFLICT DO NOTHING`
    )
  },
  async down(queryInterface) {
    await queryInterface.dropTable('provider_usage_rollup_state')
  },
}
