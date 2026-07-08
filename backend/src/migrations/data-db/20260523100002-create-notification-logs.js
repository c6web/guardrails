'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('notification_logs', {
      id: {
        type: Sequelize.DataTypes.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      server_id: {
        type: Sequelize.DataTypes.UUID,
        allowNull: true,
        references: { model: 'notification_servers', key: 'id' },
        onDelete: 'SET NULL',
      },
      server_name: {
        type: Sequelize.DataTypes.STRING(255),
        allowNull: false,
      },
      server_type: {
        type: Sequelize.DataTypes.STRING(50),
        allowNull: false,
      },
      recipient: {
        type: Sequelize.DataTypes.STRING(255),
        allowNull: false,
      },
      subject: {
        type: Sequelize.DataTypes.STRING(500),
        allowNull: false,
      },
      status: {
        type: Sequelize.DataTypes.ENUM('sent', 'failed'),
        allowNull: false,
      },
      error_message: {
        type: Sequelize.DataTypes.TEXT,
        allowNull: true,
      },
      message_id: {
        type: Sequelize.DataTypes.STRING(255),
        allowNull: true,
      },
      triggered_by: {
        type: Sequelize.DataTypes.STRING(255),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    })
    await queryInterface.addIndex('notification_logs', ['server_id'])
    await queryInterface.addIndex('notification_logs', ['status'])
    await queryInterface.addIndex('notification_logs', ['created_at'])
  },
  async down(queryInterface) {
    await queryInterface.dropTable('notification_logs')
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_notification_logs_status"')
  },
}
