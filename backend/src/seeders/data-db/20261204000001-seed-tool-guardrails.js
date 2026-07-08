'use strict'
const { randomUUID } = require('crypto')

module.exports = {
  async up(queryInterface) {
    const now = new Date()

    const tools = [
      { tool_name: 'bash',            description: 'Execute bash/shell commands on the host system' },
      { tool_name: 'shell',           description: 'Execute shell commands (sh/bash/zsh/cmd)' },
      { tool_name: 'computer_use',    description: 'Control computer mouse, keyboard, and screen (Claude computer use)' },
      { tool_name: 'file_write',      description: 'Write or overwrite files on the filesystem' },
      { tool_name: 'file_delete',     description: 'Delete files or directories from the filesystem' },
      { tool_name: 'web_search',      description: 'Search the web or fetch external URLs' },
      { tool_name: 'browser',         description: 'Launch or control a web browser' },
      { tool_name: 'email_send',      description: 'Send emails on behalf of the user or application' },
      { tool_name: 'database_query',  description: 'Execute raw SQL or database queries' },
      { tool_name: 'code_execution',  description: 'Execute arbitrary code in a sandbox or interpreter' },
    ]

    for (const t of tools) {
      const existing = await queryInterface.sequelize.query(
        `SELECT id FROM tool_guardrails WHERE tool_name = :tool_name LIMIT 1`,
        { replacements: { tool_name: t.tool_name }, type: 'SELECT' }
      )
      if (!existing || existing.length === 0) {
        await queryInterface.bulkInsert('tool_guardrails', [{
          id: randomUUID(),
          tool_name: t.tool_name,
          description: t.description,
          parameters_schema: null,
          active: true,
          created_at: now,
          updated_at: now,
        }])
      }
    }
  },

  async down(queryInterface) {
    const toolNames = ['bash', 'shell', 'computer_use', 'file_write', 'file_delete', 'web_search', 'browser', 'email_send', 'database_query', 'code_execution']
    await queryInterface.bulkDelete('tool_guardrails', { tool_name: toolNames })
  },
}
