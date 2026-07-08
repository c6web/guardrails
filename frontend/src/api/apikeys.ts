import { apiFetch } from './client'
import { fmtAge } from '../utils/format'

export interface UIKey {
  id: string
  name: string
  prefix: string
  appId: string
  appName: string | null
  created: string
  lastUsed: string
  owner: string
  rotates: string
  status: string
}

interface ApiKey {
  id: string
  name: string
  key_prefix: string
  app_id: string
  app_name?: string | null
  owner: string
  rotation_policy: string
  last_used_at: string | null
  status: string
  created_at?: string
  createdAt?: string
}

function mapKey(k: ApiKey): UIKey {
  const createdRaw = k.created_at ?? k.createdAt ?? ''
  const lastUsedRaw = k.last_used_at ?? (k as unknown as Record<string, unknown>)['lastUsedAt'] as string | null
  return {
    id:       k.id,
    name:     k.name,
    prefix:   k.key_prefix,
    appId:    k.app_id,
    appName:  k.app_name ?? null,
    created:  createdRaw.slice(0, 10),
    lastUsed: lastUsedRaw ? fmtAge(new Date(lastUsedRaw).getTime()) : 'never',
    owner:    k.owner,
    rotates:  k.rotation_policy,
    status:   k.status,
  }
}

export async function getApiKeys(): Promise<UIKey[]> {
  const res = await apiFetch<{ data: ApiKey[] }>('/api/apikeys')
  return res.data.map(mapKey)
}

export async function getAppApiKeys(appId: string): Promise<UIKey[]> {
  const res = await apiFetch<{ data: ApiKey[] }>(`/api/apps/${appId}/apikeys`)
  return res.data.map(mapKey)
}

export async function createApiKey(payload: {
  name: string
  app_id: string
  rotation_policy: string
}): Promise<{ key: UIKey; full_key: string }> {
  const res = await apiFetch<{ data: ApiKey & { full_key: string } }>('/api/apikeys', {
    method: 'POST', body: JSON.stringify(payload),
  })
  return { key: mapKey(res.data), full_key: res.data.full_key }
}

export async function updateApiKey(id: string, payload: {
  name?: string
}): Promise<UIKey> {
  const res = await apiFetch<{ data: ApiKey }>(`/api/apikeys/${id}`, {
    method: 'PATCH', body: JSON.stringify(payload),
  })
  return mapKey(res.data)
}

export interface UIKeyVersion {
  id: string
  version: number
  prefix: string
  status: 'active' | 'superseded' | 'revoked'
  graceExpiresAt: string | null
  created: string
}

interface ApiKeyVersion {
  id: string
  api_key_id: string
  key_prefix: string
  version: number
  status: 'active' | 'superseded' | 'revoked'
  grace_expires_at: string | null
  created_at?: string
  createdAt?: string
}

function mapVersion(v: ApiKeyVersion): UIKeyVersion {
  const createdRaw = v.created_at ?? v.createdAt ?? ''
  return {
    id:             v.id,
    version:        v.version,
    prefix:         v.key_prefix,
    status:         v.status,
    graceExpiresAt: v.grace_expires_at,
    created:        createdRaw.slice(0, 10),
  }
}

export async function getApiKeyVersions(id: string): Promise<{ versions: UIKeyVersion[]; graceHours: number }> {
  const res = await apiFetch<{ data: ApiKeyVersion[]; grace_hours: number }>(`/api/apikeys/${id}/versions`)
  return { versions: res.data.map(mapVersion), graceHours: res.grace_hours }
}

export async function revokeKeyVersion(keyId: string, versionId: string): Promise<UIKeyVersion> {
  const res = await apiFetch<{ data: ApiKeyVersion }>(`/api/apikeys/${keyId}/versions/${versionId}`, { method: 'DELETE' })
  return mapVersion(res.data)
}

export async function rotateApiKey(id: string): Promise<{ key: UIKey; full_key: string; graceHours: number }> {
  const res = await apiFetch<{ data: ApiKey & { full_key: string }; grace_hours: number }>(`/api/apikeys/${id}/rotate`, { method: 'POST' })
  return { key: mapKey(res.data), full_key: res.data.full_key, graceHours: res.grace_hours }
}

export async function revokeApiKey(id: string): Promise<UIKey> {
  const res = await apiFetch<{ data: ApiKey }>(`/api/apikeys/${id}/revoke`, { method: 'PATCH' })
  return mapKey(res.data)
}

export async function deleteApiKey(id: string): Promise<void> {
  await apiFetch(`/api/apikeys/${id}`, { method: 'DELETE' })
}

export async function revealApiKey(id: string): Promise<{ full_key: string; key_prefix: string; name: string }> {
  const res = await apiFetch<{ data: { full_key: string; key_prefix: string; name: string } }>(`/api/apikeys/${id}/reveal`)
  return res.data
}


