import type { ModelLookupAdapter, ModelLookupProvider, ModelEntry } from '../types'
import { ModelLookupError } from '../types'
import { OpenAIAdapter } from './openai'

function isCompatMode(provider: ModelLookupProvider): boolean {
  return provider.endpoint.includes('/v1')
}

export class OllamaAdapter implements ModelLookupAdapter {
  private openaiFallback = new OpenAIAdapter()

  getUrl(provider: ModelLookupProvider): string {
    const base = provider.endpoint.replace(/\/$/, '')
    if (isCompatMode(provider)) {
      return `${base}/models`
    }
    return `${base}/api/tags`
  }

  buildHeaders(_provider: ModelLookupProvider): Record<string, string> {
    return { 'Content-Type': 'application/json' }
  }

  parseResponse(data: unknown): ModelEntry[] {
    // OpenAI compat response: { data: [{ id }] }
    if ((data as { data?: unknown })?.data !== undefined) {
      return this.openaiFallback.parseResponse(data)
    }

    // Ollama native /api/tags response: { models: [{ name }] }
    const d = data as { models?: Array<{ name: string }> }
    if (!Array.isArray(d?.models)) {
      throw new ModelLookupError('Invalid Ollama response: expected "models" array')
    }

    return d.models.map((m: { name: string }) => ({ id: m.name }))
  }
}
