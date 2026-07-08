'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('classifier_config', {
      id:                  { type: Sequelize.DataTypes.INTEGER, primaryKey: true, defaultValue: 1 },
      primary_id:          { type: Sequelize.DataTypes.STRING(50), allowNull: true, defaultValue: null },
      backup1_id:          { type: Sequelize.DataTypes.STRING(50), allowNull: true, defaultValue: null },
      backup2_id:          { type: Sequelize.DataTypes.STRING(50), allowNull: true, defaultValue: null },
      confidence_threshold: { type: Sequelize.DataTypes.FLOAT, allowNull: false, defaultValue: 0.65 },
      system_prompt:       { type: Sequelize.DataTypes.TEXT, allowNull: false, defaultValue: '' },
    })

    try {
      await queryInterface.sequelize.query(`
        ALTER TABLE classifier_config
          ADD CONSTRAINT fk_cc_primary FOREIGN KEY (primary_id) REFERENCES ai_providers(id) ON DELETE SET NULL,
          ADD CONSTRAINT fk_cc_backup1 FOREIGN KEY (backup1_id) REFERENCES ai_providers(id) ON DELETE SET NULL,
          ADD CONSTRAINT fk_cc_backup2 FOREIGN KEY (backup2_id) REFERENCES ai_providers(id) ON DELETE SET NULL
      `)
    } catch (e) {
      // FK may already exist or referenced table may not exist yet
    }

    try {
      await queryInterface.sequelize.query(
        "INSERT INTO classifier_config (id, primary_id, backup1_id, backup2_id) VALUES (1, NULL, NULL, NULL)"
      )
    } catch {}
  },

  async down(queryInterface) {
    await queryInterface.dropTable('classifier_config')
  },
}
