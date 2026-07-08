'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables()
    if (!tables.includes('detector_framework_mapping')) {
      await queryInterface.createTable('detector_framework_mapping', {
        detector_id: {
          type: Sequelize.UUID,
          allowNull: false,
          primaryKey: true,
        },
        framework_id: {
          type: Sequelize.STRING(50),
          allowNull: false,
          primaryKey: true,
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

      try {
        await queryInterface.addConstraint('detector_framework_mapping', {
          fields: ['detector_id'],
          type: 'foreign key',
          name: 'fk_detector_framework_mapping_detector_id',
          references: { table: 'detectors', field: 'id' },
          onDelete: 'CASCADE',
        })
      } catch (e) {
        // detectors table may not exist yet or FK already exists
      }

      try {
        await queryInterface.addConstraint('detector_framework_mapping', {
          fields: ['framework_id'],
          type: 'foreign key',
          name: 'fk_detector_framework_mapping_framework_id',
          references: { table: 'detection_frameworks', field: 'id' },
          onDelete: 'CASCADE',
        })
      } catch (e) {
        // detection_frameworks may not exist yet or FK already exists
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('detector_framework_mapping')
  },
}
