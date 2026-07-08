'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('ai_request_logs')
    if (!columns['cache_hit']) {
      await queryInterface.addColumn('ai_request_logs', 'cache_hit', {
        type: Sequelize.DataTypes.BOOLEAN,
        allowNull: true,
      })
    }
    if (!columns['cache_tier']) {
      await queryInterface.addColumn('ai_request_logs', 'cache_tier', {
        type: Sequelize.DataTypes.STRING(20),
        allowNull: true,
      })
    }
  },
  async down(queryInterface) {
    const columns = await queryInterface.describeTable('ai_request_logs')
    if (columns['cache_hit']) {
      await queryInterface.removeColumn('ai_request_logs', 'cache_hit')
    }
    if (columns['cache_tier']) {
      await queryInterface.removeColumn('ai_request_logs', 'cache_tier')
    }
  },
}
