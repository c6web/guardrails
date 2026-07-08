import type { EmbeddingAdapter, EmbeddingProviderRecord } from '../types';
import { EmbeddingError } from '../types'

const DEFAULT_GOOGLE_MODEL = 'gemini-embedding-2'

export class GoogleAdapter implements EmbeddingAdapter {
  getEndpointPath(provider: EmbeddingProviderRecord): string {
    const model = provider.model || DEFAULT_GOOGLE_MODEL
    return `/models/${model}:embedContent`
  }

  buildHeaders(provider: EmbeddingProviderRecord): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': provider.api_key ?? '',
    }
  }

  buildBody(provider: EmbeddingProviderRecord, input: string): Record<string, unknown> {
    const model = provider.model || DEFAULT_GOOGLE_MODEL
    const body: Record<string, unknown> = {
      model: `models/${model}`,
      content: { parts: [{ text: input }] },
    }
    if (provider.dimensions) {
      body['output_dimensionality'] = provider.dimensions
    }
    return body
  }

  parseResponse(data: unknown): number[] {
    const d = data as { embedding?: { values?: unknown } }
    const values = d?.embedding?.values
    if (!Array.isArray(values) || values.length === 0) {
      throw new EmbeddingError('Invalid Google response: expected embedding.values array')
    }
    return values as number[]
  }
}
