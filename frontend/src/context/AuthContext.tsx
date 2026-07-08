import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { login as apiLogin, logout as apiLogout, refreshToken, sendOtp as apiSendOtp, verifyOtp as apiVerifyOtp } from '../api/auth'
import { setToken } from '../api/client'
import type { AuthUser } from '../api/auth'

const GROUP_IDS = {
  admin:            '00000000-0000-0000-0000-000000000001',
  viewer:           '00000000-0000-0000-0000-000000000002',
  user:             '00000000-0000-0000-0000-000000000003',
  knowledge_admin:  '00000000-0000-0000-0000-000000000004',
}

interface AuthState {
  user: AuthUser | null
  loading: boolean
  login(username: string, password: string): Promise<void>
  logout(): Promise<void>
  isAdmin: boolean
  hasViewerOrAbove: boolean
  isUser: boolean
  isKnowledgeAdmin: boolean
  mustChangePassword: boolean
  clearMustChangePassword(): void
  otpPending: boolean
  otpPendingToken: string | null
  otpType: string | null
  sendOtp: () => Promise<string | undefined>
  verifyOtp: (code: string) => Promise<void>
  cancelOtp: () => void
}

const AuthContext = createContext<AuthState | null>(null)

function isGroupAdmin(groupId: string | null): boolean {
  return groupId === GROUP_IDS.admin
}

function hasViewerOrAbove(groupId: string | null): boolean {
  if (!groupId) return false
  return groupId === GROUP_IDS.admin || groupId === GROUP_IDS.viewer
}

function isUserRole(groupId: string | null): boolean {
  return groupId === GROUP_IDS.user
}

function isKnowledgeAdminRole(groupId: string | null): boolean {
  return groupId === GROUP_IDS.knowledge_admin
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [otpPending, setOtpPending] = useState(false)
  const [otpPendingToken, setOtpPendingToken] = useState<string | null>(null)
  const [otpType, setOtpType] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    
    async function initAuth() {
      const existingToken = localStorage.getItem('access_token')

      if (existingToken) {
        const payload = decodeJwt(existingToken)
        if (payload) {
          setUser({ id: payload.userId, username: payload.username ?? '', display_name: payload.display_name ?? payload.username ?? '', email: payload.email, groupId: payload.groupId ?? null })
          try {
            const me = await fetch('/api/auth/me', {
              headers: { 'Authorization': `Bearer ${existingToken}` },
            })
            if (!cancelled && me.ok) {
              const data = await me.json()
              setUser({
                id: data.data.id,
                username: data.data.username,
                display_name: data.data.display_name,
                email: data.data.email,
                groupId: data.data.group_id ?? null,
                must_change_password: data.data.must_change_password ?? false,
              })
            }
          } catch { /* /me failed; JWT data is sufficient */ }
        } else {
          setToken(null)
        }
      }

      if (!localStorage.getItem('access_token') && !cancelled) {
        const newToken = await refreshToken()
        if (cancelled) return
        if (!newToken) { setLoading(false); return }
        const payload = decodeJwt(newToken)
        if (!payload) { setLoading(false); return }
        setUser({ id: payload.userId, username: payload.username ?? '', display_name: payload.display_name ?? payload.username ?? '', email: payload.email, groupId: payload.groupId ?? null })
      }
      if (!cancelled) setLoading(false)
    }

    initAuth().catch(() => {
      if (!cancelled) {
        setToken(null)
        localStorage.removeItem('refresh_token')
        setLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiLogin(username, password)
    if (res.otp_required && res.otp_pending_token) {
      setOtpPending(true)
      setOtpPendingToken(res.otp_pending_token)
      setOtpType(res.otp_type ?? null)
      return
    }
    const user = {
      ...res.user!,
      password_grace_until: (res as unknown as Record<string, unknown>).password_grace_until ?? null,
    }
    setUser(user as AuthUser)
  }, [])

  const logout = useCallback(async () => {
    await apiLogout()
    setUser(null)
  }, [])

  const clearMustChangePassword = useCallback(() => {
    setUser(prev => prev ? { ...prev, must_change_password: false } : null)
  }, [])

  const sendOtp = useCallback(async () => {
    if (!otpPendingToken) throw new Error('No OTP challenge')
    const res = await apiSendOtp(otpPendingToken)
    return res.ref_code
  }, [otpPendingToken])

  const verifyOtp = useCallback(async (code: string) => {
    if (!otpPendingToken) throw new Error('No OTP challenge')
    const res = await apiVerifyOtp(otpPendingToken, code)
    const user = {
      ...res.user,
      password_grace_until: null,
    }
    setUser(user as AuthUser)
    setOtpPending(false)
    setOtpPendingToken(null)
    setOtpType(null)
  }, [otpPendingToken])

  const cancelOtp = useCallback(() => {
    setOtpPending(false)
    setOtpPendingToken(null)
    setOtpType(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin: isGroupAdmin(user?.groupId ?? null), hasViewerOrAbove: hasViewerOrAbove(user?.groupId ?? null), isUser: isUserRole(user?.groupId ?? null), isKnowledgeAdmin: isKnowledgeAdminRole(user?.groupId ?? null), mustChangePassword: user?.must_change_password ?? false, clearMustChangePassword, otpPending, otpPendingToken, otpType, sendOtp, verifyOtp, cancelOtp }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw Error('useAuth must be used within AuthProvider')
  return ctx
}

function decodeJwt(token: string): { userId: string; username?: string; display_name?: string; groupId: string | null; email: string; exp?: number } | null {
  try {
    const payload = token.split('.')[1]
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    if (decoded.exp && decoded.exp * 1000 < Date.now()) return null
    return decoded
  } catch {
    return null
  }
}
