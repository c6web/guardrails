'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('embedding_logs', {
      id:             { type: Sequelize.DataTypes.UUID, defaultValue: Sequelize.literal('gen_random_uuid()'), primaryKey: true },
      request_id:     { type: Sequelize.DataTypes.STRING(100), allowNull: true },
      provider_id:    { type: Sequelize.DataTypes.STRING(100), allowNull: false },
      provider_name:  { type: Sequelize.DataTypes.STRING(255), allowNull: false },
      model:          { type: Sequelize.DataTypes.STRING(200), allowNull: true },
      input_chars:    { type: Sequelize.DataTypes.INTEGER, allowNull: false },
      dimensions:     { type: Sequelize.DataTypes.INTEGER, allowNull: true },
      success:        { type: Sequelize.DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      error_message:  { type: Sequelize.DataTypes.TEXT, allowNull: true },
      duration_ms:    { type: Sequelize.DataTypes.INTEGER, allowNull: false },
      source:         { type: Sequelize.DataTypes.STRING(50), allowNull: false, defaultValue: 'pipeline' },
      created_at:     { type: Sequelize.DataTypes.DATE, allowNull: false },
    })
    await queryInterface.addIndex('embedding_logs', ['request_id'])
    await queryInterface.addIndex('embedding_logs', ['provider_id'])
    await queryInterface.addIndex('embedding_logs', ['success'])
    await queryInterface.addIndex('embedding_logs', ['created_at'])
  },
  async down(queryInterface) {
    await queryInterface.dropTable('embedding_logs')
  },
}
