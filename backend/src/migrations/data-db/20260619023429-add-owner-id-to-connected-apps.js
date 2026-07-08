'use strict'

const { Client } = require('pg')

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('connected_apps', 'owner_id', {
      type: Sequelize.UUID,
      allowNull: true,
    })

    // Backfill owner_id for existing rows by matching owner_email against
    // real accounts in the users-db (separate Postgres database — no FK
    // possible, so this is a one-time best-effort resolution).
    const usersClient = new Client({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_USERS,
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
    })

    try {
      await usersClient.connect()
      const { rows: users } = await usersClient.query('SELECT id, email FROM users')

      for (const user of users) {
        if (!user.email) continue
        await queryInterface.sequelize.query(
          `UPDATE connected_apps
           SET owner_id = :ownerId
           WHERE owner_id IS NULL AND lower(owner_email) = lower(:email)`,
          { replacements: { ownerId: user.id, email: user.email } }
        )
      }
    } catch (e) {
      console.error('owner_id backfill skipped:', e.message)
    } finally {
      await usersClient.end().catch(() => {})
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('connected_apps', 'owner_id')
  },
}
