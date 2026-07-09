import { apiFetch } from './client'

export interface ModelEntry {
  id: string
  label?: string
}

export interface EmbeddingProvider {
  id: string
  name: string
  vendor: string
  endpoint: string
  api_key?: string | null
  has_api_key?: boolean
  model?: string | null
  dimensions: number | null
  timeout_ms: number
  status: 'healthy' | 'degraded' | 'unhealthy'
  notes?: string | null
  provider?: string | null
  allow_fallbacks?: boolean | null
  data_collection?: string | null
  requests_24h: number
  errors_24h: number
  avg_latency_ms: number
  created_at?: Date
  updated_at?: Date
}

export async function getEmbeddingProviders(): Promise<EmbeddingProvider[]> {
  const res = await apiFetch<{ data: EmbeddingProvider[] }>('/api/embedding-providers')
  return res.data
}

export async function getEmbeddingProvider(id: string): Promise<EmbeddingProvider> {
  const res = await apiFetch<{ data: EmbeddingProvider }>(`/api/embedding-providers/${id}`)
  return res.data
}

export async function createEmbeddingProvider(payload: {
  id: string
  name: string
  vendor: string
  endpoint: string
  api_key?: string | null
  model?: string | null
  dimensions?: number | null
  timeout_ms?: number
  notes?: string | null
  provider?: string | null
  allow_fallbacks?: boolean | null
  data_collection?: string | null
}): Promise<EmbeddingProvider> {
  const res = await apiFetch<{ data: EmbeddingProvider }>('/api/embedding-providers', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return res.data
}

export async function updateEmbeddingProvider(
  id: string,
  payload: Partial<EmbeddingProvider>
): Promise<EmbeddingProvider> {
  const res = await apiFetch<{ data: EmbeddingProvider }>(`/api/embedding-providers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return res.data
}

export async function deleteEmbeddingProvider(id: string): Promise<void> {
  await apiFetch(`/api/embedding-providers/${id}`, { method: 'DELETE' })
}

export interface EmbeddingProviderConfig {
  primary_id: string | null
  primary: EmbeddingProvider | null
  backup1_id: string | null
  backup1: EmbeddingProvider | null
  backup2_id: string | null
  backup2: EmbeddingProvider | null
}

export async function lookupEmbeddingProviderModels(id: string): Promise<{ models: ModelEntry[]; note?: string }> {
  const res = await apiFetch<{ data: { models: ModelEntry[]; note?: string } }>(
    `/api/embedding-providers/${id}/models/lookup`
  )
  return res.data
}

export interface DimensionImpact {
  in_chain: boolean
  active_dimension?: number | null
  new_dimension?: number
  at_risk_count: number
}

export async function getEmbeddingDimensionImpact(
  id: string,
  dimensions: number
): Promise<DimensionImpact> {
  const res = await apiFetch<{ data: DimensionImpact }>(
    `/api/embedding-providers/${id}/dimension-impact?dimensions=${dimensions}`
  )
  return res.data
}

export async function getEmbeddingProviderConfig(): Promise<EmbeddingProviderConfig> {
  const res = await apiFetch<{ data: EmbeddingProviderConfig }>(
    '/api/embedding-providers/config/fallback-chain'
  )
  return res.data
}

export async function updateEmbeddingProviderConfig(payload: {
  primary_id?: string | null
  backup1_id?: string | null
  backup2_id?: string | null
}): Promise<EmbeddingProviderConfig> {
  const res = await apiFetch<{ data: EmbeddingProviderConfig }>(
    '/api/embedding-providers/config/fallback-chain',
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  )
  return res.data
}
