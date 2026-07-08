import React, { createContext, useState, useEffect, useCallback, useRef } from 'react'
import { refreshToken as apiRefreshToken } from '../api/auth'
import { useAuth } from '../context/AuthContext'

const IDLE_THRESHOLD_MS = 5 * 60 * 1000 // show warning after 5 min idle
const AUTO_REFRESH_INTERVAL_MS = 12 * 60 * 1000 // auto-refresh every 12 min while active
const COUNTDOWN_SECONDS = 300 // 5 minutes countdown before auto-logout

interface SessionState {
  warningOpen: boolean
  countdownSeconds: number
  extendSession(): Promise<void>
}

const SessionContext = createContext<SessionState | null>(null)

function getTheme(): 'light' | 'dark' {
  return (document.documentElement.dataset.theme as 'light' | 'dark') || 'dark'
}

function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [warningOpen, setWarningOpen] = useState(false)
  const [countdownSeconds, setCountdownSeconds] = useState(COUNTDOWN_SECONDS)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null)
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null)
  const activeHandlerRef = useRef<(() => void) | null>(null)
  const warnStartRef = useRef<number | null>(null)
  const lastActivityRef = useRef<number>(Date.now())
  const { user, logout } = useAuth()

  function startCountdown() {
    warnStartRef.current = Date.now()
    setWarningOpen(true)
    setCountdownSeconds(COUNTDOWN_SECONDS)
    if (countdownRef.current) clearInterval(countdownRef.current)
    countdownRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - warnStartRef.current!) / 1000)
      const remaining = Math.max(0, COUNTDOWN_SECONDS - elapsed)
      setCountdownSeconds(remaining)
      if (remaining <= 0) {
        clearInterval(countdownRef.current!)
        if (logout) logout()
      }
    }, 500)
  }

  function resetIdle() {
    lastActivityRef.current = Date.now()
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => {
      startCountdown()
    }, IDLE_THRESHOLD_MS)
  }

  function scheduleAutoRefresh() {
    if (autoRefreshRef.current) clearTimeout(autoRefreshRef.current)
    autoRefreshRef.current = setTimeout(async () => {
      try {
        await apiRefreshToken()
        resetIdle()
      } catch { /* fail silently */ }
      scheduleAutoRefresh()
    }, AUTO_REFRESH_INTERVAL_MS)
  }

  const extendSession = useCallback(async () => {
    if (!user) { setWarningOpen(false); return }
    await apiRefreshToken()
    setWarningOpen(false)
    if (countdownRef.current) clearInterval(countdownRef.current)
    warnStartRef.current = null
    setCountdownSeconds(COUNTDOWN_SECONDS)
    resetIdle()
    scheduleAutoRefresh()
  }, [user])

  function trackActivity() {
    resetIdle()
  }

  // Start/stop timers based on authentication state
  useEffect(() => {
    if (!user) {
      setWarningOpen(false)
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      if (autoRefreshRef.current) clearTimeout(autoRefreshRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
      return
    }

    const events = ['mousemove', 'keydown', 'touchstart', 'scroll'] as const
    const onActivity = () => {
      if (activeHandlerRef.current) activeHandlerRef.current()
    }
    activeHandlerRef.current = trackActivity

    for (const evt of events) {
      window.addEventListener(evt, onActivity)
    }

    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return

      if (warnStartRef.current !== null) {
        const elapsed = Math.floor((Date.now() - warnStartRef.current) / 1000)
        if (elapsed >= COUNTDOWN_SECONDS) {
          setWarningOpen(false)
          if (logout) logout()
        } else {
          setCountdownSeconds(COUNTDOWN_SECONDS - elapsed)
        }
        return
      }

      const idleSeconds = Math.floor((Date.now() - lastActivityRef.current) / 1000)
      const totalThreshold = IDLE_THRESHOLD_MS / 1000 + COUNTDOWN_SECONDS
      if (idleSeconds >= totalThreshold) {
        if (logout) logout()
      } else if (idleSeconds >= IDLE_THRESHOLD_MS / 1000) {
        const warnElapsed = idleSeconds - IDLE_THRESHOLD_MS / 1000
        warnStartRef.current = Date.now() - warnElapsed * 1000
        setWarningOpen(true)
        setCountdownSeconds(COUNTDOWN_SECONDS - warnElapsed)
      } else {
        resetIdle()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    resetIdle()
    scheduleAutoRefresh()

    return () => {
      for (const evt of events) {
        window.removeEventListener(evt, onActivity)
      }
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      if (autoRefreshRef.current) clearTimeout(autoRefreshRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [user, logout])

  return (
    <SessionContext.Provider value={{ warningOpen, countdownSeconds, extendSession }}>
      {children}
      {warningOpen && (() => {
        const theme = getTheme()
        const isLight = theme === 'light'
        return (
          <div style={{ position: 'fixed', inset: 0, background: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ background: isLight ? '#fff' : '#1a1f28', borderRadius: 12, padding: 32, maxWidth: 400, width: '90%', textAlign: 'center', color: isLight ? '#111' : '#e8ebe0', boxShadow: isLight ? '0 4px 16px rgba(0,0,0,0.15)' : '0 4px 24px rgba(0,0,0,0.6)' }}>
              <h3 style={{ marginTop: 0, marginBottom: 16, color: isLight ? '#111' : '#e8ebe0' }}>Session Expiring</h3>
              <p style={{ color: isLight ? '#666' : '#a6b2ac', marginBottom: 8 }}>Your session will expire in <strong>{formatCountdown(countdownSeconds)}</strong>.</p>
              <p style={{ color: isLight ? '#999' : '#808a85', marginBottom: 24, fontSize: 13 }}>You will be logged out if you do not extend.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button onClick={extendSession} style={{ padding: '10px 20px', background: isLight ? '#3b82f6' : '#76b400', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}>
                  Extend Session
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </SessionContext.Provider>
  )
}
