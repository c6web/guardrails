'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('incidents', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      title: { type: Sequelize.TEXT, allowNull: false },
      severity: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'med' },
      status: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'open' },
      framework_id: { type: Sequelize.STRING(50), allowNull: true },
      description: { type: Sequelize.TEXT, allowNull: true },
      source_request_id: { type: Sequelize.STRING(255), allowNull: true },
      affected_app_id: { type: Sequelize.STRING(255), allowNull: true },
      affected_app_name: { type: Sequelize.STRING(255), allowNull: true },
      source_ip: { type: Sequelize.STRING(64), allowNull: true },
      detector: { type: Sequelize.STRING(255), allowNull: true },
      confidence: { type: Sequelize.FLOAT, allowNull: true },
      created_by: { type: Sequelize.STRING(255), allowNull: true },
      resolved_by: { type: Sequelize.STRING(255), allowNull: true },
      resolved_at: { type: Sequelize.DATE, allowNull: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    })

    await queryInterface.addIndex('incidents', ['status'])
    await queryInterface.addIndex('incidents', ['severity'])
    await queryInterface.addIndex('incidents', ['created_at'])
  },

  async down(queryInterface) {
    await queryInterface.dropTable('incidents')
  },
}
