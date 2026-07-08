import { apiFetch } from './client'
import type { TrafficRow, ThreatEvent, PipelineTrace } from '../types'

interface SemanticMatch {
  id: string
  name: string
  similarity: number // cosine similarity [0..1], scaled to percentage in UI
}

interface ApiLog {
  id: string; request_id: string; app_id: string; app_name: string; model: string
  method: string; path: string; source_ip: string; app_api_key: string
  tokens_in: number; tokens_out: number; duration_ms: number; status_code: number
  flagged: boolean | null; framework_id: string | null; detector: string | null
  confidence: number | null; action: string | null; threat_title: string | null
  excerpt: string | null; created_at: string | null
  user_prompt: string | null; response_body: string | null
  is_classification_correct: boolean | null
  correction_reason: string | null
  upstream_provider_id: string | null; upstream_provider_name: string | null
  classifier_provider_id: string | null; classifier_provider_name: string | null
  threat_knowledge_matches: unknown | null // JSONB array of {id, name, similarity}
  semantic_threshold: number | null         // threshold used for embedding search
  false_positive_candidate: boolean          // semantic matched but classifier said safe
  pipeline_trace: unknown | null            // JSONB pipeline trace
  final_decision: string | null             // SAFE / ATTACK
  blocked_stage: string | null              // 'acl' | 'keyword_regex' | 'semantic_llm' | 't2_intent' | 'output_scan'
  classification_reason: string | null      // LLM classifier's textual explanation
  t2_flagged: boolean | null
  t2_confidence: number | null
  t2_reason: string | null
  user_agent: string | null
  gateway_instance_id: string | null
  gateway_name: string | null
  raw_input_payload: string | null
  raw_output_payload: string | null
  cache_hit: boolean | null
  cache_tier: string | null
  content_quality_scanned: boolean | null
  content_quality_groundedness: number | null
  content_quality_relevance: number | null
  content_quality_hallucination: number | null
  content_quality_flagged: boolean | null
  content_quality_action: string | null
  content_quality_reason: string | null
}

function mapTrafficRow(l: ApiLog): TrafficRow {
  const ts = safeTimestamp(l.created_at)
  return {
    id:        l.request_id,
    ts:        ts,
    method:    l.method,
    path:      l.path,
    app:       l.app_id,
    appName:   l.app_name,
    model:     l.model,
    src:       l.source_ip,
    appApiKey: l.app_api_key || null,
    ms:        l.duration_ms,
    tokensIn:  l.tokens_in,
    tokensOut: l.tokens_out,
    code:      l.status_code,
    flag:      l.flagged ?? false,
    action:    l.action ?? null,
    userAgent: l.user_agent ?? null,
    threatTitle: l.threat_title ?? null,
    threat: l.flagged && l.framework_id ? {
      framework_id: l.framework_id,
      sev:        'high',
      title:      l.threat_title ?? l.framework_id,
      action:     l.action ?? 'blocked',
      excerpt:    l.excerpt ?? '',
      detector:   l.detector ?? '',
      confidence: l.confidence ?? 0,
    } : null,
    userPrompt:   l.user_prompt ?? null,
    responseBody: l.response_body ?? null,
    framework_id: l.framework_id || null,
    confidence: l.confidence ?? null,
    detector: l.detector ?? null,
    upstreamProviderId: l.upstream_provider_id ?? null,
    upstreamProviderName: l.upstream_provider_name ?? null,
    classifierProviderId: l.classifier_provider_id ?? null,
    classifierProviderName: l.classifier_provider_name ?? null,
    isClassificationCorrect: l.is_classification_correct ?? null,
    correctionReason: l.correction_reason ?? null,
    classificationReason: l.classification_reason ?? null,
    threatKnowledgeMatches: l.threat_knowledge_matches as SemanticMatch[] | null,
    semanticThreshold: l.semantic_threshold ?? null,
    falsePositiveCandidate: l.false_positive_candidate ?? false,
    pipelineTrace: l.pipeline_trace as PipelineTrace | null,
    finalDecision: l.final_decision ?? null,
    blockedStage: l.blocked_stage ?? null,
    t2Flagged: l.t2_flagged ?? null,
    t2Confidence: l.t2_confidence ?? null,
    t2Reason: l.t2_reason ?? null,
    gatewayInstanceId: l.gateway_instance_id ?? null,
    gatewayName: l.gateway_name ?? null,
    rawInputPayload: l.raw_input_payload ?? null,
    rawOutputPayload: l.raw_output_payload ?? null,
    cacheHit: l.cache_hit ?? false,
    cacheTier: l.cache_tier ?? null,
    contentQualityScanned: l.content_quality_scanned ?? false,
    contentQualityGroundedness: l.content_quality_groundedness ?? null,
    contentQualityRelevance: l.content_quality_relevance ?? null,
    contentQualityHallucination: l.content_quality_hallucination ?? null,
    contentQualityFlagged: l.content_quality_flagged ?? false,
    contentQualityAction: l.content_quality_action ?? null,
    contentQualityReason: l.content_quality_reason ?? null,
  }
}

