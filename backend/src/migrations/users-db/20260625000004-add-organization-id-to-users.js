'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'organization_id', {
      type: Sequelize.DataTypes.UUID,
      allowNull: true,
    })

    // Backfill: create one org per existing user using their display_name,
    // then set the user's organization_id to the new org.
    await queryInterface.sequelize.query(`
      WITH new_orgs AS (
        INSERT INTO organizations (id, name, owner_user_id, created_at, updated_at)
        SELECT gen_random_uuid(), display_name, id, NOW(), NOW()
        FROM users
        WHERE organization_id IS NULL
        RETURNING id, owner_user_id
      )
      UPDATE users u
         SET organization_id = no.id
        FROM new_orgs no
       WHERE u.id = no.owner_user_id
    `)
  },

  async down() {
    throw new Error('Rollback not supported — column and backfill data intentionally added')
  },
}
