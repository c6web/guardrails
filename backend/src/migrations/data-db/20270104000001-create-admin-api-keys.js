'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('admin_api_keys', {
      id: {
        type: Sequelize.DataTypes.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      name: {
        type: Sequelize.DataTypes.STRING(255),
        allowNull: false,
      },
      key_prefix: {
        type: Sequelize.DataTypes.STRING(10),
        allowNull: false,
        unique: true,
      },
      key_hash: {
        type: Sequelize.DataTypes.STRING(64),
        allowNull: false,
      },
      key_value: {
        type: Sequelize.DataTypes.TEXT,
        allowNull: true,
      },
      owner_user_id: {
        type: Sequelize.DataTypes.UUID,
        allowNull: false,
      },
      status: {
        type: Sequelize.DataTypes.ENUM('active', 'revoked'),
        allowNull: false,
        defaultValue: 'active',
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
    await queryInterface.addIndex('admin_api_keys', ['key_hash'])
    await queryInterface.addIndex('admin_api_keys', ['status'])
    await queryInterface.addIndex('admin_api_keys', ['owner_user_id'])
  },

  async down(queryInterface) {
    await queryInterface.dropTable('admin_api_keys')
  },
}
