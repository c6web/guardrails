'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables()
    if (!tables.includes('ai_provider_allowed_models')) {
      await queryInterface.createTable('ai_provider_allowed_models', {
        ai_provider_id: {
          type: Sequelize.STRING(50),
          allowNull: false,
          primaryKey: true,
          references: { model: 'ai_providers', key: 'id' },
          onDelete: 'CASCADE',
        },
        model_id: {
          type: Sequelize.STRING(255),
          allowNull: false,
          primaryKey: true,
        },
        is_default: {
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

      await queryInterface.sequelize.query(`
        CREATE UNIQUE INDEX ai_provider_allowed_models_one_default_idx
        ON ai_provider_allowed_models (ai_provider_id)
        WHERE is_default = true
      `)
    }

    // Backfill existing model values from ai_providers
    await queryInterface.sequelize.query(`
      INSERT INTO ai_provider_allowed_models (ai_provider_id, model_id, is_default, created_at, updated_at)
      SELECT id, model, true, NOW(), NOW() FROM ai_providers WHERE model IS NOT NULL AND model <> ''
      ON CONFLICT DO NOTHING
    `)
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ai_provider_allowed_models')
  },
}
