'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('embedding_logs')
    if (!table.input_text) {
      await queryInterface.addColumn('embedding_logs', 'input_text', {
        type: Sequelize.DataTypes.TEXT,
        allowNull: true,
      })
    }
  },
  async down(queryInterface) {
    const table = await queryInterface.describeTable('embedding_logs')
    if (table.input_text) {
      await queryInterface.removeColumn('embedding_logs', 'input_text')
    }
  },
}
