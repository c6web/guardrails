'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addIndex('framework_threat_knowledge', ['threat_knowledge_id'], {
      indexName: 'idx_framework_threat_knowledge_tk_id',
    })
    await queryInterface.addIndex('detector_framework_mapping', ['detector_id'], {
      indexName: 'idx_detector_framework_det_id',
    })
  },
  async down(queryInterface) {
    await queryInterface.removeIndex('framework_threat_knowledge', 'idx_framework_threat_knowledge_tk_id')
    await queryInterface.removeIndex('detector_framework_mapping', 'idx_detector_framework_det_id')
  },
}
