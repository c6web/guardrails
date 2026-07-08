import { apiFetch } from './client'
import type { App, AppQuotaUsage, AppThreatKnowledgeItem, AppDetectorItem, AppToolGuardrailItem } from '../types'
export type { AppQuotaUsage } from '../types'

interface ApiApp {
  id: string; name: string; team: string; env: string
  status: 'enable' | 'disable'
  mode: 'soft' | 'monitor' | 'guard' | 'bypass'
  owner?: string | null; owner_email?: string | null; owner_id?: string | null
  org_id?: string | null
  blocked_count: number; total_requests: number
  primary_provider_id?: string | null
  backup1_provider_id?: string | null
  backup2_provider_id?: string | null
  max_tokens?: number | null
  max_payload_size?: number | null
  enable_t2?: boolean
  enable_knowledge_dev?: boolean
  enable_response_cache?: boolean
  cache_ttl_seconds?: number | null
  multi_turn_semantic_enabled?: boolean
  enable_content_quality_scan?: boolean
  content_quality_scan_mode?: string | null
  content_quality_scan_threshold?: number | null
  quota_mode?: 'unlimited' | 'fixed' | 'monthly'
  quota_limit?: number | null
  quota_warning_limit?: number | null
  quota_enforcement?: 'hard' | 'soft'
  quota_reset_day?: number | null
}

function mapApp(a: ApiApp): App {
  return {
    id: a.id, name: a.name, team: a.team, env: a.env,
    status: a.status,
    mode: a.mode ?? 'guard',
    owner: a.owner ?? null,
    ownerEmail: a.owner_email ?? null,
    ownerId: a.owner_id ?? null,
    orgId: a.org_id ?? null,
    blocked: a.blocked_count, total: a.total_requests,
    primaryProviderId: a.primary_provider_id,
    backup1ProviderId: a.backup1_provider_id,
    backup2ProviderId: a.backup2_provider_id,
    maxTokens: a.max_tokens,
    maxPayloadSize: a.max_payload_size,
    enableT2: a.enable_t2 ?? true,
    enableKnowledgeDev: a.enable_knowledge_dev ?? false,
    enableResponseCache: a.enable_response_cache ?? false,
    cacheTtlSeconds: a.cache_ttl_seconds ?? null,
    multiTurnSemanticEnabled: a.multi_turn_semantic_enabled ?? false,
    enableContentQualityScan: a.enable_content_quality_scan ?? false,
    contentQualityScanMode: a.content_quality_scan_mode ?? null,
    contentQualityScanThreshold: a.content_quality_scan_threshold ?? null,
    quotaMode: a.quota_mode ?? 'unlimited',
    quotaLimit: a.quota_limit ?? null,
    quotaWarningLimit: a.quota_warning_limit ?? null,
    quotaEnforcement: a.quota_enforcement ?? 'hard',
    quotaResetDay: a.quota_reset_day ?? null,
  }
}

export interface QuotaPayload {
  quota_mode?: 'unlimited' | 'fixed' | 'monthly'
  quota_limit?: number | null
  quota_warning_limit?: number | null
  quota_enforcement?: 'hard' | 'soft'
  quota_reset_day?: number | null
}

export async function getApps(): Promise<App[]> {
  const res = await apiFetch<{ data: ApiApp[] }>('/api/apps')
  return res.data.map(mapApp)
}

export async function createApp(payload: {
  name: string; team?: string; env: string
  status?: 'enable' | 'disable'
  mode?: 'soft' | 'monitor' | 'guard' | 'bypass'
  owner_id?: string | null
  org_id?: string | null
  max_tokens?: number | null
  max_payload_size?: number | null
  primary_provider_id?: string | null
  backup1_provider_id?: string | null
  backup2_provider_id?: string | null
  enable_t2?: boolean
  enable_knowledge_dev?: boolean
  enable_response_cache?: boolean
  cache_ttl_seconds?: number | null
  multi_turn_semantic_enabled?: boolean
  enable_content_quality_scan?: boolean
  content_quality_scan_mode?: string | null
  content_quality_scan_threshold?: number | null
} & QuotaPayload): Promise<App> {
  const res = await apiFetch<{ data: ApiApp }>('/api/apps', {
    method: 'POST', body: JSON.stringify(payload),
  })
  return mapApp(res.data)
}

