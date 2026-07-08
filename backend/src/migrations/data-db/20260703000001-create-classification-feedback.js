'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('classification_feedback', {
      id: {
        type: Sequelize.DataTypes.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      request_id: {
        type: Sequelize.DataTypes.UUID,
        allowNull: false,
      },
      is_correct: {
        type: Sequelize.DataTypes.BOOLEAN,
        allowNull: true,
      },
      threat_title: {
        type: Sequelize.DataTypes.STRING(200),
        allowNull: true,
      },
      correction: {
        type: Sequelize.DataTypes.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    })

    await queryInterface.addIndex('classification_feedback', ['request_id']).catch(() => {})
  },

  async down(queryInterface) {
    await queryInterface.dropTable('classification_feedback')
  },
}
