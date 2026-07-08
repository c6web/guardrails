import { apiFetch } from './client'
import type { Incident } from '../types'
import type { LogMeta } from './logs'

export async function getIncidents(params: {
  status?: string; severity?: string; framework_id?: string; page?: number; limit?: number
} = {}): Promise<{ rows: Incident[]; meta: LogMeta }> {
  const q = new URLSearchParams()
  if (params.status)         q.set('status',         params.status)
  if (params.severity)       q.set('severity',       params.severity)
  if (params.framework_id)   q.set('framework_id',    params.framework_id)
  if (params.page)           q.set('page',           String(params.page))
  if (params.limit)          q.set('limit',          String(params.limit))
  const res = await apiFetch<{ data: Incident[]; meta: LogMeta }>(`/api/incidents?${q}`)
  return { rows: res.data, meta: res.meta }
}

export async function createIncident(data: Partial<Incident>): Promise<Incident> {
  const res = await apiFetch<{ data: Incident }>('/api/incidents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.data
}

export async function updateIncident(id: string, data: Partial<Incident>): Promise<Incident> {
  const res = await apiFetch<{ data: Incident }>(`/api/incidents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.data
}

export async function deleteIncident(id: string): Promise<void> {
  await apiFetch(`/api/incidents/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
