'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('provider_usage_daily', {
      id:            { type: Sequelize.DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      provider_id:   { type: Sequelize.DataTypes.STRING(100), allowNull: false },
      provider_name: { type: Sequelize.DataTypes.STRING(255), allowNull: false },
      vendor:        { type: Sequelize.DataTypes.STRING(50),  allowNull: false },
      call_type:     { type: Sequelize.DataTypes.STRING(32),  allowNull: false },
      day:           { type: Sequelize.DataTypes.DATEONLY,    allowNull: false },
      requests:      { type: Sequelize.DataTypes.BIGINT,      allowNull: false, defaultValue: 0 },
      errors:        { type: Sequelize.DataTypes.BIGINT,      allowNull: false, defaultValue: 0 },
      tokens_in:     { type: Sequelize.DataTypes.BIGINT,      allowNull: false, defaultValue: 0 },
      tokens_out:    { type: Sequelize.DataTypes.BIGINT,      allowNull: false, defaultValue: 0 },
      updated_at:    { type: Sequelize.DataTypes.DATE,        allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    })
    await queryInterface.addConstraint('provider_usage_daily', {
      fields: ['provider_id', 'call_type', 'day'],
      type: 'unique',
      name: 'provider_usage_daily_provider_calltype_day_unique',
    })
    await queryInterface.addIndex('provider_usage_daily', ['day'])
    await queryInterface.addIndex('provider_usage_daily', ['provider_id'])
  },
  async down(queryInterface) {
    await queryInterface.dropTable('provider_usage_daily')
  },
}
