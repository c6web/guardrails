'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('detectors', {
      id: { type: Sequelize.DataTypes.UUID, defaultValue: Sequelize.DataTypes.UUIDV4, primaryKey: true },
      name: { type: Sequelize.DataTypes.STRING(100), allowNull: false, unique: true },
      description: { type: Sequelize.DataTypes.TEXT, allowNull: false },
      threshold: { type: Sequelize.DataTypes.FLOAT, allowNull: false },
      mode: { type: Sequelize.DataTypes.STRING(20), allowNull: false, defaultValue: 'block' },
      rule_type: { type: Sequelize.DataTypes.STRING(20), allowNull: false, defaultValue: 'keyword' },
      keywords: { type: Sequelize.DataTypes.ARRAY(Sequelize.DataTypes.TEXT), allowNull: true },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
    })
  },
  async down(queryInterface) {
    await queryInterface.dropTable('detectors')
  },
}
