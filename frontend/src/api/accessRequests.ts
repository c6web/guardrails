import { apiFetch } from './client'

export interface SubmitAccessRequestPayload {
  full_name: string
  email: string
  company?: string
  reason?: string
  captcha_token: string
  captcha_answer: number
}

interface ApiAccessRequest {
  id: string
  full_name: string
  email: string
  company: string | null
  reason: string | null
  status: string
  admin_notes: string | null
  created_at?: string
  createdAt?: string
  updated_at?: string
  updatedAt?: string
  reviewed_by?: string | null
  reviewed_at?: string | null
}

export interface AccessRequest {
  id: string
  full_name: string
  email: string
  company: string | null
  reason: string | null
  status: string
  admin_notes: string | null
  created_at: string
  updated_at: string
}

function mapAccessRequest(r: ApiAccessRequest): AccessRequest {
  return {
    id: r.id,
    full_name: r.full_name,
    email: r.email,
    company: r.company,
    reason: r.reason,
    status: r.status,
    admin_notes: r.admin_notes,
    created_at: r.created_at ?? r.createdAt ?? '',
    updated_at: r.updated_at ?? r.updatedAt ?? '',
  }
}

export interface UpdateAccessRequestPayload {
  status?: string
  admin_notes?: string
  full_name?: string
  company?: string
  reason?: string
  send_email?: boolean
}

export interface CaptchaChallenge {
  question: string
  token: string
}

export async function fetchCaptcha(): Promise<CaptchaChallenge> {
  const res = await apiFetch<{ data: CaptchaChallenge }>('/api/captcha/challenge')
  return res.data
}

export async function submitAccessRequest(payload: SubmitAccessRequestPayload): Promise<AccessRequest> {
  const res = await apiFetch<{ data: ApiAccessRequest }>('/api/access-request', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return mapAccessRequest(res.data)
}

export async function getAccessRequests(params?: { page?: number; limit?: number; status?: string; q?: string }): Promise<{ data: AccessRequest[]; meta: any }> {
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  if (params?.status) searchParams.set('status', params.status)
  if (params?.q) searchParams.set('q', params.q)
  const qs = searchParams.toString()
  const res = await apiFetch<{ data: ApiAccessRequest[]; meta: any }>(`/api/access-request${qs ? `?${qs}` : ''}`)
  return { data: res.data.map(mapAccessRequest), meta: res.meta }
}

export async function updateAccessRequest(id: string, payload: UpdateAccessRequestPayload): Promise<AccessRequest> {
  const res = await apiFetch<{ data: ApiAccessRequest }>(`/api/access-request/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return mapAccessRequest(res.data)
}

export async function deleteAccessRequest(id: string): Promise<void> {
  await apiFetch<void>(`/api/access-request/${id}`, { method: 'DELETE' })
}
