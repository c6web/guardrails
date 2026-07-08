'use strict'

const ADMIN_ID = '00000001-0000-0000-0000-000000000001'
const ORG_ID   = '00000001-0001-0000-0000-000000000001'

module.exports = {
  async up(queryInterface) {
    const now = new Date()
    await queryInterface.bulkInsert('organizations', [{
      id:            ORG_ID,
      name:          'Administrator',
      owner_user_id: ADMIN_ID,
      created_at:    now,
      updated_at:    now,
    }], { ignoreDuplicates: true })

    // Only set organization_id when NULL — migration backfill may have already set it
    await queryInterface.sequelize.query(
      `UPDATE users SET organization_id = :orgId, updated_at = NOW() WHERE id = :adminId AND organization_id IS NULL`,
      { replacements: { orgId: ORG_ID, adminId: ADMIN_ID } }
    )
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE users SET organization_id = NULL WHERE id = :adminId`,
      { replacements: { adminId: ADMIN_ID } }
    )
    await queryInterface.bulkDelete('organizations', { id: ORG_ID })
  },
}