function safeTimestamp(created_at: string | null): number {
  if (!created_at) return 0
  const d = new Date(created_at)
  return isNaN(d.getTime()) ? 0 : d.getTime()
}

function mapSeverity(l: ApiLog): 'crit' | 'high' | 'med' | 'low' {
  const conf = l.confidence
  if (conf !== null && conf !== undefined) {
    if (conf >= 0.95) return 'crit'
    if (conf >= 0.88) return 'high'
    if (conf >= 0.75) return 'med'
    return 'low'
  }
  const detector = (l.detector || '').toLowerCase()
  if (['jailbreak', 'override', 'inject'].some(k => detector.includes(k))) return 'crit'
  if (['classifier'].includes(detector)) return 'high'
  if (['pi.indirect.v3', 'pi.delim.escape'].includes(detector)) return 'med'
  const base = 'med'
  return base
}

function mapThreatEvent(l: ApiLog): ThreatEvent {
  const ts = safeTimestamp(l.created_at)
  return {
    id:         l.request_id,
    ts:         ts,
    age:        ts ? Math.floor((Date.now() - ts) / 1000) : 0,
    framework_id: l.framework_id ?? '',
    sev:        mapSeverity(l),
    title:      l.threat_title ?? l.framework_id ?? 'Threat detected',
    action:     l.action ?? 'blocked',
    excerpt:    l.excerpt ?? '',
    detector:   l.detector ?? '',
    confidence: l.confidence ?? 0,
    app:        l.app_id,
    appName:    l.app_name,
    src:        l.source_ip,
    appApiKey:  l.app_api_key,
    requestId:  l.request_id,
    durationMs: l.duration_ms,
    tokensIn:   l.tokens_in,
    tokensOut:  l.tokens_out,
    isClassificationCorrect: l.is_classification_correct ?? null,
    correctionReason: l.correction_reason ?? null,
    classificationReason: l.classification_reason ?? null,
    inboundPrompt: l.user_prompt ?? null,
    blockedStage: l.blocked_stage ?? null,
    t2Flagged: l.t2_flagged ?? null,
    t2Reason: l.t2_reason ?? null,
  }
}

export interface LogMeta { page: number; limit: number; total: number; totalPages: number }

// ── User activity log ─────────────────────────────────────────────────────────

export interface ActivityRecord {
  id: string
  user_id: string | null
  user_email: string
  activity_type: string
  details: Record<string, unknown>
  ip_address: string
  created_at: string
}

export async function getActivityLogs(params: {
  page?: number; limit?: number; activity_type?: string; user_email?: string; from?: string; to?: string
} = {}): Promise<{ rows: ActivityRecord[]; meta: LogMeta }> {
  const q = new URLSearchParams()
  if (params.page)          q.set('page',          String(params.page))
  if (params.limit)         q.set('limit',         String(params.limit))
  if (params.activity_type) q.set('activity_type', params.activity_type)
  if (params.user_email)    q.set('user_email',    params.user_email)
  if (params.from)          q.set('from',          params.from)
  if (params.to)            q.set('to',            params.to)
  const res = await apiFetch<{ data: ActivityRecord[]; meta: LogMeta }>(`/api/logs/activity?${q}`)
  return { rows: res.data, meta: res.meta }
}

