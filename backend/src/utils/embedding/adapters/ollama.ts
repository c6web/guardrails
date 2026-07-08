import type { EmbeddingAdapter, EmbeddingProviderRecord } from '../types';
import { EmbeddingError } from '../types'
import { DEFAULT_MODELS, parseOpenAIResponse } from './base'

// Compat mode: endpoint contains /v1 — uses OpenAI-compatible /v1/embeddings
// Native mode: bare Ollama endpoint — uses /api/embed (supports dimensions)
function isCompatMode(provider: EmbeddingProviderRecord): boolean {
  return provider.endpoint.includes('/v1')
}

export class OllamaAdapter implements EmbeddingAdapter {
  getEndpointPath(provider: EmbeddingProviderRecord): string {
    return isCompatMode(provider) ? '/embeddings' : '/api/embed'
  }

  buildHeaders(_provider: EmbeddingProviderRecord): Record<string, string> {
    return { 'Content-Type': 'application/json' }
  }

  buildBody(provider: EmbeddingProviderRecord, input: string): Record<string, unknown> {
    const model = provider.model || DEFAULT_MODELS['ollama']
    // Both compat and native modes use 'input' key.
    // /api/embed and /v1/embeddings both accept 'dimensions' for MRL models.
    const body: Record<string, unknown> = { input }
    if (model) body['model'] = model
    if (provider.dimensions !== null) body['dimensions'] = provider.dimensions
    return body
  }

  parseResponse(data: unknown): number[] {
    // OpenAI compat response: { data: [{ embedding: [...] }] }
    if ((data as { data?: unknown })?.data !== undefined) {
      return parseOpenAIResponse(data)
    }
    // Ollama native /api/embed response: { embeddings: [[...]] }
    const d = data as { embeddings?: unknown[] }
    if (Array.isArray(d?.embeddings) && d.embeddings.length > 0) {
      const first = d.embeddings[0]
      if (Array.isArray(first) && first.length > 0) return first as number[]
    }
    throw new EmbeddingError('Invalid Ollama response: expected embeddings[0] array')
  }
}
