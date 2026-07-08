import { EmbeddingError } from '../types'

export const DEFAULT_MODELS: Record<string, string> = {
  openai: 'text-embedding-3-small',
  ollama: 'nomic-embed-text',
}

export function buildBearerHeaders(apiKey: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
  return headers
}

export function parseOpenAIResponse(data: unknown): number[] {
  const d = data as {
    data?: Array<{ embedding?: unknown }>
    error?: { message?: string; code?: unknown } | string
  }

  // Some providers (e.g. OpenRouter) return HTTP 200 with a top-level error body
  // when the model is overloaded or the request is rejected.
  if (d?.error) {
    const msg =
      typeof d.error === 'string'
        ? d.error
        : (d.error?.message ?? 'Provider returned an error response')
    throw new EmbeddingError(`Provider error: ${msg}`)
  }

  const embedding = d?.data?.[0]?.embedding
  if (!Array.isArray(embedding) || embedding.length === 0) {
    const hint = d?.data === undefined
      ? 'response has no "data" field'
      : d?.data?.length === 0
        ? '"data" array is empty'
        : d?.data?.[0]?.embedding === null
          ? '"data[0].embedding" is null or missing'
          : '"data[0].embedding" is not an array'
    throw new EmbeddingError(`Invalid embedding response: ${hint}`)
  }
  return embedding as number[]
}

export function extractErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const err = parsed['error'] as { message?: string } | string | undefined
    if (typeof err === 'string') return err
    if (err?.message) return err.message
  } catch {
    // fall through
  }
  return raw
}