export interface ActivityStats {
  total: number
  failed_logins: number
  blocked_logins: number
  unique_users: number
}

export async function getActivityStats(params: {
  activity_type?: string; user_email?: string; from?: string; to?: string
} = {}): Promise<ActivityStats> {
  const q = new URLSearchParams()
  if (params.activity_type) q.set('activity_type', params.activity_type)
  if (params.user_email)    q.set('user_email',    params.user_email)
  if (params.from)          q.set('from',          params.from)
  if (params.to)            q.set('to',            params.to)
  return apiFetch<ActivityStats>(`/api/logs/activity/stats?${q}`)
}

// ── Admin activity log ────────────────────────────────────────────────────────

export interface AdminRecord {
  id: string
  admin_id: string
  admin_email: string
  action: string
  target_type: string
  target_id: string | null
  before_state: Record<string, unknown> | null
  after_state: Record<string, unknown> | null
  ip_address: string
  created_at: string
}

export async function getAdminLogs(params: {
  page?: number; limit?: number; action?: string; admin_email?: string; target_type?: string; from?: string; to?: string
} = {}): Promise<{ rows: AdminRecord[]; meta: LogMeta }> {
  const q = new URLSearchParams()
  if (params.page)         q.set('page',         String(params.page))
  if (params.limit)        q.set('limit',        String(params.limit))
  if (params.action)       q.set('action',       params.action)
  if (params.admin_email)  q.set('admin_email',  params.admin_email)
  if (params.target_type)  q.set('target_type',  params.target_type)
  if (params.from)         q.set('from',           params.from)
  if (params.to)           q.set('to',            params.to)
  const res = await apiFetch<{ data: AdminRecord[]; meta: LogMeta }>(`/api/logs/admin?${q}`)
  return { rows: res.data, meta: res.meta }
}


export interface AdminStats {
  total: number
  destructive: number
  unique_admins: number
  top_target_type: { target_type: string; count: number } | null
}

export async function getAdminStats(params: {
  action?: string; admin_email?: string; target_type?: string; from?: string; to?: string
} = {}): Promise<AdminStats> {
  const q = new URLSearchParams()
  if (params.action)       q.set('action',       params.action)
  if (params.admin_email)  q.set('admin_email',  params.admin_email)
  if (params.target_type)  q.set('target_type',  params.target_type)
  if (params.from)         q.set('from',         params.from)
  if (params.to)           q.set('to',           params.to)
  return apiFetch<AdminStats>(`/api/logs/admin/stats?${q}`)
}

// ── Compliance audit log ──────────────────────────────────────────────────────

export interface AuditRecord {
  id: string
  actor_id: string | null
  actor_email: string
  action: string
  resource_type: string
  resource_id: string
  details: Record<string, unknown>
  ip_address: string
  created_at: string
}

export async function getAuditLogs(params: {
  page?: number; limit?: number; actor_email?: string; action?: string; resource_type?: string; from?: string; to?: string
} = {}): Promise<{ rows: AuditRecord[]; meta: LogMeta }> {
  const q = new URLSearchParams()
  if (params.page)          q.set('page',          String(params.page))
  if (params.limit)         q.set('limit',         String(params.limit))
  if (params.actor_email)   q.set('actor_email',   params.actor_email)
  if (params.action)        q.set('action',        params.action)
  if (params.resource_type) q.set('resource_type', params.resource_type)
  if (params.from)          q.set('from',          params.from)
  if (params.to)            q.set('to',            params.to)
  const res = await apiFetch<{ data: AuditRecord[]; meta: LogMeta }>(`/api/logs/audit?${q}`)
  return { rows: res.data, meta: res.meta }
}

