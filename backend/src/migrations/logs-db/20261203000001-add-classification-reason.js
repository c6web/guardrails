'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('ai_request_logs')
    if (!columns['classification_reason']) {
      await queryInterface.addColumn('ai_request_logs', 'classification_reason', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable('ai_request_logs')
    if (columns['classification_reason']) {
      await queryInterface.removeColumn('ai_request_logs', 'classification_reason');
    }
  },
};
