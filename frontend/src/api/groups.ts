import { apiFetch } from './client'

export interface ApiGroup {
  id: string
  name: string
  role: string
  is_default: boolean
}

export async function getGroups(): Promise<ApiGroup[]> {
  const res = await apiFetch<{ data: ApiGroup[] }>('/api/groups')
  return res.data
}
