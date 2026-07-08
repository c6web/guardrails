import { apiFetch } from './client'
import type { PipelineTrace } from '../types'

interface ApiGatewayInstance {
  id: string
  name: string
  description: string | null
  location: string | null
  url: string
  has_active_key?: boolean
  active_key_prefix?: string | null
  active_key_version?: number | null
  acl_list_id: string | null
  default_firewall_mode?: 'allow_all' | 'block_all'
  created_at?: string
  updated_at?: string
  createdAt?: string
  updatedAt?: string
}

export interface GatewayInstance {
  id: string
  name: string
  description: string | null
  location: string | null
  url: string
  hasActiveKey: boolean
  activeKeyPrefix: string | null
  activeKeyVersion: number | null
  aclListId: string | null
  acl_list?: AclListData | null
  defaultFirewallMode?: 'allow_all' | 'block_all'
  createdAt: string
  updatedAt: string
}

export interface GatewayHealth {
  id: string
  status: 'up' | 'down'
  latency_ms: number
  checked_at: string
  health_status?: string | null
  health_timestamp?: string | null
  cache_loaded_at?: string | null
  cache_next_reload_at?: string | null
  cache_next_reload_in?: string | null
  data_db?: boolean | null
  log_db?: boolean | null
}

interface AclListData {
  id: string
  name: string
  list_type: 'allowlist' | 'blocklist'
  entry_count: number
}

interface AclEntryData {
  id: string
  value: string
  entry_type: 'ip' | 'cidr' | 'host' | 'domain'
  enabled: boolean
  note?: string | null
}

export interface GatewayAclData {
  list: AclListData
  entries: AclEntryData[]
}

// ── Gateway API key types ──────────────────────────────────────────────────

type GatewayKeyStatus = 'active' | 'superseded' | 'revoked'

export interface GatewayApiKeyVersion {
  id: string
  key_prefix: string
  version: number
  status: GatewayKeyStatus
  grace_expires_at: string | null
  created_at: string
}

export interface GatewayApiKeyRevealed extends GatewayApiKeyVersion {
  full_key: string
}

export interface GatewayApiKeyGenerated {
  id: string
  key_prefix: string
  version: number
  status: 'active'
  full_key: string
  created_at: string
}

function mapInstance(g: ApiGatewayInstance): GatewayInstance {
  return {
    id: g.id, name: g.name, description: g.description, location: g.location,
    url: g.url,
    hasActiveKey: g.has_active_key ?? false,
    activeKeyPrefix: g.active_key_prefix ?? null,
    activeKeyVersion: g.active_key_version ?? null,
    aclListId: g.acl_list_id,
    defaultFirewallMode: g.default_firewall_mode ?? 'allow_all',
    createdAt: g.created_at ?? g.createdAt ?? '', updatedAt: g.updated_at ?? g.updatedAt ?? '',
  }
}

export async function getGateways(): Promise<GatewayInstance[]> {
  const res = await apiFetch<{ data: ApiGatewayInstance[] }>('/api/gateways')
  return res.data.map(mapInstance)
}

export async function createGateway(payload: {
  name: string; description?: string | null; location?: string | null; url: string; acl_list_id?: string | null; default_firewall_mode?: string
}): Promise<GatewayInstance> {
  const res = await apiFetch<{ data: ApiGatewayInstance }>('/api/gateways', {
    method: 'POST', body: JSON.stringify(payload),
  })
  return mapInstance(res.data)
}

export async function updateGateway(id: string, payload: {
  name?: string; description?: string | null; location?: string | null; url?: string; acl_list_id?: string | null; default_firewall_mode?: string
}): Promise<GatewayInstance> {
  const res = await apiFetch<{ data: ApiGatewayInstance }>(`/api/gateways/${id}`, {
    method: 'PATCH', body: JSON.stringify(payload),
  })
  return mapInstance(res.data)
}

export async function deleteGateway(id: string): Promise<void> {
  await apiFetch(`/api/gateways/${id}`, { method: 'DELETE' })
}

export async function checkGatewayHealth(instance: GatewayInstance): Promise<GatewayHealth> {
  const start = performance.now()
  try {
    const resp = await fetch(`${instance.url}/health`, {
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    })
    const latency_ms = Math.round(performance.now() - start)
    let body: Record<string, unknown> | null = null
    if (resp.ok) {
      try { body = await resp.json() } catch {}
    }
    return {
      id: instance.id, status: resp.ok ? 'up' : 'down', latency_ms,
      checked_at: new Date().toISOString(),
      health_status: body?.status as string ?? null,
      health_timestamp: body?.timestamp as string ?? null,
      cache_loaded_at: body?.cache_loaded_at as string ?? null,
      cache_next_reload_at: body?.cache_next_reload_at as string ?? null,
      cache_next_reload_in: body?.cache_next_reload_in as string ?? null,
      data_db: typeof body?.data_db === 'boolean' ? (body.data_db as boolean) : null,
      log_db: typeof body?.log_db === 'boolean' ? (body.log_db as boolean) : null,
    }
  } catch {
    return { id: instance.id, status: 'down', latency_ms: Math.round(performance.now() - start), checked_at: new Date().toISOString() }
  }
}

export interface GatewayTestResult {
  success: boolean
  latency_ms: number
  response?: string
  error?: string
  guardrailRequestId?: string
}

