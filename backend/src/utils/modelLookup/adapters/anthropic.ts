import type { ModelLookupAdapter, ModelLookupProvider, ModelEntry } from '../types'
import { ModelLookupError } from '../types'

export class AnthropicAdapter implements ModelLookupAdapter {
  getUrl(_provider: ModelLookupProvider): string {
    return 'https://api.anthropic.com/v1/models'
  }

  buildHeaders(provider: ModelLookupProvider): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': provider.apiKey ?? '',
      'anthropic-version': '2023-06-01',
    }
  }

  parseResponse(data: unknown): ModelEntry[] {
    const d = data as { data?: Array<{ id: string; display_name?: string }> }

    if (!Array.isArray(d?.data)) {
      throw new ModelLookupError('Invalid Anthropic response: expected "data" array')
    }

    return d.data.map((m: { id: string; display_name?: string }) => ({
      id: m.id,
      ...(m.display_name ? { label: m.display_name } : {}),
    }))
  }
}
