import { apiFetch } from './client'

export interface UIAdminKey {
  id: string
  name: string
  description: string | null
  prefix: string
  keyValue: string | null
  ownerUserId: string
  ownerEmail: string | null
  created: string
  status: 'active' | 'revoked'
}

interface ApiAdminKey {
  id: string
  name: string
  description?: string | null
  key_prefix: string
  key_value?: string | null
  owner_user_id: string
  owner_email?: string | null
  status: 'active' | 'revoked'
  created_at?: string
  createdAt?: string
}

function mapKey(k: ApiAdminKey): UIAdminKey {
  return {
    id:          k.id,
    name:        k.name,
    description: k.description ?? null,
    prefix:      k.key_prefix,
    keyValue:    k.key_value ?? null,
    ownerUserId: k.owner_user_id,
    ownerEmail:  k.owner_email ?? null,
    created:     (k.created_at ?? k.createdAt ?? '').slice(0, 10),
    status:      k.status,
  }
}

export async function getAdminKeys(): Promise<UIAdminKey[]> {
  const res = await apiFetch<{ data: ApiAdminKey[] }>('/api/adminkeys')
  return res.data.map(mapKey)
}

export async function createAdminKey(name: string, description?: string): Promise<{ key: UIAdminKey; full_key: string }> {
  const res = await apiFetch<{ data: ApiAdminKey & { full_key: string } }>('/api/adminkeys', {
    method: 'POST', body: JSON.stringify({ name, description }),
  })
  return { key: mapKey(res.data), full_key: res.data.full_key }
}

export async function updateAdminKey(id: string, name: string, description?: string | null): Promise<UIAdminKey> {
  const res = await apiFetch<{ data: ApiAdminKey }>(`/api/adminkeys/${id}`, {
    method: 'PATCH', body: JSON.stringify({ name, description }),
  })
  return mapKey(res.data)
}

export async function revokeAdminKey(id: string): Promise<UIAdminKey> {
  const res = await apiFetch<{ data: ApiAdminKey }>(`/api/adminkeys/${id}/revoke`, { method: 'PATCH' })
  return mapKey(res.data)
}

export async function deleteAdminKey(id: string): Promise<void> {
  await apiFetch(`/api/adminkeys/${id}`, { method: 'DELETE' })
}
