import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTweaks } from '../hooks/useTweaks'
import type { TweakValues } from '../types'
import { ShieldCheck, Eye, EyeOff, Moon, Sun, Bolt, Layers } from '../components/ui/Icons'

const TWEAK_DEFAULTS: TweakValues = {
  theme: 'dark',
  density: 'default',
  accent: '#76B400',
  overviewLayout: 'default',
  tickerFlow: true,
}

const BUILD_TYPE = import.meta.env.VITE_BUILD_TYPE ?? ''

export default function LoginPage() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS)
  const navigate = useNavigate()
  const { login, user, otpPending, otpType, sendOtp, verifyOtp, cancelOtp } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpError, setOtpError] = useState('')
  const [otpBusy, setOtpBusy] = useState(false)
  const [otpRefCode, setOtpRefCode] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)

  useEffect(() => {
    if (resendCooldown <= 0) return
    const id = setInterval(() => setResendCooldown(c => c - 1), 1000)
    return () => clearInterval(id)
  }, [resendCooldown])

  // Sync theme from tweaks to document (useTweaks does this for AppShell pages,
  // but LoginPage sits outside AppShell so it needs its own effect)
  useEffect(() => {
    document.documentElement.dataset.theme = tweaks.theme
  }, [tweaks.theme])

  const isLight = tweaks.theme === 'light'

  function toggleTheme() {
    setTweak('theme', tweaks.theme === 'dark' ? 'light' : 'dark')
  }

  useEffect(() => {
    if (otpPending && !otpSent) {
      handleSendOtp()
    }
  }, [otpPending])

  // Redirect after login if must_change_password is set
  useEffect(() => {
    if (user && user.must_change_password) {
      navigate('/force-password-change', { replace: true })
    } else if (user && !otpPending) {
      navigate('/')
    }
  }, [user, navigate, otpPending])

  async function handleSendOtp() {
    setOtpError('')
    setOtpBusy(true)
    try {
      const ref = await sendOtp()
      if (ref) setOtpRefCode(ref)
      setOtpSent(true)
      setResendCooldown(30)
    } catch (err) {
      setOtpError((err as Error).message || 'Failed to send OTP')
    } finally {
      setOtpBusy(false)
    }
  }

  async function handleVerifyOtp() {
    if (!otpCode || otpCode.length !== 6) {
      setOtpError('Please enter the 6-digit code')
      return
    }
    setOtpError('')
    setOtpBusy(true)
    try {
      await verifyOtp(otpCode)
    } catch (err) {
      setOtpError((err as Error).message || 'Invalid or expired code')
      setOtpBusy(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(username, password)
    } catch (err) {
      setError((err as Error).message || 'Login failed')
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
            <svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 1024 1024" style={{ flexShrink: 0 }}>
              <rect x="110" y="110" width="804" height="804" rx="180" ry="180" fill="none" stroke="#7bb307" strokeWidth="30"/>
              <g transform="translate(0.000000,1024.000000) scale(0.100000,-0.100000)" fill="#7bb307" stroke="none">
                <path d="M4410 7064 c-452 -43 -767 -179 -1035 -448 -122 -122 -209 -237 -278
-366 -45 -84 -64 -129 -285 -660 -100 -238 -164 -392 -324 -775 -28 -66 -88
-209 -134 -317 -104 -245 -146 -367 -175 -498 -76 -356 72 -656 379 -767 162
-59 93 -56 1400 -60 1332 -5 1270 -8 1140 58 -278 140 -445 377 -489 693 l-12
86 -639 0 c-691 0 -677 -1 -728 55 -21 23 -25 36 -25 93 0 63 7 84 122 357 66
160 154 369 193 465 64 156 99 239 237 570 105 251 187 440 208 476 30 51 100
116 157 145 105 54 86 53 889 56 l745 4 154 162 c84 89 196 207 249 262 296
306 361 376 361 389 0 8 -15 16 -37 20 -38 6 -2007 6 -2073 0z"/>
                <path d="M7053 7063 c-40 -4 -50 -13 -230 -206 -103 -111 -303 -323 -443 -472
-980 -1036 -1079 -1147 -1258 -1401 -391 -556 -452 -1166 -149 -1490 220 -236
584 -347 1028 -315 746 55 1379 509 1652 1187 138 342 149 664 30 904 -81 162
-252 291 -468 352 -85 24 -326 33 -422 15 -36 -6 -43 -5 -43 9 0 8 88 109 196
222 109 114 339 358 513 542 173 184 377 399 454 478 87 90 137 150 135 160
-3 16 -41 17 -478 18 -261 0 -494 -1 -517 -3z m-432 -2149 c59 -28 115 -78
140 -126 85 -166 -37 -504 -239 -663 -126 -101 -277 -155 -427 -155 -304 0
-420 189 -304 493 72 187 225 355 387 425 130 55 349 68 443 26z"/>
              </g>
            </svg>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: '#E6ECF4', lineHeight: 1.2 }}>
              Guardrails
              <div className="hide-mobile" style={{ fontSize: 13, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(168,181,200,0.7)', marginTop: 2 }}>
                GenAI Firewall Gateway
              </div>
            </div>
          </div>
          <div className="login-left-tagline">
            <h2 style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em', color: '#E6ECF4', margin: '0 0 10px', lineHeight: 1.15 }}>
              Intelligent Protection for<br />Generative AI Traffic
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(168,181,200,0.85)', margin: 0, lineHeight: 1.6 }}>
              Secure your AI applications with real-time threat detection, policy enforcement, and OWASP LLM Top 10 compliance.
            </p>
          </div>
          <div className="login-features">
            <div className="login-feature">
              <div className="login-feature-icon"><ShieldCheck w={15} /></div>
              <span>OWASP LLM Top 10 Protection</span>
            </div>
            <div className="login-feature">
              <div className="login-feature-icon"><Bolt w={15} /></div>
              <span>Real-time Threat Detection</span>
            </div>
            <div className="login-feature">
              <div className="login-feature-icon"><Layers w={15} /></div>
              <span>Prompt Classification &amp; Filtering</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - 40% */}
      <div className="login-right">
        <div className="login-right-stack">
        <div className="card" style={{ width: 'min(420px, 90vw)', padding: '36px 32px', borderTop: '3px solid var(--gaf-green)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 1024 1024" style={{ flexShrink: 0 }}>
               <rect x="110" y="110" width="804" height="804" rx="180" ry="180" fill="none" stroke="#7bb307" strokeWidth="30"/>
               <g transform="translate(0.000000,1024.000000) scale(0.100000,-0.100000)" fill="#7bb307" stroke="none">
                 <path d="M4410 7064 c-452 -43 -767 -179 -1035 -448 -122 -122 -209 -237 -278
-366 -45 -84 -64 -129 -285 -660 -100 -238 -164 -392 -324 -775 -28 -66 -88
-209 -134 -317 -104 -245 -146 -367 -175 -498 -76 -356 72 -656 379 -767 162
-59 93 -56 1400 -60 1332 -5 1270 -8 1140 58 -278 140 -445 377 -489 693 l-12
86 -639 0 c-691 0 -677 -1 -728 55 -21 23 -25 36 -25 93 0 63 7 84 122 357 66
160 154 369 193 465 64 156 99 239 237 570 105 251 187 440 208 476 30 51 100
116 157 145 105 54 86 53 889 56 l745 4 154 162 c84 89 196 207 249 262 296
306 361 376 361 389 0 8 -15 16 -37 20 -38 6 -2007 6 -2073 0z"/>
                 <path d="M7053 7063 c-40 -4 -50 -13 -230 -206 -103 -111 -303 -323 -443 -472
-980 -1036 -1079 -1147 -1258 -1401 -391 -556 -452 -1166 -149 -1490 220 -236
584 -347 1028 -315 746 55 1379 509 1652 1187 138 342 149 664 30 904 -81 162
-252 291 -468 352 -85 24 -326 33 -422 15 -36 -6 -43 -5 -43 9 0 8 88 109 196
222 109 114 339 358 513 542 173 184 377 399 454 478 87 90 137 150 135 160
-3 16 -41 17 -478 18 -261 0 -494 -1 -517 -3z m-432 -2149 c59 -28 115 -78
140 -126 85 -166 -37 -504 -239 -663 -126 -101 -277 -155 -427 -155 -304 0
-420 189 -304 493 72 187 225 355 387 425 130 55 349 68 443 26z"/>
                </g>
              </svg>
               <div>
               <div style={{ fontFamily: 'var(--font-ui)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                 Guardrails
                  <div className="hide-mobile" style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-tertiary)', marginTop: 2 }}>
                    GenAI Firewall Gateway
                  </div>
               </div>
              </div>
            </div>
            <button onClick={toggleTheme} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center' }} title="Toggle theme">
              {isLight ? <Sun w={18} /> : <Moon w={18} />}
            </button>
          </div>

          {otpPending ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ textAlign: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 13, color: 'var(--fg-secondary)', marginBottom: 4 }}>
                  {otpType === 'email' ? 'Email verification' : 'Two-factor authentication'}
                </div>
                <div style={{ fontSize: 20, fontWeight: 600 }}>
                  {otpSent ? 'Code sent!' : 'Sending code\u2026'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 4 }}>
                  {otpType === 'email' ? 'Check your email for the one-time code' : ''}
                </div>
                {otpRefCode && otpType === 'email' && (
                  <div style={{ marginTop: 12, fontSize: 11, color: 'var(--fg-tertiary)' }}>
                    Reference: <span className="mono" style={{ fontSize: 12, letterSpacing: 2, color: 'var(--fg-secondary)' }}>{otpRefCode}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="label" style={{ display: 'block', marginBottom: 4 }}>One-time code</label>
                <input
                  className="input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  autoFocus
                  style={{ width: '100%', boxSizing: 'border-box', textAlign: 'center', fontSize: 20, letterSpacing: 8 }}
                  onKeyDown={e => { if (e.key === 'Enter') handleVerifyOtp() }}
                />
              </div>

              {otpError && (
                <div style={{ fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', padding: '8px 10px', borderRadius: 4 }}>
                  {otpError}
                </div>
              )}

              <button
                className="btn btn-primary"
                onClick={handleVerifyOtp}
                disabled={otpBusy || otpCode.length !== 6}
                style={{ justifyContent: 'center' }}
              >
                {otpBusy ? 'Verifying\u2026' : 'Verify code'}
              </button>

              <button
                className="btn btn-outline"
                onClick={handleSendOtp}
                disabled={otpBusy || resendCooldown > 0}
                style={{ justifyContent: 'center' }}
              >
                {otpBusy ? 'Sending\u2026' : resendCooldown > 0 ? `Re-send code (${resendCooldown}s)` : 'Re-send code'}
              </button>

              <button
                className="btn btn-ghost"
                onClick={() => { cancelOtp(); setOtpSent(false); setOtpCode(''); setOtpError(''); setOtpRefCode(''); setResendCooldown(0) }}
                style={{ justifyContent: 'center' }}
              >
                Back to sign in
              </button>
              <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', textAlign: 'center', marginTop: -4 }}>
                Can't access your email? Contact your administrator to disable two-factor authentication.
              </div>
            </div>
          ) : (
            <><form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="label" style={{ display: 'block', marginBottom: 4 }}>Username</label>
                <input
                  className="input"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  required
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label className="label" style={{ display: 'block', marginBottom: 4 }}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
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
                {busy ? 'Signing in\u2026' : 'Sign in'}
              </button>
            </form>
            <div style={{ textAlign: 'center', marginTop: 12, fontSize: 13, color: 'var(--fg-tertiary)' }}>
              Don't have an account?{' '}
              <Link to="/request-access" style={{ color: 'var(--gaf-green)' }}>
                Request access
              </Link>
            </div>
          </>)}
        </div>
        {BUILD_TYPE === 'demo' ? (
          <div className="login-build-banner demo-build">
            <span aria-hidden="true">⚠</span> Demo Build — for testing &amp; evaluation only, not for production use
          </div>
        ) : BUILD_TYPE === 'development' ? (
          <div className="login-build-banner dev-build">
            <span aria-hidden="true">⚙</span> Development Build
          </div>
        ) : null}
        </div>
      </div>
    </div>
  )
}
