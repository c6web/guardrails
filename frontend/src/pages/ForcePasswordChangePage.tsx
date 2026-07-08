import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTweaks } from '../hooks/useTweaks'
import type { TweakValues } from '../types'
import { Eye, EyeOff, Moon, Sun } from '../components/ui/Icons'

const TWEAK_DEFAULTS: TweakValues = {
  theme: 'dark',
  density: 'default',
  accent: '#76B400',
  overviewLayout: 'default',
  tickerFlow: true,
}

export default function ForcePasswordChangePage() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS)
  const navigate = useNavigate()
  const { clearMustChangePassword } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = tweaks.theme
  }, [tweaks.theme])

  const isLight = tweaks.theme === 'light'

  function toggleTheme() {
    setTweak('theme', tweaks.theme === 'dark' ? 'light' : 'dark')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (newPassword !== confirmPassword) {
        setError('Passwords do not match')
        setBusy(false)
        return
      }
      const token = localStorage.getItem('access_token')
      const res = await fetch('/api/auth/force-password-change', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ new_password: newPassword }),
      })

      if (res.ok) {
        clearMustChangePassword()
        navigate('/')
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to set password')
        setBusy(false)
      }
    } catch {
      setError('Network error. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      {/* Left Panel - 60% */}
      <div className="login-left">
        <div className="login-left-bg" />
        <div className="login-left-content">
          <div className="login-left-logo">
            <img src="/logo.svg" alt="Guardrails" style={{ width: 32, height: 32, flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 32, letterSpacing: '-0.02em', color: '#E6ECF4' }}>
              Guardrails
            </span>
          </div>
          <div className="login-left-tagline">
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26, letterSpacing: '-0.015em', color: '#E6ECF4', margin: '0 0 10px', lineHeight: 1.2 }}>
              Secure Your Account<br />Set a Strong Password
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(168,181,200,0.85)', margin: 0, lineHeight: 1.6 }}>
              For your security, you must set a new password before accessing the management console.
            </p>
          </div>
        </div>
      </div>

      {/* Right Panel - 40% */}
      <div className="login-right">
        <div className="card" style={{ width: 'min(420px, 90vw)', padding: '36px 32px', borderTop: '2px solid var(--accent)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '-0.01em', marginBottom: 4 }}>
                Change Your Password
              </div>
              <div className="caption" style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>
                Required — password change requested by administrator
              </div>
            </div>
            <button onClick={toggleTheme} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center' }} title="Toggle theme">
              {isLight ? <Sun w={18} /> : <Moon w={18} />}
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="label" style={{ display: 'block', marginBottom: 4 }}>New Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  style={{ width: '100%', boxSizing: 'border-box', paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    padding: 4,
                    cursor: 'pointer',
                    color: 'var(--fg-secondary)',
                  }}
                >
                  {showPassword ? <EyeOff w={18} /> : <Eye w={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="label" style={{ display: 'block', marginBottom: 4 }}>Confirm Password</label>
              <input
                className="input"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            {error && (
              <div style={{ fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', padding: '8px 10px', borderRadius: 4 }}>
                {error}
              </div>
            )}

            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy}
              style={{ marginTop: 4, justifyContent: 'center' }}
            >
              {busy ? 'Setting password…' : 'Set Password & Continue'}
            </button>
          </form>

          <div style={{ marginTop: '20px', padding: '14px 16px', background: 'var(--bg-muted)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.5' }}>
              💡 Your password should include a mix of letters, numbers, and symbols for best security.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
