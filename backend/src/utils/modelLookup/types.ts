export interface ModelLookupProvider {
  endpoint: string
  apiKey?: string | null
  vendor: string
}

export interface ModelEntry {
  id: string
  label?: string
}

export class ModelLookupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelLookupError'
  }
}

export interface ModelLookupAdapter {
  getUrl(provider: ModelLookupProvider): string
  buildHeaders(provider: ModelLookupProvider): Record<string, string>
  parseResponse(data: unknown): ModelEntry[]
}
