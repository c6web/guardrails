import { apiFetch } from './client'

export interface ResponseCacheConfig {
  enabled: boolean
  exact_match_enabled: boolean
  semantic_match_enabled: boolean
  semantic_threshold: number
}

export async function getResponseCacheConfig(): Promise<ResponseCacheConfig> {
  const res = await apiFetch<{ data: ResponseCacheConfig }>('/api/response-cache-config')
  return res.data
}

export async function updateResponseCacheConfig(payload: Partial<ResponseCacheConfig>): Promise<ResponseCacheConfig> {
  const res = await apiFetch<{ data: ResponseCacheConfig }>('/api/response-cache-config', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return res.data
}

export interface CacheFlushResult {
  ok: boolean
  gatewaysFlushed: number
  gatewaysFailed: number
}

export async function flushResponseCache(): Promise<CacheFlushResult> {
  const res = await apiFetch<{ data: CacheFlushResult }>('/api/response-cache-config/flush', {
    method: 'POST',
  })
  return res.data
}
