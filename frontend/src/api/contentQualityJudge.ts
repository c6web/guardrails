import { apiFetch } from './client'

export interface ContentQualityJudgePrompt {
  id: string
  name: string
  description: string | null
  system_prompt: string
  threshold: number
  max_output_tokens: number
  is_active: boolean
  is_system: boolean
  is_default: boolean
  quality_review_result?: string | null
  quality_review_reason?: string | null
  quality_reviewed_at?: string | null
  quality_reviewed_by?: string | null
  created_at?: string
  updated_at?: string
  createdAt?: string
  updatedAt?: string
}

export async function getContentQualityJudgePrompts(): Promise<ContentQualityJudgePrompt[]> {
  const res = await apiFetch<{ data: ContentQualityJudgePrompt[] }>('/api/content-quality-judge/prompts')
  return res.data
}

export async function createContentQualityJudgePrompt(payload: {
  name: string; description?: string; system_prompt: string; threshold?: number; max_output_tokens?: number
}): Promise<ContentQualityJudgePrompt> {
  const res = await apiFetch<{ data: ContentQualityJudgePrompt }>('/api/content-quality-judge/prompts', {
    method: 'POST', body: JSON.stringify(payload),
  })
  return res.data
}

export async function updateContentQualityJudgePrompt(id: string, payload: {
  name?: string; description?: string | null; system_prompt?: string; threshold?: number; max_output_tokens?: number
}): Promise<ContentQualityJudgePrompt> {
  const res = await apiFetch<{ data: ContentQualityJudgePrompt }>(`/api/content-quality-judge/prompts/${id}`, {
    method: 'PATCH', body: JSON.stringify(payload),
  })
  return res.data
}

export async function deleteContentQualityJudgePrompt(id: string): Promise<void> {
  await apiFetch(`/api/content-quality-judge/prompts/${id}`, { method: 'DELETE' })
}

export async function setActiveContentQualityJudgePrompt(id: string): Promise<void> {
  await apiFetch(`/api/content-quality-judge/prompts/${id}/set-active`, { method: 'POST' })
}

export async function restoreDefaultContentQualityJudgePrompt(id: string): Promise<ContentQualityJudgePrompt> {
  const res = await apiFetch<{ data: ContentQualityJudgePrompt }>(`/api/content-quality-judge/prompts/${id}/restore-default`, {
    method: 'POST',
  })
  return res.data
}

export interface QualityStats { qualityGood: number; qualityPoison: number; qualityPoor: number; qualityReviewed: number; qualityNotReviewed: number }

export async function getContentQualityJudgePromptQualityStats(): Promise<QualityStats> {
  const res = await apiFetch<{ data: QualityStats }>('/api/content-quality-judge/prompts/stats')
  return res.data
}
