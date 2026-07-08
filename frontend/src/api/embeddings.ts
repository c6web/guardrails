import type { GatewayInstance } from './gateways'

export interface EmbeddingResultData {
  object: string
  index: number
  embedding: number[]
}

export interface EmbeddingTestResult {
  success: boolean
  latency_ms: number
  data?: EmbeddingResultData[]
  model?: string
  usage?: { prompt_tokens: number; total_tokens: number }
  error?: string
  raw_json?: string
}

export async function testGatewayEmbedding(
  instance: GatewayInstance,
  input: string | string[],
  model?: string,
  apiKey?: string
): Promise<EmbeddingTestResult> {
  const start = performance.now()
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    const body: Record<string, unknown> = { input }
    if (model) body['model'] = model
    const resp = await fetch(`${instance.url}/v1/embeddings`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify(body),
    })
    const latency_ms = Math.round(performance.now() - start)
    const json = await resp.json()
    const raw_json = JSON.stringify(json, null, 2)
    if (!resp.ok) {
      return {
        success: false, latency_ms,
        error: json?.error?.message ?? json?.error ?? `HTTP ${resp.status}`,
        raw_json,
      }
    }
    return {
      success: true,
      latency_ms,
      data: json.data as EmbeddingResultData[],
      model: json.model as string,
      usage: json.usage as { prompt_tokens: number; total_tokens: number },
      raw_json,
    }
  } catch (err) {
    return {
      success: false,
      latency_ms: Math.round(performance.now() - start),
      error: (err as Error).message || 'Request failed',
    }
  }
}
