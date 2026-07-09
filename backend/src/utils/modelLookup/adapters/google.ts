import type { ModelLookupAdapter, ModelLookupProvider, ModelEntry } from '../types'
import { ModelLookupError } from '../types'

export class GoogleAdapter implements ModelLookupAdapter {
  getUrl(provider: ModelLookupProvider): string {
    const key = provider.apiKey ? `?key=${encodeURIComponent(provider.apiKey)}` : ''
    return `https://generativelanguage.googleapis.com/v1beta/models${key}`
  }

  buildHeaders(_provider: ModelLookupProvider): Record<string, string> {
    return { 'Content-Type': 'application/json' }
  }

  parseResponse(data: unknown): ModelEntry[] {
    const d = data as { models?: Array<{ name: string; displayName?: string }> }

    if (!Array.isArray(d?.models)) {
      throw new ModelLookupError('Invalid Google response: expected "models" array')
    }

    return d.models.map((m: { name: string; displayName?: string }) => ({
      id: m.name.replace(/^models\//, ''),
      ...(m.displayName ? { label: m.displayName } : {}),
    }))
  }
}
