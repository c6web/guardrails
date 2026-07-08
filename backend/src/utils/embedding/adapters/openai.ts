import type { EmbeddingAdapter, EmbeddingProviderRecord } from '../types'
import { DEFAULT_MODELS, buildBearerHeaders, parseOpenAIResponse } from './base'

export class OpenAIAdapter implements EmbeddingAdapter {
  getEndpointPath(_provider: EmbeddingProviderRecord): string {
    return '/embeddings'
  }

  buildHeaders(provider: EmbeddingProviderRecord): Record<string, string> {
    return buildBearerHeaders(provider.api_key)
  }

  buildBody(provider: EmbeddingProviderRecord, input: string): Record<string, unknown> {
    const body: Record<string, unknown> = { input }
    const model = provider.model || DEFAULT_MODELS['openai']
    if (model) body['model'] = model
    if (provider.dimensions !== null) body['dimensions'] = provider.dimensions
    return body
  }

  parseResponse(data: unknown): number[] {
    return parseOpenAIResponse(data)
  }
}
