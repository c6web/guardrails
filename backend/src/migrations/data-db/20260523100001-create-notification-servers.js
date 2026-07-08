'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('notification_servers', {
      id: {
        type: Sequelize.DataTypes.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      name: {
        type: Sequelize.DataTypes.STRING(255),
        allowNull: false,
      },
      type: {
        type: Sequelize.DataTypes.STRING(50),
        allowNull: false,
      },
      config: {
        type: Sequelize.DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      is_default: {
        type: Sequelize.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      created_at: {
        type: Sequelize.DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    })
    await queryInterface.addIndex('notification_servers', ['is_default'])
    await queryInterface.addIndex('notification_servers', ['type'])
  },
  async down(queryInterface) {
    await queryInterface.dropTable('notification_servers')
  },
}
