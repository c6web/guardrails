export interface EmbeddingProviderRecord {
  id: string
  name: string
  vendor: string
  endpoint: string
  api_key: string | null
  model: string | null
  dimensions: number | null
  timeout_ms: number
  provider: string | null
  allow_fallbacks: boolean | null
  data_collection: string | null
}

export interface EmbeddingResult {
  embedding: number[]
  provider_id: string
  provider_name: string
  model: string | null
}

export interface EmbeddingTestResult {
  success: boolean
  latency_ms: number
  dimensions?: number
  preview?: number[]
  error?: string
}

export class EmbeddingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmbeddingError'
  }
}

export interface EmbeddingAdapter {
  getEndpointPath(provider: EmbeddingProviderRecord): string
  buildHeaders(provider: EmbeddingProviderRecord): Record<string, string>
  buildBody(provider: EmbeddingProviderRecord, input: string): Record<string, unknown>
  parseResponse(data: unknown): number[]
}
