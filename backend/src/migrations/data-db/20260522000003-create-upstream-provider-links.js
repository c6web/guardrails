'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('upstream_provider_links', {
      ai_provider_id: {
        type: Sequelize.STRING(50),
        primaryKey: true,
        allowNull: false,
        references: { model: 'ai_providers', key: 'id' },
        onDelete: 'CASCADE',
      },
      is_default: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    })

    // Carry over existing upstream provider assignments
    await queryInterface.sequelize.query(`
      INSERT INTO upstream_provider_links (ai_provider_id, created_at)
      SELECT id, created_at FROM upstream_providers
      ON CONFLICT (ai_provider_id) DO NOTHING
    `).catch(e => {
      if (e.message.includes('relation') && e.message.includes('does not exist')) {
        console.log('[migration] upstream_providers table not found (fresh install) — skipping backfill')
      } else {
        console.warn('[migration] upstream_providers backfill warning:', e.message)
      }
    })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('upstream_provider_links')
  },
}
