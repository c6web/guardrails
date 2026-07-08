'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: { type: Sequelize.DataTypes.UUID, defaultValue: Sequelize.DataTypes.UUIDV4, primaryKey: true },
      username: { type: Sequelize.DataTypes.STRING(50), unique: true, allowNull: false },
      email: { type: Sequelize.DataTypes.STRING(255), unique: true, allowNull: false },
      password_hash: { type: Sequelize.DataTypes.STRING(255), allowNull: false },
      full_name: { type: Sequelize.DataTypes.STRING(255), allowNull: true },
      role: {
        type: Sequelize.DataTypes.ENUM('admin', 'policy_editor', 'reviewer', 'app_owner', 'auditor', 'external'),
        allowNull: false,
        defaultValue: 'app_owner',
      },
      team: { type: Sequelize.DataTypes.STRING(100), allowNull: true },
      mfa_enabled: { type: Sequelize.DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      mfa_type: {
        type: Sequelize.DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'none',
      },
      status: {
        type: Sequelize.DataTypes.ENUM('active', 'dormant', 'suspended'),
        allowNull: false,
        defaultValue: 'active',
      },
      last_seen_at: { type: Sequelize.DataTypes.DATE, allowNull: true },
      display_name: { type: Sequelize.DataTypes.STRING(100), allowNull: false, defaultValue: 'user' },
      otp_enabled: { type: Sequelize.DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      otp_verified_at: { type: Sequelize.DataTypes.DATE, allowNull: true },
      password_changed_at: { type: Sequelize.DataTypes.DATE, allowNull: true, defaultValue: null },
      must_change_password: { type: Sequelize.DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      password_grace_until: { type: Sequelize.DataTypes.DATE, allowNull: true, defaultValue: null },
      group_id: { type: Sequelize.DataTypes.UUID, allowNull: true },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
    })
    await queryInterface.addConstraint('users', {
      fields: ['display_name'],
      type: 'unique',
      name: 'users_display_name_unique',
    })
    await queryInterface.addIndex('users', ['username'])
    await queryInterface.addIndex('users', ['email'])
  },
  async down(queryInterface) {
    await queryInterface.dropTable('users')
  },
}
