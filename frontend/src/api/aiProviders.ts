import { apiFetch } from './client'

export interface AiProvider {
  id: string; name: string; vendor: string; endpoint: string
  api_key?: string; has_api_key?: boolean; notes?: string; model?: string
  max_output_token?: number; max_input_token?: number
  provider?: string | null; allow_fallbacks?: boolean | null; data_collection?: string | null
  status: 'healthy' | 'degraded' | 'unhealthy'
  timeout_ms: number; requests_24h: number; errors_24h: number; avg_latency_ms: number
  is_default?: boolean
  allowed_models?: string[]
}

export async function getAiProviders(): Promise<AiProvider[]> {
  const res = await apiFetch<{ data: AiProvider[] }>('/api/ai-providers')
  return res.data
}

export async function getAiProvider(id: string): Promise<AiProvider> {
  const res = await apiFetch<{ data: AiProvider }>(`/api/ai-providers/${id}`)
  return res.data
}

export async function createAiProvider(payload: {
  id?: string | undefined; name: string; vendor: string; endpoint: string
  api_key?: string | null; notes?: string | null
  model?: string | null; max_output_token?: number | null; max_input_token?: number | null; timeout_ms?: number
  provider?: string | null; allow_fallbacks?: boolean | null; data_collection?: string | null
}): Promise<AiProvider> {
  const res = await apiFetch<{ data: AiProvider }>('/api/ai-providers', {
    method: 'POST', body: JSON.stringify(payload),
  })
  return res.data
}

export async function updateAiProvider(id: string, payload: Partial<AiProvider>): Promise<AiProvider> {
  const res = await apiFetch<{ data: AiProvider }>(`/api/ai-providers/${id}`, {
    method: 'PATCH', body: JSON.stringify(payload),
  })
  return res.data
}

export async function deleteAiProvider(id: string): Promise<void> {
  await apiFetch(`/api/ai-providers/${id}`, { method: 'DELETE' })
}

export async function lookupAiProviderModelsAdhoc(data: { endpoint: string; api_key?: string; vendor: string }): Promise<{ models: { id: string; label?: string }[] }> {
  const res = await apiFetch<{ data: { models: { id: string; label?: string }[] } }>(
    '/api/ai-providers/models/lookup',
    { method: 'POST', body: JSON.stringify(data) },
  )
  return res.data
}

export async function lookupAiProviderModels(id: string): Promise<{ models: { id: string; label?: string }[] }> {
  const res = await apiFetch<{ data: { models: { id: string; label?: string }[] } }>(
    `/api/ai-providers/${id}/models/lookup`,
  )
  return res.data
}

export async function setAiProviderAllowedModels(id: string, models: string[], defaultModel: string): Promise<void> {
  await apiFetch(`/api/ai-providers/${id}/allowed-models`, {
    method: 'PUT',
    body: JSON.stringify({ models, default_model: defaultModel }),
  })
}
