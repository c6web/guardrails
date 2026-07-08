'use strict'
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('gateway_instances', {
      id:                 { type: Sequelize.DataTypes.UUID, defaultValue: Sequelize.literal('gen_random_uuid()'), primaryKey: true },
      name:               { type: Sequelize.DataTypes.STRING(120), allowNull: false },
      description:        { type: Sequelize.DataTypes.TEXT,        allowNull: true  },
      location:           { type: Sequelize.DataTypes.STRING(120), allowNull: true  },
      url:                { type: Sequelize.DataTypes.STRING(255), allowNull: false },
      api_key:            { type: Sequelize.DataTypes.STRING(500), allowNull: true  },
      default_firewall_mode: { type: Sequelize.DataTypes.STRING(20), allowNull: false, defaultValue: 'allow_all' },
      acl_list_id:        { type: Sequelize.DataTypes.UUID,        allowNull: true  },
      created_at:         { type: Sequelize.DataTypes.DATE,        allowNull: false },
      updated_at:         { type: Sequelize.DataTypes.DATE,        allowNull: false },
    })

    try {
      await queryInterface.addConstraint('gateway_instances', {
        fields: ['acl_list_id'],
        type: 'foreign key',
        name: 'fk_gateway_instances_acl_list_id',
        references: { table: 'network_acl_lists', field: 'id' },
        onDelete: 'SET NULL',
      })
    } catch (e) {
      // FK may already exist or referenced table may not exist yet
    }

    await queryInterface.addIndex('gateway_instances', ['default_firewall_mode'])
  },
  async down(queryInterface) {
    await queryInterface.dropTable('gateway_instances')
  },
}
