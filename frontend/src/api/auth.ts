import { apiFetch, setToken } from './client'

export interface AuthUser {
  id: string
  username: string
  display_name: string
  email: string
  groupId: string | null
  groupName?: string | null
  password_grace_until?: string | null
  must_change_password?: boolean
  otp_enabled?: boolean
}

export interface LoginResponse {
  accessToken?: string
  user?: AuthUser
  otp_required?: boolean
  otp_type?: string
  otp_pending_token?: string
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await apiFetch<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  if (!res.otp_required && res.accessToken) {
    setToken(res.accessToken)
  }
  return res
}

export async function logout(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
  setToken(null)
}

export async function refreshToken(): Promise<string | null> {
  try {
    const res = await apiFetch<{ accessToken: string }>('/api/auth/refresh', {
      method: 'POST',
    })
    setToken(res.accessToken)
    return res.accessToken
  } catch {
    // Don't wipe existing token — refresh may fail transiently (CORS, network, etc.)
    return localStorage.getItem('access_token')
  }
}

export async function sendOtp(otpPendingToken: string): Promise<{ success: boolean; message?: string; ref_code?: string }> {
  return apiFetch('/api/auth/otp/send', {
    method: 'POST',
    body: JSON.stringify({ otp_pending_token: otpPendingToken }),
  })
}

export async function verifyOtp(otpPendingToken: string, code: string): Promise<{ accessToken: string; user: AuthUser }> {
  const res = await apiFetch<{ accessToken: string; user: AuthUser }>('/api/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ otp_pending_token: otpPendingToken, code }),
  })
  setToken(res.accessToken)
  return res
}
