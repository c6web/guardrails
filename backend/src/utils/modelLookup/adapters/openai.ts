import type { ModelLookupAdapter, ModelLookupProvider, ModelEntry } from '../types'
import { ModelLookupError } from '../types'

export class OpenAIAdapter implements ModelLookupAdapter {
  getUrl(provider: ModelLookupProvider): string {
    const base = provider.endpoint.replace(/\/$/, '')
    return `${base}/models`
  }

  buildHeaders(provider: ModelLookupProvider): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`
    return headers
  }

  parseResponse(data: unknown): ModelEntry[] {
    const d = data as { data?: Array<{ id: string }>; error?: { message?: string } | string }

    if (d?.error) {
      const msg =
        typeof d.error === 'string'
          ? d.error
          : (d.error?.message ?? 'Provider returned an error response')
      throw new ModelLookupError(`Provider error: ${msg}`)
    }

    if (!Array.isArray(d?.data)) {
      throw new ModelLookupError('Invalid response: expected "data" array')
    }

    return d.data.map((m: { id: string }) => ({ id: m.id }))
  }
}
