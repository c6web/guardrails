import { apiFetch } from './client'

export interface SidebarCounts {
  threats: number
  policies: number
  detectors: number
  apps: number
  users: number
}

export async function getSidebarCounts(): Promise<SidebarCounts> {
  const res = await apiFetch<SidebarCounts>('/api/sidebar-counts')
  return res
}
