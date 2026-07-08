'use strict'

module.exports = {
  async up(queryInterface) {
    const now = new Date()
    await queryInterface.bulkInsert('detection_frameworks', [
      {
        id: 'owasp-2025-llm01',
        framework_code: 'LLM01-2025',
        name: 'Prompt Injection',
        description: 'An attacker manipulates an LLM through crafted inputs, causing it to unknowingly execute the attacker\'s intentions. This can be done directly through jailbreaks or indirectly through manipulated external inputs, potentially leading to data exfiltration, social engineering, and unauthorized actions.',
        display_order: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'owasp-2025-llm02',
        framework_code: 'LLM02-2025',
        name: 'Sensitive Information Disclosure',
        description: 'When an LLM inadvertently reveals confidential information, proprietary algorithms, or other sensitive details through its responses. This can result in unauthorized access to sensitive data, intellectual property theft, privacy violations, and regulatory non-compliance.',
        display_order: 2,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'owasp-2025-llm03',
        framework_code: 'LLM03-2025',
        name: 'Supply Chain Vulnerabilities',
        description: 'The LLM application lifecycle can be compromised via vulnerable components or services. Training data, ML models, and deployment platforms are all attack surfaces that can be exploited to introduce malicious behavior, backdoors, or biases into systems.',
        display_order: 3,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'owasp-2025-llm04',
        framework_code: 'LLM04-2025',
        name: 'Data and Model Poisoning',
        description: 'Data poisoning occurs when pre-training, fine-tuning, or embedding data is manipulated to introduce vulnerabilities, backdoors, or biases that could compromise the model\'s security, effectiveness, or ethical behavior. Poisoned models can produce harmful or incorrect outputs.',
        display_order: 4,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'owasp-2025-llm05',
        framework_code: 'LLM05-2025',
        name: 'Improper Output Handling',
        description: 'Insufficient validation, sanitization, and handling of LLM-generated outputs before passing them downstream can lead to serious vulnerabilities including XSS, CSRF, SSRF, privilege escalation, and remote code execution in backend systems.',
        display_order: 5,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'owasp-2025-llm06',
        framework_code: 'LLM06-2025',
        name: 'Excessive Agency',
        description: 'An LLM-based system is granted the ability to perform actions or has access to resources beyond what is needed for the intended operation. This leads to unintended actions with harmful consequences, including financial loss, data destruction, or service disruption.',
        display_order: 6,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'owasp-2025-llm07',
        framework_code: 'LLM07-2025',
        name: 'System Prompt Leakage',
        description: 'Occurs when an LLM reveals confidential system prompt information to users. Such exposure can lead to security compromises by revealing operational constraints, intellectual property theft of proprietary instructions, and competitive disadvantage.',
        display_order: 7,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'owasp-2025-llm08',
        framework_code: 'LLM08-2025',
        name: 'Vector and Embedding Weaknesses',
        description: 'Vulnerabilities in how vector embeddings are generated, stored, or retrieved can be exploited to manipulate RAG pipelines, perform cross-tenant data leakage, poison retrieval mechanisms, or reverse-engineer sensitive information from embedding representations.',
        display_order: 8,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'owasp-2025-llm09',
        framework_code: 'LLM09-2025',
        name: 'Misinformation',
        description: 'LLMs can produce inaccurate, misleading, or fabricated content that appears authoritative and factually correct. This can cause serious harm in critical decision-making contexts such as healthcare, legal, and financial domains, eroding user trust and creating liability.',
        display_order: 9,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'owasp-2025-llm10',
        framework_code: 'LLM10-2025',
        name: 'Unbounded Consumption',
        description: 'LLM applications are vulnerable to attacks that cause excessive resource consumption, including denial of service through token flooding, financial damage via API cost exhaustion, and degraded availability through runaway agent loops and uncontrolled inference requests.',
        display_order: 10,
        created_at: now,
        updated_at: now,
      },
    ], { ignoreDuplicates: true })
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('detection_frameworks', null, {})
  },
}
