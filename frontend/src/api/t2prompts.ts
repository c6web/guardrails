import { apiFetch } from './client'

export interface T2AgentPrompt {
  id: string
  name: string
  description: string | null
  system_prompt: string
  threshold: number
  max_output_tokens: number
  is_active: boolean
  is_system: boolean
  quality_review_result?: string | null
  quality_review_reason?: string | null
  quality_reviewed_at?: string | null
  quality_reviewed_by?: string | null
  created_at?: string
  updated_at?: string
  createdAt?: string
  updatedAt?: string
}

export async function getT2Prompts(): Promise<T2AgentPrompt[]> {
  const res = await apiFetch<{ data: T2AgentPrompt[] }>('/api/t2-agent-prompts')
  return res.data
}

export async function createT2Prompt(payload: {
  name: string; description?: string; system_prompt: string; threshold?: number; max_output_tokens?: number
}): Promise<T2AgentPrompt> {
  const res = await apiFetch<{ data: T2AgentPrompt }>('/api/t2-agent-prompts', {
    method: 'POST', body: JSON.stringify(payload),
  })
  return res.data
}

export async function updateT2Prompt(id: string, payload: {
  name?: string; description?: string | null; system_prompt?: string; threshold?: number; max_output_tokens?: number
}): Promise<T2AgentPrompt> {
  const res = await apiFetch<{ data: T2AgentPrompt }>(`/api/t2-agent-prompts/${id}`, {
    method: 'PATCH', body: JSON.stringify(payload),
  })
  return res.data
}

export async function deleteT2Prompt(id: string): Promise<void> {
  await apiFetch(`/api/t2-agent-prompts/${id}`, { method: 'DELETE' })
}

export async function setActiveT2Prompt(id: string): Promise<void> {
  await apiFetch(`/api/t2-agent-prompts/${id}/set-active`, { method: 'POST' })
}

export interface QualityStats { qualityGood: number; qualityPoison: number; qualityPoor: number; qualityReviewed: number; qualityNotReviewed: number }

export async function getT2PromptQualityStats(): Promise<QualityStats> {
  const res = await apiFetch<{ data: QualityStats }>('/api/t2-agent-prompts/stats')
  return res.data
}
