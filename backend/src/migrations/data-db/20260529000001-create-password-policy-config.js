'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('password_policy_config', {
      id:              { type: Sequelize.DataTypes.INTEGER, primaryKey: true, defaultValue: 1 },
      min_length:      { type: Sequelize.DataTypes.INTEGER, allowNull: false, defaultValue: 8 },
      require_uppercase: { type: Sequelize.DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      require_lowercase: { type: Sequelize.DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      require_digit:   { type: Sequelize.DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      require_special: { type: Sequelize.DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    })
    try {
      await queryInterface.sequelize.query(
        "INSERT INTO password_policy_config (id, min_length, require_uppercase, require_lowercase, require_digit, require_special) VALUES (1, 8, FALSE, FALSE, FALSE, FALSE)"
      )
    } catch {}
  },

  async down(queryInterface) {
    await queryInterface.dropTable('password_policy_config')
  },
}
