'use strict'

module.exports = {
  async up(queryInterface) {
    const now = new Date()
    await queryInterface.bulkInsert('detection_frameworks', [
      {
        id: 'agentic-ai-2026',
        framework_code: 'AAI-2026',
        name: 'Agentic AI Threats',
        description: 'Security threats specific to autonomous AI agent systems (OpenClaw, Hermes Agent, Claude Agents, etc.). Covers 10 sub-categories: Tool Prompt Injection — crafted inputs manipulating tool selection or arguments; Indirect Tool Output Injection — external content fetched by tools injects instructions hijacking agent behavior; Agent Loop & Recursion Abuse — infinite tool-calling loops exhausting compute; Tool Argument Exploitation — path traversal, command injection, SSRF via tool parameters; Data Exfiltration via Tools — sensitive data sent through tool args to attacker destinations; Orchestrator Manipulation — manipulating agent routing, selection, or orchestration logic; Autonomy Bypass — bypassing human-in-the-loop, approval gates, or confirmation steps; Inter-Agent Communication Poisoning — corrupting messages between agents causing cascading failures; Agent Memory Poisoning — malicious content in agent memory biasing future decisions; Multi-Turn Resource Exhaustion — coordinated multi-turn attacks exhausting rate limits and API budgets.',
        display_order: 16,
        created_at: now,
        updated_at: now,
      },
    ], { ignoreDuplicates: true })
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('detection_frameworks', { id: 'agentic-ai-2026' }, {})
  },
}
