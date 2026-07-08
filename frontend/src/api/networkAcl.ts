import { apiFetch } from './client'

export type AclListType  = 'allowlist' | 'blocklist'
export type AclEntryType = 'ip' | 'cidr' | 'host' | 'domain'

export interface AclList {
  id: string
  name: string
  description: string | null
  list_type: AclListType
  entry_count?: number | string
  created_at?: string
  updated_at?: string
}

export interface AclEntry {
  id: string
  list_id: string
  value: string
  entry_type: AclEntryType
  note: string | null
  enabled: boolean
  created_at?: string
  updated_at?: string
}

export async function getAclLists(): Promise<AclList[]> {
  const res = await apiFetch<{ data: AclList[] }>('/api/network-acl/lists')
  return res.data
}

export async function createAclList(payload: {
  name: string
  list_type: AclListType
  description?: string
}): Promise<AclList> {
  const res = await apiFetch<{ data: AclList }>('/api/network-acl/lists', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return res.data
}

export async function updateAclList(
  id: string,
  payload: { name?: string; list_type?: AclListType; description?: string | null }
): Promise<AclList> {
  const res = await apiFetch<{ data: AclList }>(`/api/network-acl/lists/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return res.data
}

export async function deleteAclList(id: string): Promise<void> {
  await apiFetch(`/api/network-acl/lists/${id}`, { method: 'DELETE' })
}

export async function getAclEntries(listId: string): Promise<AclEntry[]> {
  const res = await apiFetch<{ data: AclEntry[] }>(`/api/network-acl/lists/${listId}/entries`)
  return res.data
}

export async function createAclEntry(
  listId: string,
  payload: { value: string; entry_type: AclEntryType; note?: string; enabled?: boolean }
): Promise<AclEntry> {
  const res = await apiFetch<{ data: AclEntry }>(`/api/network-acl/lists/${listId}/entries`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return res.data
}

export async function updateAclEntry(
  listId: string,
  entryId: string,
  payload: { value?: string; entry_type?: AclEntryType; note?: string | null; enabled?: boolean }
): Promise<AclEntry> {
  const res = await apiFetch<{ data: AclEntry }>(`/api/network-acl/lists/${listId}/entries/${entryId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return res.data
}

export async function deleteAclEntry(listId: string, entryId: string): Promise<void> {
  await apiFetch(`/api/network-acl/lists/${listId}/entries/${entryId}`, { method: 'DELETE' })
}


