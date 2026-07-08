'use strict'

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE ai_providers
      SET endpoint = 'https://generativelanguage.googleapis.com/v1beta/openai'
      WHERE vendor = 'google-gemini'
        AND endpoint = 'https://generativelanguage.googleapis.com/v1beta'
    `)
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE ai_providers
      SET endpoint = 'https://generativelanguage.googleapis.com/v1beta'
      WHERE vendor = 'google-gemini'
        AND endpoint = 'https://generativelanguage.googleapis.com/v1beta/openai'
    `)
  },
}