export interface AuditStats {
  total: number
  unique_actors: number
  unique_resource_types: number
  top_action: { action: string; count: number } | null
}

export async function getAuditStats(params: {
  actor_email?: string; action?: string; resource_type?: string; from?: string; to?: string
} = {}): Promise<AuditStats> {
  const q = new URLSearchParams()
  if (params.actor_email)   q.set('actor_email',   params.actor_email)
  if (params.action)        q.set('action',        params.action)
  if (params.resource_type) q.set('resource_type', params.resource_type)
  if (params.from)          q.set('from',          params.from)
  if (params.to)            q.set('to',            params.to)
  return apiFetch<AuditStats>(`/api/logs/audit/stats?${q}`)
}

export async function getTrafficLogs(params: {
  page?: number; limit?: number; flagged?: boolean
  app_id?: string; framework_id?: string; model?: string; path?: string
  from?: string; to?: string
} = {}): Promise<{ rows: TrafficRow[]; meta: LogMeta }> {
  const q = new URLSearchParams()
  if (params.page)    q.set('page',    String(params.page))
  if (params.limit)   q.set('limit',   String(params.limit))
  if (params.flagged !== undefined) q.set('flagged', String(params.flagged))
  if (params.app_id)         q.set('app_id',         params.app_id)
  if (params.framework_id)   q.set('framework_id',    params.framework_id)
  if (params.model)          q.set('model',          params.model)
  if (params.path)           q.set('path',           params.path)
  if (params.from)           q.set('from',           params.from)
  if (params.to)             q.set('to',             params.to)
  const res = await apiFetch<{ data: ApiLog[]; meta: LogMeta }>(`/api/logs/requests?${q}`)
  return { rows: res.data.map(mapTrafficRow), meta: res.meta }
}

export interface TrafficStats {
  total: number
  blocked_flagged: number
  blocked_flagged_rate: number
  avg_duration_ms: number
  tokens_in: number
  tokens_out: number
}

export async function getTrafficStats(params: {
  flagged?: boolean; app_id?: string; framework_id?: string; model?: string; path?: string
  from?: string; to?: string
} = {}): Promise<TrafficStats> {
  const q = new URLSearchParams()
  if (params.flagged !== undefined) q.set('flagged', String(params.flagged))
  if (params.app_id)       q.set('app_id',       params.app_id)
  if (params.framework_id) q.set('framework_id', params.framework_id)
  if (params.model)        q.set('model',        params.model)
  if (params.path)         q.set('path',         params.path)
  if (params.from)         q.set('from',         params.from)
  if (params.to)           q.set('to',           params.to)
  return apiFetch<TrafficStats>(`/api/logs/requests/stats?${q}`)
}

export async function getTrafficLogByGuardrailRequestId(id: string): Promise<TrafficRow | null> {
  try {
    const q = new URLSearchParams({ guardrail_request_id: id, limit: '1' })
    const res = await apiFetch<{ data: ApiLog[]; meta: LogMeta }>(`/api/logs/requests?${q}`)
    return res.data.length > 0 ? mapTrafficRow(res.data[0]!) : null
  } catch {
    return null
  }
}

export async function getRecentTrafficLog(appId: string, from: string): Promise<TrafficRow | null> {
  try {
    const q = new URLSearchParams({ app_id: appId, from, limit: '1' })
    const res = await apiFetch<{ data: ApiLog[]; meta: LogMeta }>(`/api/logs/requests?${q}`)
    return res.data.length > 0 ? mapTrafficRow(res.data[0]!) : null
  } catch {
    return null
  }
}

