import { apiFetch } from './client'
import type { AiProvider } from './aiProviders'

export type { AiProvider }

export async function getProviders(): Promise<AiProvider[]> {
  const res = await apiFetch<{ data: AiProvider[] }>('/api/providers')
  return res.data
}

export async function assignProvider(id: string): Promise<void> {
  await apiFetch(`/api/providers/${id}/assign`, { method: 'POST', body: '{}' })
}

export async function unassignProvider(id: string): Promise<void> {
  await apiFetch(`/api/providers/${id}/unassign`, { method: 'DELETE' })
}

export async function setProviderDefault(id: string): Promise<void> {
  await apiFetch(`/api/providers/${id}/set-default`, { method: 'PATCH', body: '{}' })
}

export async function updateProvider(id: string, payload: Partial<AiProvider>): Promise<AiProvider> {
  const res = await apiFetch<{ data: AiProvider }>(`/api/providers/${id}`, {
    method: 'PATCH', body: JSON.stringify(payload),
  })
  return res.data
}