export async function updateApp(id: string, payload: Partial<{
  name: string; team: string; env: string
  status: 'enable' | 'disable'
  mode: 'soft' | 'monitor' | 'guard' | 'bypass'
  owner_id: string | null
  org_id: string | null
  max_tokens: number | null
  max_payload_size: number | null
  primary_provider_id: string | null
  backup1_provider_id: string | null
  backup2_provider_id: string | null
  enable_t2: boolean
  enable_knowledge_dev: boolean
  enable_response_cache: boolean
  cache_ttl_seconds: number | null
  multi_turn_semantic_enabled: boolean
  enable_content_quality_scan: boolean
  content_quality_scan_mode: string | null
  content_quality_scan_threshold: number | null
}> & QuotaPayload): Promise<App> {
  const res = await apiFetch<{ data: ApiApp }>(`/api/apps/${id}`, {
    method: 'PATCH', body: JSON.stringify(payload),
  })
  return mapApp(res.data)
}

export async function deleteApp(id: string): Promise<void> {
  await apiFetch(`/api/apps/${id}`, { method: 'DELETE' })
}

export async function bulkDeleteApps(ids: string[]): Promise<{ deletedCount: number }> {
  const res = await apiFetch<{ deletedCount: number }>('/api/apps/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  return res
}

export interface AppPermission {
  id: string
  user_id: string
  user_email: string
  user_name: string
  created_at: string
}

export async function getAppPermissions(appId: string): Promise<AppPermission[]> {
  const res = await apiFetch<{ data: AppPermission[] }>(`/api/apps/${appId}/permissions`)
  return res.data
}

export async function addAppPermission(appId: string, userId: string): Promise<AppPermission> {
  const res = await apiFetch<{ data: AppPermission }>(`/api/apps/${appId}/permissions`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  })
  return res.data
}

export async function removeAppPermission(appId: string, permissionId: string): Promise<void> {
  await apiFetch(`/api/apps/${appId}/permissions/${permissionId}`, {
    method: 'DELETE',
  })
}

export interface CacheFlushResult {
  ok: boolean
  gatewaysFlushed: number
  gatewaysFailed: number
}

export async function flushAppCache(appId: string): Promise<CacheFlushResult> {
  const res = await apiFetch<{ data: CacheFlushResult }>(`/api/apps/${appId}/cache/flush`, {
    method: 'POST',
  })
  return res.data
}

export interface QuotaSummaryEntry { used: number; limit: number | null; mode: string; state: string }

export async function getQuotaUsageSummary(): Promise<Record<string, QuotaSummaryEntry>> {
  const res = await apiFetch<{ data: Record<string, QuotaSummaryEntry> }>('/api/apps/usage-quota/summary')
  return res.data
}

export async function getAppUsageQuota(appId: string): Promise<AppQuotaUsage> {
  return apiFetch<AppQuotaUsage>(`/api/apps/${appId}/usage-quota`)
}

export async function resetAppQuota(appId: string): Promise<void> {
  await apiFetch(`/api/apps/${appId}/usage-quota/reset`, { method: 'POST' })
}

export async function getAppThreatKnowledge(appId: string): Promise<{ data: AppThreatKnowledgeItem[]; isCustom: boolean }> {
  const res = await apiFetch<{ data: AppThreatKnowledgeItem[]; isCustom: boolean }>(`/api/apps/${appId}/threat-knowledge`)
  return res
}

export async function setAppThreatKnowledge(appId: string, selectedIds: string[] | null): Promise<void> {
  await apiFetch(`/api/apps/${appId}/threat-knowledge`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selectedIds }),
  })
}

export async function getAppDetectors(appId: string): Promise<{ data: AppDetectorItem[]; isCustom: boolean }> {
  const res = await apiFetch<{ data: AppDetectorItem[]; isCustom: boolean }>(`/api/apps/${appId}/detectors`)
  return res
}

export async function setAppDetectors(appId: string, selectedIds: string[] | null): Promise<void> {
  await apiFetch(`/api/apps/${appId}/detectors`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selectedIds }),
  })
}

export async function getAppToolGuardrails(appId: string): Promise<{ data: AppToolGuardrailItem[]; isCustom: boolean }> {
  const res = await apiFetch<{ data: AppToolGuardrailItem[]; isCustom: boolean }>(`/api/apps/${appId}/tool-guardrails`)
  return res
}

export async function setAppToolGuardrails(appId: string, selectedIds: string[] | null): Promise<void> {
  await apiFetch(`/api/apps/${appId}/tool-guardrails`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selectedIds }),
  })
}
