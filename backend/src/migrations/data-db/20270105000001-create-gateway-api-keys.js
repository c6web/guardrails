'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gateway_key_status') THEN
          CREATE TYPE gateway_key_status AS ENUM ('active', 'superseded', 'revoked');
        END IF;
      END $$;
    `)

    await queryInterface.createTable('gateway_api_keys', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      gateway_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'gateway_instances', key: 'id' },
        onDelete: 'CASCADE',
      },
      key_hash: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      key_encrypted: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      key_prefix: {
        type: Sequelize.STRING(20),
        allowNull: false,
        unique: true,
      },
      version: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('active', 'superseded', 'revoked'),
        allowNull: false,
        defaultValue: 'active',
      },
      grace_expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    })

    await queryInterface.addIndex('gateway_api_keys', ['gateway_id', 'status'], {
      name: 'gateway_api_keys_gateway_id_status_idx',
    })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('gateway_api_keys')
    await queryInterface.sequelize.query(
      `DROP TYPE IF EXISTS gateway_key_status;`
    )
  },
}
