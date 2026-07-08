'use strict'

module.exports = {
  async up(queryInterface) {
    const now = new Date()

    // Patch scanning_scope on existing detectors (fresh installs already have correct values from seeders)
    await queryInterface.sequelize.query(`
      UPDATE detectors SET
        scanning_scope = CASE name
          -- Prompt Injection — input only
          WHEN 'pi.indirect.v3' THEN 'input'
          WHEN 'pi.jailbreak.v2' THEN 'input'
          WHEN 'pi.delim.escape' THEN 'input'

          -- Sensitive Info Disclosure — both directions
          WHEN 'pii.pan.luhn'    THEN 'both'
          WHEN 'pii.hkid'        THEN 'both'
          WHEN 'pii.ssn.us'      THEN 'both'
          WHEN 'secret.sk'       THEN 'both'

          -- Improper Output Handling — output only
          WHEN 'out.html.taint'  THEN 'output'
          WHEN 'out.code.sqli'   THEN 'output'
          WHEN 'out.shell.exec'  THEN 'output'

          -- Excessive Agency — input only
          WHEN 'agent.scope'     THEN 'input'

          -- System Prompt Leakage — output only
          WHEN 'leak.sysprompt'  THEN 'output'

          -- Content Moderation — both directions
          WHEN 'cm.adult.keywords.v1'    THEN 'both'
          WHEN 'cm.hate.keywords.v1'     THEN 'both'
          WHEN 'cm.violence.keywords.v1' THEN 'both'
          WHEN 'cm.illegal.keywords.v1'  THEN 'both'
          WHEN 'cm.selfharm.keywords.v1' THEN 'both'

          -- Regex: sensitive PII/data — both directions
          WHEN 'regex.email'     THEN 'both'
          WHEN 'regex.uuid'      THEN 'both'
          WHEN 'regex.ipv4'      THEN 'both'
          WHEN 'regex.credit-card' THEN 'both'

          -- Regex: security injection — input only
          WHEN 'regex.aws-key'       THEN 'input'
          WHEN 'regex.jwt'           THEN 'input'
          WHEN 'regex.sql-injection' THEN 'input'
          WHEN 'regex.xss'           THEN 'input'

          ELSE scanning_scope
        END,
        updated_at = :now
      WHERE name IN (
        'pi.indirect.v3', 'pi.jailbreak.v2', 'pi.delim.escape',
        'pii.pan.luhn', 'pii.hkid', 'pii.ssn.us', 'secret.sk',
        'out.html.taint', 'out.code.sqli', 'out.shell.exec',
        'agent.scope', 'leak.sysprompt',
        'cm.adult.keywords.v1', 'cm.hate.keywords.v1', 'cm.violence.keywords.v1',
        'cm.illegal.keywords.v1', 'cm.selfharm.keywords.v1',
        'regex.email', 'regex.uuid', 'regex.ipv4', 'regex.credit-card',
        'regex.aws-key', 'regex.jwt', 'regex.sql-injection', 'regex.xss'
      )
    `, { replacements: { now } })
  },

  async down(queryInterface) {
    // Revert to input (the default) for known IDs
    const now = new Date()
    await queryInterface.sequelize.query(`
      UPDATE detectors SET scanning_scope = 'input', updated_at = :now WHERE name IN (
        'pi.indirect.v3', 'pi.jailbreak.v2', 'pi.delim.escape',
        'pii.pan.luhn', 'pii.hkid', 'pii.ssn.us', 'secret.sk',
        'out.html.taint', 'out.code.sqli', 'out.shell.exec',
        'agent.scope', 'leak.sysprompt',
        'cm.adult.keywords.v1', 'cm.hate.keywords.v1', 'cm.violence.keywords.v1',
        'cm.illegal.keywords.v1', 'cm.selfharm.keywords.v1',
        'regex.email', 'regex.uuid', 'regex.ipv4', 'regex.credit-card',
        'regex.aws-key', 'regex.jwt', 'regex.sql-injection', 'regex.xss'
      )
    `, { replacements: { now } })
  },
}
