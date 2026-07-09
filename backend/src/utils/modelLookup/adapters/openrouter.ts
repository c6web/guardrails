import type { ModelLookupProvider } from '../types'
import { OpenAIAdapter } from './openai'

const OPENROUTER_REFERER = 'https://github.com/victortong-git/c6-genai-firewall'
const OPENROUTER_TITLE = 'C6 GenAI Firewall'

export class OpenRouterAdapter extends OpenAIAdapter {
  override buildHeaders(provider: ModelLookupProvider): Record<string, string> {
    return {
      ...super.buildHeaders(provider),
      'HTTP-Referer': OPENROUTER_REFERER,
      'X-Title': OPENROUTER_TITLE,
    }
  }
}
