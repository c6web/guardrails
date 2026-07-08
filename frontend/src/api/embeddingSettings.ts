import { apiFetch } from './client'

interface EmbeddingProviderInfo {
  id: string
  name: string
  model: string | null
  dimensions: number | null
}

interface ThreatKnowledgeSummary {
  total: number
  embedded: number
  mismatch: number
}

export interface EmbeddingSettingsData {
  dimensions: number | null
  active_dim: number | null
  semantic_threshold: number
  primary_provider: EmbeddingProviderInfo | null
  threat_knowledge: ThreatKnowledgeSummary
}

export async function getEmbeddingSettings(): Promise<EmbeddingSettingsData> {
  const res = await apiFetch<{ data: EmbeddingSettingsData }>('/api/settings/embedding')
  return res.data
}

export async function updateEmbeddingSettings(payload: { dimensions?: number; semantic_threshold?: number }): Promise<EmbeddingSettingsData> {
  const res = await apiFetch<{ data: EmbeddingSettingsData }>('/api/settings/embedding', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
  return res.data
}
