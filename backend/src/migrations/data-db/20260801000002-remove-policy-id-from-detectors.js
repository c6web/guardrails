'use strict'

const { Sequelize } = require('sequelize')

module.exports = {
  async up(queryInterface) {
    // Drop index on policy_id if it exists
    try {
      await queryInterface.removeIndex('detectors', ['policy_id'])
    } catch (e) {
      // Index may not exist
    }

    // Drop the policy_id column
    try {
      await queryInterface.removeColumn('detectors', 'policy_id')
    } catch (e) {
      // Column may not exist
    }
  },

  async down(queryInterface) {
    // Re-add the column for rollback
    try {
      await queryInterface.addColumn('detectors', 'policy_id', {
        type: Sequelize.DataTypes.UUID,
        allowNull: true,
      })
    } catch (e) {
      // Column may already exist
    }

    // Re-add index
    try {
      await queryInterface.addIndex('detectors', ['policy_id'])
    } catch (e) {
      // Index may already exist
    }
  },
}
