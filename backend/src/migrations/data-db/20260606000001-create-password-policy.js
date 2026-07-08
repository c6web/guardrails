module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.describeTable('password_policies').catch(() => null)
    if (tables) {
      return // Table already exists, skip
    }

    await queryInterface.createTable('password_policies', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: false,
      },
      max_age_days: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      grace_period_days: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 7,
      },
      min_length: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 8,
      },
      require_uppercase: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      require_lowercase: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      require_numbers: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      require_symbols: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    })

    // Insert default singleton row
    await queryInterface.bulkInsert('password_policies', [
      {
        id: 1,
        max_age_days: null,
        grace_period_days: 7,
        min_length: 8,
        require_uppercase: false,
        require_lowercase: false,
        require_numbers: false,
        require_symbols: false,
      },
    ])
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('password_policies')
  },
}
