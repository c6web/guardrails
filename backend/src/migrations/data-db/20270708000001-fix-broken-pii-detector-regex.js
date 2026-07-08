'use strict'

// Corrects detector regex patterns that were corrupted or malformed at seed/migration
// time (invalid character-class ranges, PCRE-style delimiters unsupported by Rust's
// regex crate, double-escaped backslashes) — these detectors silently failed to
// compile and became permanent no-ops. Uses bind parameters throughout so this
// migration itself can't reintroduce a string-escaping bug.
const FIXES = [
  { name: 'pii.email', keywords: ['[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-z]{2,}'] },
  { name: 'PII Redact - Email Address', keywords: ['[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-z]{2,}'] },
  { name: 'PII - Email Address', keywords: ['(?i)[^\\w]\\w+(@| at )[\\w-]+\\.+(\\w|-)+[\\w-]+'] },
  { name: 'pii.pan.luhn', keywords: ['\\b(?:4\\d{3}|[2-5]\\d{2}|6011)[\\- ]?\\d{4}[\\- ]?\\d{4}[\\- ]?\\d{3,4}\\b'] },
  { name: 'pii.hkid', keywords: ['[A-Z]{1,2}\\d{6}\\([AB]\\)|\\d{8}[AB]'] },
  { name: 'pii.ssn.us', keywords: ['\\b\\d{3}-\\d{2}-\\d{4}\\b'] },
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

module.exports = {
  async up(queryInterface) {
    for (const { name, keywords } of FIXES) {
      await queryInterface.sequelize.query(
        'UPDATE detectors SET keywords = $1 WHERE name = $2',
        { bind: [keywords, name] }
      )
    }
  },

  async down() {
    // Corrective data fix — no meaningful rollback (would restore broken regex).
  },
}
