import { apiFetch } from './client'

export interface PasswordPolicy {
  id: number
  max_age_days: number | null
  grace_period_days: number
  min_length: number
  require_uppercase: boolean
  require_lowercase: boolean
  require_numbers: boolean
  require_symbols: boolean
}

export async function getPasswordPolicy(): Promise<PasswordPolicy> {
  const res = await apiFetch<{ data: PasswordPolicy }>('/api/password-policy')
  return res.data
}

export async function updatePasswordPolicy(payload: Partial<PasswordPolicy>): Promise<PasswordPolicy> {
  const res = await apiFetch<{ data: PasswordPolicy }>('/api/password-policy', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return res.data
}
