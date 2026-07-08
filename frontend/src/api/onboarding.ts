import { apiFetch } from './client'

export interface ChecklistItem {
  id: string
  label: string
  status: 'done' | 'warning' | 'missing'
  message: string
  action_url?: string
}

interface ChecklistResponse {
  data: ChecklistItem[]
}

export async function getChecklist(): Promise<ChecklistItem[]> {
  const res = await apiFetch<ChecklistResponse>('/api/onboarding/checklist')
  return res.data
}
