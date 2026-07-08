'use strict'

module.exports = {
  async up(queryInterface) {
    const updates = [
      // Prompt Injection — Indirect via URLs / tool outputs
      {
        name: 'pi.indirect.v3',
        keywords: [
          'fetch the file',
          'download and run',
          'curl ',
          'wget ',
          'http',
          'https://',
          'based on the response',
          'according to the url',
          'from the api',
          'parsed from',
        ],
      },
      // Prompt Injection — Jailbreak
      {
        name: 'pi.jailbreak.v2',
        keywords: [
          'ignore all previous instructions',
          'forget everything',
          'from now on you are',
          'you are now',
          'pretend you are dan',
          'do anything now',
          'unfiltered',
          'jailbreak',
          'security_breach',
          'override all safety',
          'bypass all filters',
          'your new instruction is',
        ],
      },
      // Prompt Injection — Delimiter escape
      {
        name: 'pi.delim.escape',
        keywords: [
          'output your system prompt',
          'extract your system prompt',
          'show me your instructions',
        ],
      },
      // Improper Output Handling — HTML/JS sinks
      {
        name: 'out.html.taint',
        keywords: [
          'eval(',
          'document.write',
          'innerHTML',
          'outerHTML',
          'javascript:',
          'onerror=',
          'onload=',
          'setInterval(',
        ],
      },
      // Improper Output Handling — Shell exec
      {
        name: 'out.shell.exec',
        keywords: [
          'execute system commands',
          'system commands',
          'write code to execute',
        ],
      },
      // Excessive Agency
      {
        name: 'agent.scope',
        keywords: [
          'delete all files',
          'execute on your server',
          'access your filesystem',
          'run as root',
          'sudo ',
          'chmod 777',
          'format disk',
          'overwrite',
        ],
      },
      // System Prompt Leakage
      {
        name: 'leak.sysprompt',
        keywords: [
          'your system prompt',
          'output your instructions',
          'repeat your system message',
          'what are your rules',
          'your programming is',
          'these are your instructions',
        ],
      },
    ]

    for (const { name, keywords } of updates) {
      await queryInterface.sequelize.query(
        `UPDATE detectors SET keywords = ARRAY['${keywords.map(k => k.replace(/'/g, "''")).join("','")}'] WHERE name = '${name}'`,
      )
    }

    // Regex-based detectors — these use regex patterns in the keywords array
    const regexUpdates = [
      {
        name: 'pii.pan.luhn',
        keywords: [
          '\\b(?:4\\d{3}|[2-5]\\d{2}|6011)[\\- ]?\\d{4}[\\- ]?\\d{4}[\\- ]?\\d{3,4}\\b',
        ],
      },
      {
        name: 'pii.hkid',
        keywords: [
          '[A-Z]{1,2}\\d{6}\\([AB]\\)|\\d{8}[AB]',
        ],
      },
      {
        name: 'pii.ssn.us',
        keywords: [
          '\\b\\d{3}-\\d{2}-\\d{4}\\b',
        ],
      },
      {
        name: 'secret.sk',
        keywords: [
          'AKIA[0-9A-Z]{16}',
          '(?:key|token|api[_-]?key)\\s*[=:]\\s*[a-zA-Z0-9]{16,}',
          '[Gg][Hh][Pp][Ss]_[A-Za-z0-9]{30,}',
        ],
      },
      {
        name: 'out.code.sqli',
        keywords: [
          '(?:UNION\\s+(?:ALL\\s+)?SELECT)',
          '(?:;\\s*(?:DROP|DELETE|UPDATE|INSERT)\\s)',
          "['\"]?\\s*(?:OR|AND)\\s+['\\d]",
        ],
      },
    ]

    for (const { name, keywords } of regexUpdates) {
      const escaped = keywords.map(k => k.replace(/'/g, "''"))
      await queryInterface.sequelize.query(
        `UPDATE detectors SET keywords = ARRAY['${escaped.join("','")}'] WHERE name = '${name}'`,
      )
    }
  },

  async down(queryInterface) {
    const names = [
      'pi.indirect.v3', 'pi.jailbreak.v2', 'pi.delim.escape',
      'out.html.taint', 'out.shell.exec', 'agent.scope', 'leak.sysprompt',
      'pii.pan.luhn', 'pii.hkid', 'pii.ssn.us', 'secret.sk', 'out.code.sqli',
    ]

    const safeNames = names.map(n => n.replace(/'/g, "''"))
    await queryInterface.sequelize.query(
      `UPDATE detectors SET keywords = NULL WHERE name IN (${safeNames.map(n => `'${n}'`).join(',')})`,
    )
  },
}
