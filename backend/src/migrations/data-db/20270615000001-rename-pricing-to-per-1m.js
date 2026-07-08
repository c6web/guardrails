module.exports = {
  async up(queryInterface) {
    // Rename columns and convert existing per-1K prices to per-1M (multiply by 1000).
    // If no existing prices (all NULL), the rename alone is safe.
    await queryInterface.sequelize.query(`
      ALTER TABLE ai_providers
        RENAME COLUMN price_per_1k_input  TO price_per_1m_input;
    `)
    await queryInterface.sequelize.query(`
      ALTER TABLE ai_providers
        RENAME COLUMN price_per_1k_output TO price_per_1m_output;
    `)
    // Convert existing per-1K values → per-1M (×1000)
    await queryInterface.sequelize.query(`
      UPDATE ai_providers
        SET price_per_1m_input  = price_per_1m_input  * 1000,
            price_per_1m_output = price_per_1m_output * 1000
        WHERE price_per_1m_input IS NOT NULL
           OR price_per_1m_output IS NOT NULL;
    `)
  },
  async down(queryInterface) {
    // Reverse: convert per-1M back to per-1K (÷1000) and rename back
    await queryInterface.sequelize.query(`
      UPDATE ai_providers
        SET price_per_1m_input  = price_per_1m_input  / 1000,
            price_per_1m_output = price_per_1m_output / 1000
        WHERE price_per_1m_input IS NOT NULL
           OR price_per_1m_output IS NOT NULL;
    `)
    await queryInterface.sequelize.query(`
      ALTER TABLE ai_providers
        RENAME COLUMN price_per_1m_input  TO price_per_1k_input;
    `)
    await queryInterface.sequelize.query(`
      ALTER TABLE ai_providers
        RENAME COLUMN price_per_1m_output TO price_per_1k_output;
    `)
  },
}
