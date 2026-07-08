'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('app_permissions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      app_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      user_email: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      user_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    })

    try {
      await queryInterface.addConstraint('app_permissions', {
        fields: ['app_id'],
        type: 'foreign key',
        name: 'app_permissions_app_id_fkey',
        references: { table: 'connected_apps', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      })
    } catch (e) {
      // FK may already exist or referenced table may not exist yet
    }

    await queryInterface.addIndex('app_permissions', ['app_id', 'user_id'], {
      unique: true,
      name: 'app_permissions_app_id_user_id_unique',
    })
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('app_permissions')
  },
}
