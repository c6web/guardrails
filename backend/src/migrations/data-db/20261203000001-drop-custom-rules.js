'use strict'

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS custom_rules_audit`)
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS custom_rules`)
  },

  async down(queryInterface) {
    // Tables are intentionally not recreated during rollback — custom rules were redundant.
    // Recreate them only for migration safety (schema matches original).
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS custom_rules_audit (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        rule_id UUID REFERENCES custom_rules(id),
        action VARCHAR(20) NOT NULL,
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS custom_rules (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        app_id UUID REFERENCES connected_apps(id),
        rule_name VARCHAR(200) NOT NULL,
        rule_pattern TEXT NOT NULL,
        rule_type VARCHAR(10) NOT NULL CHECK (rule_type IN ('regex', 'keyword')),
        action VARCHAR(10) NOT NULL CHECK (action IN ('block', 'redact', 'flag', 'throttle')),
        severity VARCHAR(10) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
        description TEXT,
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
  },
}
