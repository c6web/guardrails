import { apiFetch } from './client'
import type { ToolGuardrailItem } from '../types'

export interface ToolQualityStats { qualityGood: number; qualityPoison: number; qualityPoor: number; qualityReviewed: number; qualityNotReviewed: number }

export async function getToolQualityStats(): Promise<ToolQualityStats> {
  const res = await apiFetch<{ data: ToolQualityStats }>('/api/tools/stats')
  return res.data
}

interface ToolListMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface ToolListResponse {
  data: ToolGuardrailItem[]
  meta: ToolListMeta
}

export type { ToolGuardrailItem }

export async function getTools(opts?: { page?: number; limit?: number; search?: string }): Promise<ToolListResponse> {
  const params = new URLSearchParams()
  if (opts?.page) params.set('page', String(opts.page))
  if (opts?.limit) params.set('limit', String(opts.limit))
  if (opts?.search) params.set('search', opts.search)
  return apiFetch(`/api/tools?${params}`)
}

export async function createTool(body: { tool_name: string; description?: string; parameters_schema?: unknown; active?: boolean }): Promise<ToolGuardrailItem> {
  return apiFetch('/api/tools', { method: 'POST', body: JSON.stringify(body) })
}

export async function updateTool(id: string, body: Partial<{ description: string; parameters_schema: unknown; active: boolean }>): Promise<ToolGuardrailItem> {
  return apiFetch(`/api/tools/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export async function deleteTool(id: string): Promise<{ id: string; deleted: boolean }> {
  return apiFetch(`/api/tools/${id}`, { method: 'DELETE' })
}

export interface ToolAuditRow {
  id: string
  request_id: string | null
  app_id: string
  app_name: string | null
  tool_name: string
  invocation_count: number
  approved: boolean | null
  violation_flag: boolean
  created_at: string
}

export async function getToolAudit(opts?: { appId?: string; tool_name?: string; requestId?: string; page?: number; limit?: number }): Promise<{ data: ToolAuditRow[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
  const params = new URLSearchParams()
  if (opts?.appId) params.set('app_id', opts.appId)
  if (opts?.tool_name) params.set('tool_name', opts.tool_name)
  if (opts?.requestId) params.set('request_id', opts.requestId)
  params.set('page', String(opts?.page ?? 1))
  params.set('limit', String(opts?.limit ?? 50))
  return apiFetch(`/api/tools/audit?${params}`)
}
