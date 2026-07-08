'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('content_quality_judge_prompts', {
      id: {
        type: Sequelize.DataTypes.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      name: {
        type: Sequelize.DataTypes.STRING(255),
        allowNull: false,
      },
      description: {
        type: Sequelize.DataTypes.TEXT,
        allowNull: true,
      },
      system_prompt: {
        type: Sequelize.DataTypes.TEXT,
        allowNull: false,
      },
      threshold: {
        type: Sequelize.DataTypes.REAL,
        allowNull: false,
        defaultValue: 0.7,
      },
      max_output_tokens: {
        type: Sequelize.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 10240,
      },
      is_active: {
        type: Sequelize.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      is_system: {
        type: Sequelize.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      created_at: {
        type: Sequelize.DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    })
    await queryInterface.addIndex('content_quality_judge_prompts', ['is_active'])
  },
  async down(queryInterface) {
    await queryInterface.dropTable('content_quality_judge_prompts')
  },
}
