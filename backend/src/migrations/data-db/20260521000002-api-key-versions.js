'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('api_key_versions', {
      id: {
        type: Sequelize.DataTypes.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      api_key_id: {
        type: Sequelize.DataTypes.UUID,
        allowNull: false,
        references: { model: 'api_keys', key: 'id' },
        onDelete: 'CASCADE',
      },
      key_hash:        { type: Sequelize.DataTypes.STRING(64),  allowNull: false },
      key_prefix:      { type: Sequelize.DataTypes.STRING(20),  allowNull: false, unique: true },
      version:         { type: Sequelize.DataTypes.INTEGER,     allowNull: false },
      status: {
        type: Sequelize.DataTypes.ENUM('active', 'superseded', 'revoked'),
        allowNull: false,
        defaultValue: 'active',
      },
      grace_expires_at: { type: Sequelize.DataTypes.DATE, allowNull: true },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    })
    await queryInterface.addIndex('api_key_versions', ['api_key_id'])
    await queryInterface.addIndex('api_key_versions', ['key_prefix'])
    await queryInterface.addIndex('api_key_versions', ['status', 'grace_expires_at'])
  },
  async down(queryInterface) {
    await queryInterface.dropTable('api_key_versions')
  },
}
