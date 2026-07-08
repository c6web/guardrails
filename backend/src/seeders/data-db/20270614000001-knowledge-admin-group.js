'use strict'
module.exports = {
  async up(queryInterface) {
    const now = new Date()
    await queryInterface.bulkInsert('groups', [
      {
        id: '00000000-0000-0000-0000-000000000004',
        name: 'Knowledge Admins',
        role: 'knowledge_admin',
        is_default: true,
        created_at: now,
        updated_at: now,
      },
    ], { ignoreDuplicates: true })
  },
  async down(queryInterface) {
    await queryInterface.bulkDelete('groups', { id: '00000000-0000-0000-0000-000000000004' }, {})
  },
}