export async function fetchEngineInstanceId(url: string, apiKey: string): Promise<string | null> {
  try {
    const resp = await fetch(`${url.replace(/\/+$/, '')}/id`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(3000),
    })
    if (!resp.ok) return null
    const body = await resp.json()
    return body?.instance_id ?? null
  } catch {
    return null
  }
}

export async function testGateway(instance: GatewayInstance, prompt: string, maxTokens = 4096, apiKey?: string): Promise<GatewayTestResult> {
  const start = performance.now()
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    const resp = await fetch(`${instance.url}/v1/chat/completions`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(300000),
      body: JSON.stringify({
        // The gateway overrides this with the app's configured provider model;
        // the value here is irrelevant once a provider is bound.
        model: 'gateway-test',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
      }),
    })
    const latency_ms = Math.round(performance.now() - start)
    const json = await resp.json()
    if (!resp.ok) return { success: false, latency_ms, error: json?.error?.message ?? json?.error ?? `HTTP ${resp.status}`, guardrailRequestId: json?.error?.request_id ?? undefined }
    const text: string = json?.choices?.[0]?.message?.content ?? JSON.stringify(json)
    return { success: true, latency_ms, response: text }
  } catch (err) {
    return { success: false, latency_ms: Math.round(performance.now() - start), error: (err as Error).message || 'Request failed' }
  }
}

interface ScanSemanticMatch {
  id: string
  name: string
  similarity: number
}

export interface GatewayScanResult {
  success: boolean // true if the call itself succeeded, independent of the firewall verdict
  latency_ms: number
  verdict?: 'allow' | 'block'
  final_decision?: string
  blocked_stage?: string | null
  detector?: string | null
  framework_id?: string | null
  confidence?: number | null
  reason?: string
  semantic_matches?: ScanSemanticMatch[]
  trace?: PipelineTrace
  request_id?: string
  duration_ms?: number
  error?: string
}

export async function testGatewayScan(instance: GatewayInstance, input: string, apiKey?: string): Promise<GatewayScanResult> {
  const start = performance.now()
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    const resp = await fetch(`${instance.url}/v1/scan`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(300000),
      body: JSON.stringify({ input }),
    })
    const latency_ms = Math.round(performance.now() - start)
    const json = await resp.json()
    if (!resp.ok) return { success: false, latency_ms, error: json?.error?.message ?? json?.error ?? `HTTP ${resp.status}` }
    return {
      success: true,
      latency_ms,
      verdict: json?.verdict,
      final_decision: json?.final_decision,
      blocked_stage: json?.blocked_stage ?? null,
      detector: json?.detector ?? null,
      framework_id: json?.framework_id ?? null,
      confidence: json?.confidence ?? null,
      reason: json?.reason,
      semantic_matches: json?.semantic_matches ?? [],
      trace: json?.trace,
      request_id: json?.request_id,
      duration_ms: json?.duration_ms,
    }
  } catch (err) {
    return { success: false, latency_ms: Math.round(performance.now() - start), error: (err as Error).message || 'Request failed' }
  }
}

export interface GatewayReloadResult {
  success: boolean
  message: string
  error?: string
  retry_after?: number
  gateway?: string
  gateway_url?: string
  key_prefix?: string
  timestamp?: string
}

export async function reloadGatewayDirect(
  instance: GatewayInstance,
  apiKey: string,
  signal?: AbortSignal
): Promise<GatewayReloadResult> {
  try {
    const resp = await fetch(`${instance.url}/reload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: signal ?? AbortSignal.timeout(10000),
    })
    if (resp.ok) {
      return {
        success: true,
        message: 'Cache reload triggered',
        gateway: instance.name,
        gateway_url: instance.url,
        key_prefix: apiKey.slice(0, 12) + '…',
        timestamp: new Date().toISOString(),
      }
    }
    if (resp.status === 429) {
      return { success: false, message: 'Reload rate limited', error: 'Too many reload requests', retry_after: 30 }
    }
    return { success: false, message: 'Reload failed', error: `Gateway returned ${resp.status}` }
  } catch (err) {
    return { success: false, message: 'Gateway unreachable', error: (err as Error).message || 'Request failed' }
  }
}

// ── Gateway API Key management ────────────────────────────────────────────

export async function listGatewayApiKeys(gatewayId: string): Promise<GatewayApiKeyVersion[]> {
  const res = await apiFetch<{ data: GatewayApiKeyVersion[] }>(`/api/gateways/${gatewayId}/apikey`)
  return res.data
}

export async function generateGatewayApiKey(gatewayId: string): Promise<GatewayApiKeyGenerated> {
  const res = await apiFetch<{ data: GatewayApiKeyGenerated }>(`/api/gateways/${gatewayId}/apikey`, {
    method: 'POST',
  })
  return res.data
}

export async function revealGatewayApiKeys(gatewayId: string): Promise<GatewayApiKeyRevealed[]> {
  const res = await apiFetch<{ data: GatewayApiKeyRevealed[] }>(`/api/gateways/${gatewayId}/apikey/reveal`)
  return res.data
}

export async function revokeGatewayApiKeyVersion(gatewayId: string, versionId: string): Promise<void> {
  await apiFetch(`/api/gateways/${gatewayId}/apikey/${versionId}`, { method: 'DELETE' })
}

export async function deleteGatewayApiKeyVersion(gatewayId: string, versionId: string): Promise<void> {
  await apiFetch(`/api/gateways/${gatewayId}/apikey/${versionId}?permanent=true`, { method: 'DELETE' })
}
