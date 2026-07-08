'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('refresh_tokens', {
      id: { type: Sequelize.DataTypes.UUID, defaultValue: Sequelize.DataTypes.UUIDV4, primaryKey: true },
      user_id: {
        type: Sequelize.DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      token_hash: { type: Sequelize.DataTypes.STRING(64), allowNull: false },
      expires_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
      revoked: { type: Sequelize.DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
    })
    await queryInterface.addIndex('refresh_tokens', ['token_hash'])
    await queryInterface.addIndex('refresh_tokens', ['user_id'])
  },
  async down(queryInterface) {
    await queryInterface.dropTable('refresh_tokens')
  },
}
