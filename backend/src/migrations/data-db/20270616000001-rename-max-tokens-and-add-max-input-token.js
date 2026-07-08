'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('ai_providers')

    if (columns.max_tokens && !columns.max_output_token) {
      await queryInterface.sequelize.query(`
        ALTER TABLE ai_providers
          RENAME COLUMN max_tokens TO max_output_token;
      `)
    }

    const columnsAfterRename = await queryInterface.describeTable('ai_providers')
    if (!columnsAfterRename.max_input_token) {
      await queryInterface.addColumn('ai_providers', 'max_input_token', {
        type: Sequelize.DataTypes.INTEGER,
        allowNull: true,
      })
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable('ai_providers')

    if (columns.max_input_token) {
      await queryInterface.removeColumn('ai_providers', 'max_input_token')
    }

    const columnsAfterRemove = await queryInterface.describeTable('ai_providers')
    if (columnsAfterRemove.max_output_token && !columnsAfterRemove.max_tokens) {
      await queryInterface.sequelize.query(`
        ALTER TABLE ai_providers
          RENAME COLUMN max_output_token TO max_tokens;
      `)
    }
  },
}
