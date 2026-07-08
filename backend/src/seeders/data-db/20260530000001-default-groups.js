'use strict'

module.exports = {
  async up(queryInterface) {
    const now = new Date()

    await queryInterface.bulkInsert('groups', [
      {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Administrators',
        role: 'admin',
        is_default: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        name: 'Viewers',
        role: 'viewer',
        is_default: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: '00000000-0000-0000-0000-000000000003',
        name: 'Users',
        role: 'user',
        is_default: true,
        created_at: now,
        updated_at: now,
      },
    ], { ignoreDuplicates: true })

    await queryInterface.bulkInsert('group_memberships', [
      { id: '00000001-0000-0000-0000-000000000001', user_id: '00000001-0000-0000-0000-000000000001', group_id: '00000000-0000-0000-0000-000000000001', created_at: now },
      { id: '00000002-0000-0000-0000-000000000002', user_id: '00000002-0000-0000-0000-000000000001', group_id: '00000000-0000-0000-0000-000000000001', created_at: now },
      { id: '00000003-0000-0000-0000-000000000003', user_id: '00000003-0000-0000-0000-000000000001', group_id: '00000000-0000-0000-0000-000000000003', created_at: now },
      { id: '00000004-0000-0000-0000-000000000004', user_id: '00000004-0000-0000-0000-000000000001', group_id: '00000000-0000-0000-0000-000000000002', created_at: now },
      { id: '00000005-0000-0000-0000-000000000005', user_id: '00000005-0000-0000-0000-000000000001', group_id: '00000000-0000-0000-0000-000000000003', created_at: now },
      { id: '00000006-0000-0000-0000-000000000006', user_id: '00000006-0000-0000-0000-000000000001', group_id: '00000000-0000-0000-0000-000000000003', created_at: now },
      { id: '00000007-0000-0000-0000-000000000007', user_id: '00000007-0000-0000-0000-000000000001', group_id: '00000000-0000-0000-0000-000000000003', created_at: now },
      { id: '00000008-0000-0000-0000-000000000008', user_id: '00000008-0000-0000-0000-000000000001', group_id: '00000000-0000-0000-0000-000000000003', created_at: now },
      { id: '00000009-0000-0000-0000-000000000009', user_id: '00000009-0000-0000-0000-000000000001', group_id: '00000000-0000-0000-0000-000000000002', created_at: now },
      { id: '0000000a-0000-0000-0000-00000000000a', user_id: '0000000a-0000-0000-0000-000000000001', group_id: '00000000-0000-0000-0000-000000000002', created_at: now },
    ], { ignoreDuplicates: true })
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('group_memberships', null, {})
    await queryInterface.bulkDelete('groups', { is_default: true }, {})
  },
}
