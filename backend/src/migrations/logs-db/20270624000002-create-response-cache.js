'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('response_cache', {
      id: { type: Sequelize.DataTypes.UUID, defaultValue: Sequelize.literal('gen_random_uuid()'), primaryKey: true },
      app_id: { type: Sequelize.DataTypes.UUID, allowNull: false },
      request_hash: { type: Sequelize.DataTypes.STRING(64), allowNull: false },
      model: { type: Sequelize.DataTypes.STRING(200), allowNull: false },
      provider_id: { type: Sequelize.DataTypes.UUID, allowNull: false },
      match_mode: { type: Sequelize.DataTypes.STRING(20), allowNull: false, defaultValue: 'exact' },
      system_prompt_hash: { type: Sequelize.DataTypes.STRING(64), allowNull: true },
      end_user_id: { type: Sequelize.DataTypes.STRING(128), allowNull: true },
      turn_index: { type: Sequelize.DataTypes.INTEGER, allowNull: true },
      response_bytes: { type: Sequelize.DataTypes.BLOB, allowNull: false },
      response_headers: { type: Sequelize.DataTypes.JSONB, allowNull: true },
      tokens_in: { type: Sequelize.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      tokens_out: { type: Sequelize.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      expires_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
      hit_count: { type: Sequelize.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      last_hit_at: { type: Sequelize.DataTypes.DATE, allowNull: true },
    })

    await queryInterface.sequelize.query(
      `ALTER TABLE response_cache ADD COLUMN embedding vector;`
    )

    await queryInterface.addIndex('response_cache', ['app_id', 'request_hash'], {
      name: 'idx_response_cache_exact',
      unique: true,
    })
    await queryInterface.addIndex('response_cache', ['expires_at'], {
      name: 'idx_response_cache_expires',
    })
  },
  async down(queryInterface) {
    await queryInterface.dropTable('response_cache')
  },
}
