'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('api_keys', {
      id: { type: Sequelize.DataTypes.UUID, defaultValue: Sequelize.DataTypes.UUIDV4, primaryKey: true },
      name: { type: Sequelize.DataTypes.STRING(255), allowNull: false },
      key_prefix: { type: Sequelize.DataTypes.STRING(20), allowNull: false, unique: true },
      key_hash: { type: Sequelize.DataTypes.STRING(64), allowNull: false },
      app_id: { type: Sequelize.DataTypes.UUID, allowNull: false },
      scopes: { type: Sequelize.DataTypes.ARRAY(Sequelize.DataTypes.TEXT), allowNull: false },
      owner: { type: Sequelize.DataTypes.STRING(255), allowNull: false },
      rotation_policy: { type: Sequelize.DataTypes.STRING(50), allowNull: false },
      last_used_at: { type: Sequelize.DataTypes.DATE, allowNull: true },
      status: {
        type: Sequelize.DataTypes.ENUM('active', 'rotate-due', 'revoked'),
        allowNull: false,
        defaultValue: 'active',
      },
      key_value: { type: Sequelize.DataTypes.TEXT, allowNull: true },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
    })
    await queryInterface.addConstraint('api_keys', {
      fields: ['app_id'],
      type: 'foreign key',
      name: 'fk_api_keys_app_id',
      references: { table: 'connected_apps', field: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })
    await queryInterface.addIndex('api_keys', ['key_prefix'])
    await queryInterface.addIndex('api_keys', ['app_id'])
    await queryInterface.addIndex('api_keys', ['status'])
  },
  async down(queryInterface) {
    await queryInterface.dropTable('api_keys')
  },
}