export async function getThreatEvents(params: {
  page?: number; limit?: number; app_id?: string; framework_id?: string; since?: string
} = {}): Promise<{ events: ThreatEvent[]; meta: LogMeta }> {
  const q = new URLSearchParams({ flagged: 'true' })
  if (params.page)           q.set('page',           String(params.page))
  if (params.limit)          q.set('limit',          String(params.limit))
  if (params.app_id)         q.set('app_id',         params.app_id)
  if (params.framework_id)   q.set('framework_id',    params.framework_id)
  if (params.since)          q.set('from',            params.since)
  const res = await apiFetch<{ data: ApiLog[]; meta: LogMeta }>(`/api/logs/requests?${q}`)
  return { events: res.data.map(mapThreatEvent), meta: res.meta }
}

export async function setClassificationFeedback(requestId: string, correct: boolean | null, reason?: string): Promise<void> {
  await apiFetch(`/api/logs/requests/${encodeURIComponent(requestId)}/classification-feedback`, {
    method: 'PATCH',
    body: JSON.stringify({ correct, reason }),
  })
}

export async function countSimilarThreats(
  detector: string, sourceIp: string, userIdentifier: string
): Promise<{ sameDetector: number; sameSource: number; sameUser: number }> {
  const q = new URLSearchParams()
  if (detector)       q.set('detector',        detector)
  if (sourceIp)       q.set('source_ip',       sourceIp)
  if (userIdentifier) q.set('app_api_key', userIdentifier)
  return apiFetch<{ sameDetector: number; sameSource: number; sameUser: number }>(`/api/logs/similar?${q}`)
}

export async function deleteTrafficLog(id: string): Promise<void> {
  await apiFetch(`/api/logs/requests/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function bulkDeleteTrafficLogs(ids: string[]): Promise<void> {
  await apiFetch('/api/logs/requests/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
}

export async function deleteAuditLog(id: string): Promise<void> {
  await apiFetch(`/api/logs/audit/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function bulkDeleteAuditLogs(ids: string[]): Promise<void> {
  await apiFetch('/api/logs/audit/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
}

export async function deleteActivityLog(id: string): Promise<void> {
  await apiFetch(`/api/logs/activity/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function bulkDeleteActivityLogs(ids: string[]): Promise<void> {
  await apiFetch('/api/logs/activity/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
}

export async function deleteAdminLog(id: string): Promise<void> {
  await apiFetch(`/api/logs/admin/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function bulkDeleteAdminLogs(ids: string[]): Promise<void> {
  await apiFetch('/api/logs/admin/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
}

export async function deleteAuditLogsBefore(daysBack: number): Promise<number> {
  const res = await apiFetch<{ deletedCount: number }>('/api/logs/audit/delete-before', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ daysBack }),
  })
  return res.deletedCount
}

export async function deleteActivityLogsBefore(daysBack: number): Promise<number> {
  const res = await apiFetch<{ deletedCount: number }>('/api/logs/activity/delete-before', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ daysBack }),
  })
  return res.deletedCount
}

export async function deleteAdminLogsBefore(daysBack: number): Promise<number> {
  const res = await apiFetch<{ deletedCount: number }>('/api/logs/admin/delete-before', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ daysBack }),
  })
  return res.deletedCount
}

// ── Embedding logs ────────────────────────────────────────────────────────────

export interface EmbeddingLogRecord {
  id: string
  request_id: string | null
  provider_id: string
  provider_name: string
  model: string | null
  input_chars: number
  input_text: string | null
  dimensions: number | null
  success: boolean
  error_message: string | null
  duration_ms: number
  source: string
  created_at: string
}

export async function getEmbeddingLogs(params: {
  page?: number; limit?: number; provider_id?: string; success?: boolean; source?: string; from?: string; to?: string
} = {}): Promise<{ rows: EmbeddingLogRecord[]; meta: LogMeta }> {
  const q = new URLSearchParams()
  if (params.page !== undefined)    q.set('page',        String(params.page))
  if (params.limit !== undefined)   q.set('limit',       String(params.limit))
  if (params.provider_id)           q.set('provider_id', params.provider_id)
  if (params.success !== undefined) q.set('success',     String(params.success))
  if (params.source)                q.set('source',      params.source)
  if (params.from)                  q.set('from',        params.from)
  if (params.to)                    q.set('to',          params.to)
  const res = await apiFetch<{ data: EmbeddingLogRecord[]; meta: LogMeta }>(`/api/logs/embeddings?${q}`)
  return { rows: res.data, meta: res.meta }
}

