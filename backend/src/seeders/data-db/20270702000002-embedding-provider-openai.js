'use strict'

module.exports = {
  async up(queryInterface) {
    const now = new Date()

    await queryInterface.bulkInsert('embedding_providers', [
      {
        id: 'ccfc467c-cbef-448a-81ff-6e41871baee2',
        name: 'OpenAI Text Embedding 3 Small',
        vendor: 'openai',
        endpoint: 'https://api.openai.com/v1',
        api_key: null,
        model: 'text-embedding-3-small',
        dimensions: 1536,
        timeout_ms: 30000,
        status: 'healthy',
        notes: 'OpenAI Text Embedding 3 Small — best price-performance for most RAG use cases.',
        requests_24h: 0,
        errors_24h: 0,
        avg_latency_ms: 0,
        created_at: now,
        updated_at: now,
      },
    ], { ignoreDuplicates: true })
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('embedding_providers', { id: 'ccfc467c-cbef-448a-81ff-6e41871baee2' }, {})
  },
}
