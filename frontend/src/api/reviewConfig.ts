import { apiFetch } from './client'

export interface ReviewConfig {
  id: number
  provider_id: string | null
  provider?: { id: string; name: string; vendor: string; status: string } | null
}

export async function getReviewConfig(): Promise<ReviewConfig> {
  const res = await apiFetch<{ data: ReviewConfig }>('/api/review-config')
  return res.data
}

export async function updateReviewConfig(providerId: string | null): Promise<ReviewConfig> {
  const res = await apiFetch<{ data: ReviewConfig }>('/api/review-config', {
    method: 'PUT',
    body: JSON.stringify({ provider_id: providerId }),
  })
  return res.data
}
