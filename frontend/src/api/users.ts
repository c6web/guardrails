import { apiFetch } from './client'
import { fmtAgeFromIso } from '../utils/format'

export interface UIUser {
  id: string
  displayName: string
  username: string
  email: string
  groupId: string | null
  groupName: string
  team: string
  lastSeen: string
  status: string
  rawStatus: string  // DB value
  otpEnabled: boolean | null
  passwordChangedAt: string | null
  mustChangePassword: boolean
  passwordGraceUntil: string | null
  organizationId: string | null
}

interface ApiUser {
  id: string
  username: string
  display_name: string
  email: string
  group_id: string | null
  group_name?: string | null
  team: string | null
  otp_enabled: boolean | null
  otp_verified_at: string | null
  status: string
  last_seen_at: string | null
  password_changed_at: string | null
  must_change_password: boolean
  password_grace_until: string | null
  organization_id: string | null
}

export const GROUP_LABELS: Record<string, string> = {
  '00000000-0000-0000-0000-000000000001': 'Administrators',
  '00000000-0000-0000-0000-000000000002': 'Viewers',
  '00000000-0000-0000-0000-000000000003': 'Users',
  '00000000-0000-0000-0000-000000000004': 'Knowledge Admins',
}

function mapUser(u: ApiUser): UIUser {
  return {
    id:         u.id,
    username:   u.username,
    displayName: u.display_name,
    email:      u.email,
    groupId:    u.group_id,
    groupName:  u.group_id ? (GROUP_LABELS[u.group_id] ?? u.group_name) ?? 'Unassigned' : 'Unassigned',
    team:       u.team ?? '—',
    lastSeen:   u.last_seen_at ? fmtAgeFromIso(u.last_seen_at) : 'never',
    status:     u.status,
    rawStatus:  u.status,
    otpEnabled: u.otp_enabled,
    passwordChangedAt: u.password_changed_at,
    mustChangePassword: u.must_change_password,
    passwordGraceUntil: u.password_grace_until,
    organizationId: u.organization_id ?? null,
  }
}

export async function getUsers(): Promise<UIUser[]> {
  const res = await apiFetch<{ data: ApiUser[] }>('/api/users?limit=100')
  return res.data.map(mapUser)
}

export interface CreateUserPayload {
  username: string
  email: string
  password: string
  display_name?: string
  group_id: string
  team?: string
  create_first_app?: boolean
}

export interface UpdateUserPayload {
  display_name?: string
  email?: string
  team?: string
  group_id?: string
  status?: string
  otp_enabled?: boolean
  password?: string
  must_change_password?: boolean
  organization_id?: string | null
}

export async function createUser(payload: CreateUserPayload): Promise<UIUser> {
  const res = await apiFetch<{ data: ApiUser }>('/api/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return mapUser(res.data)
}

export async function updateUser(id: string, payload: UpdateUserPayload): Promise<UIUser> {
  const res = await apiFetch<{ data: ApiUser }>(`/api/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return mapUser(res.data)
}

export async function deleteUser(id: string): Promise<void> {
  await apiFetch(`/api/users/${id}`, { method: 'DELETE' })
}

export async function changePassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
  await apiFetch(`/api/users/${id}/change-password`, {
    method: 'POST',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })
}


