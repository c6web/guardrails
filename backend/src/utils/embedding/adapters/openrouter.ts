import type { EmbeddingProviderRecord } from '../types'
import { OpenAIAdapter } from './openai'

// OpenRouter ranking-attribution headers (openrouter.ai app leaderboard).
const OPENROUTER_REFERER = 'https://github.com/victortong-git/c6-genai-firewall'
const OPENROUTER_TITLE = 'C6 GenAI Firewall'

export class OpenRouterAdapter extends OpenAIAdapter {
  override buildHeaders(provider: EmbeddingProviderRecord): Record<string, string> {
    return {
      ...super.buildHeaders(provider),
      'HTTP-Referer': OPENROUTER_REFERER,
      'X-Title': OPENROUTER_TITLE,
    }
  }

  override buildBody(provider: EmbeddingProviderRecord, input: string): Record<string, unknown> {
    const body = super.buildBody(provider, input)
    if (provider.provider !== null) body['provider'] = provider.provider
    if (provider.allow_fallbacks !== null) body['allow_fallbacks'] = provider.allow_fallbacks
    if (provider.data_collection !== null) body['data_collection'] = provider.data_collection
    return body
  }
}
