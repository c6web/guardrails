import { EmbeddingProvider } from '../../models/data-db/EmbeddingProvider'
import { getOrCreateConfig } from '../../models/data-db/EmbeddingProviderConfig'
import type { ILogStore } from '../../logs/ILogStore'
import { providerKeyDecrypt } from '../gatewayKeyCrypto'
import { getAdapter } from './registry'
import { extractErrorMessage } from './adapters/base'
import type { EndpointInfo } from '../validateEndpoint'
import { validateEndpoint, buildPinnedUrl } from '../validateEndpoint'
import type {
  EmbeddingProviderRecord,
  EmbeddingResult,
  EmbeddingTestResult} from './types';
import {
  EmbeddingError
} from './types'

export { EmbeddingError } from './types'
export type { EmbeddingProviderRecord } from './types'

function buildUrl(provider: EmbeddingProviderRecord, path: string): string {
  return provider.endpoint.replace(/\/$/, '') + path
}

async function callProvider(
  provider: EmbeddingProviderRecord,
  input: string,
  timeoutMs: number,
): Promise<number[]> {
  const adapter = getAdapter(provider.vendor)
  const rawUrl = buildUrl(provider, adapter.getEndpointPath(provider))
  let endpointInfo: EndpointInfo
  try {
    endpointInfo = await validateEndpoint(rawUrl)
  } catch (e: unknown) {
    throw new EmbeddingError(`Invalid endpoint: ${(e as Error).message}`)
  }
  const pinned = buildPinnedUrl(endpointInfo)
  const headers = { ...adapter.buildHeaders(provider), ...pinned.headers }
  const body = adapter.buildBody(provider, input)

  let res: Response
  try {
    res = await fetch(pinned.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err: unknown) {
    const e = err as Error
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      throw new EmbeddingError(`Provider timed out after ${timeoutMs}ms`)
    }
    throw new EmbeddingError(`Network error: ${e.message}`)
  }

  const raw = await res.text()
  if (!res.ok) {
    throw new EmbeddingError(extractErrorMessage(raw))
  }

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new EmbeddingError('Invalid JSON response from provider')
  }

  return adapter.parseResponse(data)
}

export async function testEmbeddingProvider(
  provider: EmbeddingProviderRecord,
  text = 'Test embedding.',
  timeoutMs?: number,
): Promise<EmbeddingTestResult> {
  const timeout = timeoutMs ?? provider.timeout_ms ?? 20000
  const start = Date.now()

  try {
    const embedding = await callProvider(provider, text, timeout)
    return {
      success: true,
      latency_ms: Date.now() - start,
      dimensions: embedding.length,
      preview: embedding.slice(0, 5),
    }
  } catch (err: unknown) {
    return {
      success: false,
      latency_ms: Date.now() - start,
      error: (err as Error).message ?? 'Unknown error',
    }
  }
}

export async function generateEmbeddingWithMetadata(
  text: string,
  logStore?: ILogStore,
  source = 'pipeline',
): Promise<EmbeddingResult> {
  const config = await getOrCreateConfig()
  const providerIds = [config.primary_id, config.backup1_id, config.backup2_id].filter(Boolean) as string[]

  if (providerIds.length === 0) {
    throw new EmbeddingError('No embedding provider configured')
  }

  let lastError: Error | null = null

  for (const providerId of providerIds) {
    let provider: EmbeddingProvider | null = null
    try {
      provider = await EmbeddingProvider.findByPk(providerId)
    } catch (err) {
      console.error(`embedding: failed to load provider ${providerId}:`, err)
      lastError = err as Error
      continue
    }
    if (!provider) continue

    if (provider.api_key) {
      try { provider.api_key = providerKeyDecrypt(provider.api_key) } catch { /* use as-is if decrypt fails */ }
    }

    const startMs = Date.now()
    try {
      const embedding = await callProvider(provider, text, provider.timeout_ms)
      const durationMs = Date.now() - startMs

      void logStore?.insertEmbeddingLog({
        request_id: null,
        provider_id: provider.id,
        provider_name: provider.name,
        model: provider.model || null,
        input_chars: text.length,
        dimensions: embedding.length,
        success: true,
        error_message: null,
        duration_ms: durationMs,
        source,
      })

      return {
        embedding,
        provider_id: provider.id,
        provider_name: provider.name,
        model: provider.model || null,
      }
    } catch (err) {
      const durationMs = Date.now() - startMs
      lastError = err as Error
      console.error(`embedding: provider ${providerId} failed:`, err)

      void logStore?.insertEmbeddingLog({
        request_id: null,
        provider_id: provider.id,
        provider_name: provider.name,
        model: provider.model || null,
        input_chars: text.length,
        dimensions: null,
        success: false,
        error_message: (err as Error).message,
        duration_ms: durationMs,
        source,
      })
    }
  }

  throw new EmbeddingError(
    `All embedding providers failed. Last error: ${lastError?.message ?? 'unknown'}`,
  )
}

export async function generateEmbedding(
  text: string,
  logStore?: ILogStore,
  source = 'pipeline',
): Promise<number[]> {
  return (await generateEmbeddingWithMetadata(text, logStore, source)).embedding
}
