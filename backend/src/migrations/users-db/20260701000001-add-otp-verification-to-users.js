'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'otp_code_hash', {
      type: Sequelize.DataTypes.STRING(64),
      allowNull: true,
    })
    await queryInterface.addColumn('users', 'otp_expires_at', {
      type: Sequelize.DataTypes.DATE,
      allowNull: true,
    })
    await queryInterface.addColumn('users', 'otp_attempts', {
      type: Sequelize.DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    })
    await queryInterface.addColumn('users', 'otp_locked_until', {
      type: Sequelize.DataTypes.DATE,
      allowNull: true,
    })
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'otp_code_hash')
    await queryInterface.removeColumn('users', 'otp_expires_at')
    await queryInterface.removeColumn('users', 'otp_attempts')
    await queryInterface.removeColumn('users', 'otp_locked_until')
  },
}
