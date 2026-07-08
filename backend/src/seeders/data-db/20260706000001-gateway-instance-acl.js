'use strict'

module.exports = {
  async up(queryInterface) {
    const now = new Date()
    const aclListId = '00000001-0000-0000-0000-000000000001'

    await queryInterface.bulkInsert('network_acl_lists', [
      { id: aclListId, name: 'Local Development Allowlist', description: 'Allows localhost and private network ranges for gateway-local-01', list_type: 'allowlist', created_at: now, updated_at: now }
    ], { ignoreDuplicates: true })

    await queryInterface.bulkInsert('network_acl_entries', [
      { id: '00000010-0000-0000-0000-000000000001', list_id: aclListId, value: '127.0.0.1', entry_type: 'ip', note: 'Localhost loopback', enabled: true, created_at: now, updated_at: now },
      { id: '00000010-0000-0000-0000-000000000002', list_id: aclListId, value: '::1', entry_type: 'ip', note: 'IPv6 localhost', enabled: true, created_at: now, updated_at: now },
      { id: '00000010-0000-0000-0000-000000000003', list_id: aclListId, value: '192.168.0.0/16', entry_type: 'cidr', note: 'Private B-class range', enabled: true, created_at: now, updated_at: now },
      { id: '00000010-0000-0000-0000-000000000004', list_id: aclListId, value: '10.0.0.0/8', entry_type: 'cidr', note: 'Private A-class range', enabled: true, created_at: now, updated_at: now },
      { id: '00000010-0000-0000-0000-000000000005', list_id: aclListId, value: '172.16.0.0/12', entry_type: 'cidr', note: 'Private C-class range', enabled: true, created_at: now, updated_at: now }
    ], { ignoreDuplicates: true })

    await queryInterface.bulkInsert('gateway_instances', [
      { id: '00000002-0000-0000-0000-000000000001', name: 'gateway-local-01', description: 'Local development gateway instance', location: 'localhost', url: 'http://gateway-engine:8082', acl_list_id: null, default_firewall_mode: 'allow_all', created_at: now, updated_at: now }
    ], { ignoreDuplicates: true })
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('gateway_instances', { id: '00000002-0000-0000-0000-000000000001' })
    await queryInterface.bulkDelete('network_acl_entries', { list_id: '00000001-0000-0000-0000-000000000001' })
    await queryInterface.bulkDelete('network_acl_lists', { id: '00000001-0000-0000-0000-000000000001' })
  },
}
