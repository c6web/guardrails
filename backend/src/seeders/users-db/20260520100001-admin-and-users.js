'use strict'
const bcrypt = require('bcryptjs')

const ADMIN_ID = '00000001-0000-0000-0000-000000000001'

module.exports = {
  async up(queryInterface) {
    const now = new Date()
    const username = process.env.ADMIN_USERNAME || ''
    const email = process.env.ADMIN_EMAIL || ''
    const password = process.env.ADMIN_PASSWORD || ''

    if (!username || !password) return // skip admin creation if creds not provided

    const hash = await bcrypt.hash(password, 12)

   await queryInterface.bulkInsert('users', [
       {
         id: ADMIN_ID,
         username: username,
         display_name: 'Administrator',
         email: email || `${username}@localhost`,
         password_hash: hash,
         group_id: '00000000-0000-0000-0000-000000000001',
          team: 'Security',
        status: 'active',
        must_change_password: true,
        last_seen_at: now,
        created_at: now,
        updated_at: now,
      },
    ], { ignoreDuplicates: true })
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', { id: [ADMIN_ID] })
  },
}
