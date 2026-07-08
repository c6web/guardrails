'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('network_acl_lists', {
      id: {
        type: Sequelize.DataTypes.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      name: {
        type: Sequelize.DataTypes.STRING(120),
        allowNull: false,
      },
      description: {
        type: Sequelize.DataTypes.TEXT,
        allowNull: true,
      },
      list_type: {
        type: Sequelize.DataTypes.STRING(20),
        allowNull: false,
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

    await queryInterface.addIndex('network_acl_lists', ['list_type'])

    await queryInterface.createTable('network_acl_entries', {
      id: {
        type: Sequelize.DataTypes.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      list_id: {
        type: Sequelize.DataTypes.UUID,
        allowNull: false,
      },
      value: {
        type: Sequelize.DataTypes.STRING(255),
        allowNull: false,
      },
      entry_type: {
        type: Sequelize.DataTypes.STRING(20),
        allowNull: false,
      },
      note: {
        type: Sequelize.DataTypes.TEXT,
        allowNull: true,
      },
      enabled: {
        type: Sequelize.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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
      await queryInterface.addConstraint('network_acl_entries', {
        fields: ['list_id'],
        type: 'foreign key',
        name: 'network_acl_entries_list_id_fkey',
        references: { table: 'network_acl_lists', field: 'id' },
        onDelete: 'CASCADE',
      })
    } catch (e) {
      // FK may already exist or referenced table may not exist yet
    }

    await queryInterface.addIndex('network_acl_entries', ['list_id'])
    await queryInterface.addIndex('network_acl_entries', ['enabled'])
    await queryInterface.addIndex('network_acl_entries', ['entry_type'])
  },

  async down(queryInterface) {
    await queryInterface.dropTable('network_acl_entries')
    await queryInterface.dropTable('network_acl_lists')
  },
}
