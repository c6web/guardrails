import { apiFetch } from './client'
import type { ProviderMeterConfig, ProviderMeterSummaryItem } from '../types'

export async function getMeteringSummary(): Promise<ProviderMeterSummaryItem[]> {
  const data = await apiFetch<{ data: ProviderMeterSummaryItem[] }>('/api/providers/metering/summary')
  return data.data
}

export async function getProviderDailyUsage(
  id: string,
  from?: string,
  to?: string,
): Promise<ProviderDailyRow[]> {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const qs = params.toString()
  const data = await apiFetch<{ data: ProviderDailyRow[] }>(`/api/providers/${id}/metering/daily${qs ? `?${qs}` : ''}`)
  return data.data
}

export async function updateProviderMetering(
  id: string,
  fields: Partial<ProviderMeterConfig & { price_per_1m_input?: number | null; price_per_1m_output?: number | null }>,
): Promise<void> {
  await apiFetch(`/api/providers/${id}/metering`, { method: 'PATCH', body: JSON.stringify(fields) })
}

export async function resetProviderMeter(id: string): Promise<void> {
  await apiFetch(`/api/providers/${id}/metering/reset`, { method: 'POST' })
}

export interface ProviderDailyRow {
  day: string
  call_type: string
  requests: number
  errors: number
  tokens_in: number
  tokens_out: number
  est_cost: number
}
