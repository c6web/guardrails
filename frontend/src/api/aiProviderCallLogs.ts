import { apiFetch } from './client'
import type { LogMeta } from './logs'

export interface AiProviderCallLogRecord {
  id: string
  request_id: string | null
  call_type: string
  source: string
  app_id: string | null
  app_name: string | null
  provider_id: string | null
  provider_name: string | null
  vendor: string | null
  model: string | null
  endpoint: string | null
  request_payload: unknown | null
  response_payload: unknown | null
  tokens_in: number | null
  tokens_out: number | null
  tokens_total: number | null
  duration_ms: number
  status_code: number | null
  success: boolean
  error_message: string | null
  triggered_by: string | null
  created_at: string
}

export async function getProviderCallLogs(params: {
  page?: number; limit?: number
  call_type?: string; provider_id?: string; model?: string
  success?: boolean; source?: string; vendor?: string
  from?: string; to?: string
} = {}): Promise<{ rows: AiProviderCallLogRecord[]; meta: LogMeta }> {
  const q = new URLSearchParams()
  if (params.page !== undefined)    q.set('page',        String(params.page))
  if (params.limit !== undefined)   q.set('limit',       String(params.limit))
  if (params.call_type)             q.set('call_type',   params.call_type)
  if (params.provider_id)           q.set('provider_id', params.provider_id)
  if (params.model)                 q.set('model',       params.model)
  if (params.success !== undefined) q.set('success',     String(params.success))
  if (params.source)                q.set('source',      params.source)
  if (params.vendor)                q.set('vendor',      params.vendor)
  if (params.from)                  q.set('from',        params.from)
  if (params.to)                    q.set('to',          params.to)
  const res = await apiFetch<{ data: AiProviderCallLogRecord[]; meta: LogMeta }>(`/api/logs/provider-calls?${q}`)
  return { rows: res.data, meta: res.meta }
}

export interface ProviderCallLogStats {
  tokensInTotal: number
  tokensOutTotal: number
  tokensTotal: number
  totalCalls: number
}

export async function getProviderCallLogStats(params: {
  call_type?: string; provider_id?: string; model?: string
  success?: boolean; source?: string; vendor?: string
  from?: string; to?: string
} = {}): Promise<ProviderCallLogStats> {
  const q = new URLSearchParams()
  if (params.call_type)             q.set('call_type',   params.call_type)
  if (params.provider_id)           q.set('provider_id', params.provider_id)
  if (params.model)                 q.set('model',       params.model)
  if (params.success !== undefined) q.set('success',     String(params.success))
  if (params.source)                q.set('source',      params.source)
  if (params.vendor)                q.set('vendor',      params.vendor)
  if (params.from)                  q.set('from',        params.from)
  if (params.to)                    q.set('to',          params.to)
  return await apiFetch<ProviderCallLogStats>(`/api/logs/provider-calls/stats?${q}`)
}

export async function deleteProviderCallLog(id: string): Promise<void> {
  await apiFetch(`/api/logs/provider-calls/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function bulkDeleteProviderCallLogs(ids: string[]): Promise<void> {
  await apiFetch('/api/logs/provider-calls/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
}

export async function deleteProviderCallLogsBefore(daysBack: number): Promise<number> {
  const res = await apiFetch<{ deletedCount: number }>('/api/logs/provider-calls/before', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ daysBack }),
  })
  return res.deletedCount
}

export async function deleteAllProviderCallLogs(): Promise<number> {
  const res = await apiFetch<{ deletedCount: number }>('/api/logs/provider-calls/delete-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  return res.deletedCount
}