export async function deleteEmbeddingLog(id: string): Promise<void> {
  await apiFetch(`/api/logs/embeddings/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function bulkDeleteEmbeddingLogs(ids: string[]): Promise<void> {
  await apiFetch('/api/logs/embeddings/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
}

export async function deleteEmbeddingLogsBefore(daysBack: number): Promise<number> {
  const res = await apiFetch<{ deletedCount: number }>('/api/logs/embeddings/delete-before', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ daysBack }),
  })
  return res.deletedCount
}

export async function deleteTrafficLogsBefore(daysBack: number): Promise<number> {
  const res = await apiFetch<{ deletedCount: number }>('/api/logs/requests/delete-before', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ daysBack }),
  })
  return res.deletedCount
}

export async function deleteAllTrafficLogs(): Promise<number> {
  const res = await apiFetch<{ deletedCount: number }>('/api/logs/requests/delete-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  return res.deletedCount
}

export async function deleteAllAuditLogs(): Promise<number> {
  const res = await apiFetch<{ deletedCount: number }>('/api/logs/audit/delete-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  return res.deletedCount
}

export async function deleteAllUserActivityLogs(): Promise<number> {
  const res = await apiFetch<{ deletedCount: number }>('/api/logs/activity/delete-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  return res.deletedCount
}

export async function deleteAllAdminActivityLogs(): Promise<number> {
  const res = await apiFetch<{ deletedCount: number }>('/api/logs/admin/delete-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  return res.deletedCount
}

export async function deleteAllEmbeddingLogs(): Promise<number> {
  const res = await apiFetch<{ deletedCount: number }>('/api/logs/embeddings/delete-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  return res.deletedCount
}

// ── Reload logs ────────────────────────────────────────────────────────────────

export interface ReloadLogRecord {
  id: string
  triggered_by: string
  key_prefix: string
  gateway_instance_id: string | null
  gateway_name: string | null
  source_ip: string
  result: string
  error_message: string | null
  duration_ms: number
  created_at: string
}

export async function getReloadLogs(params: {
  page?: number; limit?: number; result?: string; triggered_by?: string; from?: string; to?: string
} = {}): Promise<{ rows: ReloadLogRecord[]; meta: LogMeta }> {
  const q = new URLSearchParams()
  if (params.page)          q.set('page',          String(params.page))
  if (params.limit)         q.set('limit',         String(params.limit))
  if (params.result)        q.set('result',        params.result)
  if (params.triggered_by)  q.set('triggered_by',   params.triggered_by)
  if (params.from)          q.set('from',           params.from)
  if (params.to)            q.set('to',            params.to)
  const res = await apiFetch<{ data: ReloadLogRecord[]; meta: LogMeta }>(`/api/reload-logs?${q}`)
  return { rows: res.data, meta: res.meta }
}

export async function deleteReloadLog(id: string): Promise<void> {
  await apiFetch(`/api/reload-logs/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function bulkDeleteReloadLogs(ids: string[]): Promise<void> {
  await apiFetch('/api/reload-logs/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
}

export async function deleteReloadLogsBefore(daysBack: number): Promise<number> {
  const res = await apiFetch<{ deletedCount: number }>('/api/reload-logs/delete-before', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ daysBack }),
  })
  return res.deletedCount
}

export async function deleteAllReloadLogs(): Promise<number> {
  const res = await apiFetch<{ deletedCount: number }>('/api/logs/embeddings/delete-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  return res.deletedCount
}

export interface ReloadGatewayInfo {
  id: string
  name: string
  url: string
  apiKey: string | null
  keyPrefix: string | null
}

export async function getReloadGateways(): Promise<ReloadGatewayInfo[]> {
  const res = await apiFetch<{ data: ReloadGatewayInfo[] }>('/api/reload-logs/gateways')
  return res.data
}
