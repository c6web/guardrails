'use strict'

module.exports = {
  async up(queryInterface) {
    const now = new Date()
    await queryInterface.bulkInsert('connected_apps', [
      {
        id: '00000010-0000-0000-0000-000000000001',
        name: 'Default App',
        team: 'IT',
        env: 'development',
        status: 'enable',
        rps: 0,
        lat_avg: 0,
        p95: 0,
        blocked_count: 0,
        total_requests: 0,
        sla: 100,
        primary_provider_id: '00000010-0000-0000-0000-000000000001',
        owner: 'admin',
        owner_email: 'admin@c6web.local',
        created_at: now,
        updated_at: now,
      },
    ], { ignoreDuplicates: true })
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('connected_apps', { name: 'Default App' })
  },
}
