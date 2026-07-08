import { apiFetch } from './client'

interface ApiOrg {
  id: string
  name: string
  description: string | null
  owner_user_id: string | null
  member_count: number
  created_at: string
  updated_at: string
}

export interface UIOrg {
  id: string
  name: string
  description: string | null
  ownerUserId: string | null
  memberCount: number
  createdAt: string
  updatedAt: string
}

function mapOrg(o: ApiOrg): UIOrg {
  return {
    id:          o.id,
    name:        o.name,
    description: o.description ?? null,
    ownerUserId: o.owner_user_id,
    memberCount: o.member_count ?? 0,
    createdAt:   o.created_at?.slice(0, 10) ?? '',
    updatedAt:   o.updated_at?.slice(0, 10) ?? '',
  }
}

export async function getOrganizations(): Promise<UIOrg[]> {
  const r = await apiFetch<{ data: ApiOrg[] }>('/api/organizations')
  return r.data.map(mapOrg)
}

export async function getOrganization(id: string): Promise<UIOrg> {
  const r = await apiFetch<{ data: ApiOrg }>(`/api/organizations/${id}`)
  return mapOrg(r.data)
}

export async function createOrganization(payload: { name: string; description?: string | null; owner_user_id?: string | null }): Promise<UIOrg> {
  const r = await apiFetch<{ data: ApiOrg }>('/api/organizations', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return mapOrg(r.data)
}

export async function updateOrganization(
  id: string,
  payload: { name?: string; description?: string | null; owner_user_id?: string | null }
): Promise<UIOrg> {
  const r = await apiFetch<{ data: ApiOrg }>(`/api/organizations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return mapOrg(r.data)
}

export async function deleteOrganization(id: string): Promise<void> {
  await apiFetch(`/api/organizations/${id}`, { method: 'DELETE' })
}
