'use strict'
const { randomUUID } = require('crypto')

module.exports = {
  async up(queryInterface) {
    const now = new Date()

    const tools = [
      { tool_name: 'file_read',         description: 'Read files from the filesystem' },
      { tool_name: 'web_fetch',          description: 'Fetch the full content of web pages and documents' },
      { tool_name: 'text_editor',       description: 'View, write, and modify text files with structured commands' },
      { tool_name: 'memory',            description: 'Store and retrieve persistent information across conversations' },
      { tool_name: 'git',               description: 'Perform git operations (commit, push, merge, create PR)' },
      { tool_name: 'mcp_connector',     description: 'Connect to remote MCP (Model Context Protocol) servers' },
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
    const toolNames = ['file_read', 'web_fetch', 'text_editor', 'memory', 'git', 'mcp_connector']
    await queryInterface.bulkDelete('tool_guardrails', { tool_name: toolNames })
  },
}
