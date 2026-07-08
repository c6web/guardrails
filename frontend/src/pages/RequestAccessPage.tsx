import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useTweaks } from '../hooks/useTweaks'
import { fetchCaptcha, submitAccessRequest } from '../api/accessRequests'
import type { TweakValues } from '../types'
import { Moon, Sun, ShieldCheck, Bolt, Layers } from '../components/ui/Icons'

const TWEAK_DEFAULTS: TweakValues = {
  theme: 'dark',
  density: 'default',
  accent: '#76B400',
  overviewLayout: 'default',
  tickerFlow: true,
}

type PageState = 'form' | 'loading' | 'success' | 'duplicate'

export default function RequestAccessPage() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [reason, setReason] = useState('')
  const [captchaQuestion, setCaptchaQuestion] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pageState, setPageState] = useState<PageState>('form')
  const [busy, setBusy] = useState(false)
  const [duplicateMsg, setDuplicateMsg] = useState('')

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const isLight = tweaks.theme === 'light'

  useEffect(() => {
    document.documentElement.dataset.theme = tweaks.theme
  }, [tweaks.theme])

  const loadCaptcha = useCallback(async () => {
    try {
      const { question, token } = await fetchCaptcha()
      setCaptchaQuestion(question)
      setCaptchaToken(token)
    } catch {
      setCaptchaQuestion('Unable to load challenge. Please refresh the page.')
    }
  }, [])

  useEffect(() => {
    loadCaptcha()
  }, [loadCaptcha])

  function validate(): boolean {
    const errors: Record<string, string> = {}
    if (!fullName.trim()) errors.fullName = 'Full name is required'
    if (!email.trim()) {
      errors.email = 'Email is required'
    } else if (!EMAIL_REGEX.test(email)) {
      errors.email = 'Invalid email format'
    }
    if (!captchaAnswer.trim()) errors.captcha = 'Please answer the challenge'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!validate()) return

    setBusy(true)
    setPageState('loading')
    try {
      await submitAccessRequest({
        full_name: fullName.trim(),
        email: email.toLowerCase().trim(),
        company: company.trim() || undefined,
        reason: reason.trim() || undefined,
        captcha_token: captchaToken,
        captcha_answer: parseInt(captchaAnswer, 10),
      })
      setPageState('success')
    } catch (err: any) {
      if (err.status === 409) {
        setPageState('duplicate')
        setDuplicateMsg(err.message || 'You have already applied for access.')
      } else {
        setError(err.message || 'Submission failed. Please try again.')
        setPageState('form')
        loadCaptcha()
        setCaptchaAnswer('')
      }
    } finally {
      setBusy(false)
    }
  }

  function toggleTheme() {
    setTweak('theme', tweaks.theme === 'dark' ? 'light' : 'dark')
  }

  if (pageState === 'success') {
    return (
      <div className="login-wrap">
        <div className="login-left">
          <div className="login-left-bg" />
          <div className="login-left-content">
            <div className="login-left-logo">
              <svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 1024 1024" style={{ flexShrink: 0 }}>
                <rect x="110" y="110" width="804" height="804" rx="180" ry="180" fill="none" stroke="#7bb307" strokeWidth="30"/>
                <g transform="translate(0.000000,1024.000000) scale(0.100000,-0.100000)" fill="#7bb307" stroke="none">
                  <path d="M4410 7064 c-452 -43 -767 -179 -1035 -448 -122 -122 -209 -237 -278 -366 -45 -84 -64 -129 -285 -660 -100 -238 -164 -392 -324 -775 -28 -66 -88 -209 -134 -317 -104 -245 -146 -367 -175 -498 -76 -356 72 -656 379 -767 162 -59 93 -56 1400 -60 1332 -5 1270 -8 1140 58 -278 140 -445 377 -489 693 l-12 86 -639 0 c-691 0 -677 -1 -728 55 -21 23 -25 36 -25 93 0 63 7 84 122 357 66 160 154 369 193 465 64 156 99 239 237 570 105 251 187 440 208 476 30 51 100 116 157 145 105 54 86 53 889 56 l745 4 154 162 c84 89 196 207 249 262 296 306 361 376 361 389 0 8 -15 16 -37 20 -38 6 -2007 6 -2073 0z"/>
                  <path d="M7053 7063 c-40 -4 -50 -13 -230 -206 -103 -111 -303 -323 -443 -472 -980 -1036 -1079 -1147 -1258 -1401 -391 -556 -452 -1166 -149 -1490 220 -236 584 -347 1028 -315 746 55 1379 509 1652 1187 138 342 149 664 30 904 -81 162 -252 291 -468 352 -85 24 -326 33 -422 15 -36 -6 -43 -5 -43 9 0 8 88 109 196 222 109 114 339 358 513 542 173 184 377 399 454 478 87 90 137 150 135 160 -3 16 -41 17 -478 18 -261 0 -494 -1 -517 -3z m-432 -2149 c59 -28 115 -78 140 -126 85 -166 -37 -504 -239 -663 -126 -101 -277 -155 -427 -155 -304 0 -420 189 -304 493 72 187 225 355 387 425 130 55 349 68 443 26z"/>
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
                Intelligent Protection for<br/>Generative AI Traffic
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
        <div className="login-right">
          <div className="login-right-stack">
            <div className="card" style={{ width: 'min(420px, 90vw)', padding: '36px 32px', borderTop: '3px solid var(--gaf-green)' }}>
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--gaf-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <h3 style={{ margin: '16px 0 8px', fontSize: 18, fontWeight: 600 }}>Request Submitted</h3>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-secondary)', lineHeight: 1.6 }}>
                  Your access request has been submitted successfully. An administrator will review it, and you will receive an email when your account has been approved.
                </p>
              </div>
              <Link to="/login" className="btn btn-primary" style={{ display: 'flex', justifyContent: 'center', textDecoration: 'none', marginTop: 16 }}>
                Back to sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="login-wrap">
      <div className="login-left">
        <div className="login-left-bg" />
        <div className="login-left-content">
          <div className="login-left-logo">
            <svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 1024 1024" style={{ flexShrink: 0 }}>
              <rect x="110" y="110" width="804" height="804" rx="180" ry="180" fill="none" stroke="#7bb307" strokeWidth="30"/>
              <g transform="translate(0.000000,1024.000000) scale(0.100000,-0.100000)" fill="#7bb307" stroke="none">
                <path d="M4410 7064 c-452 -43 -767 -179 -1035 -448 -122 -122 -209 -237 -278 -366 -45 -84 -64 -129 -285 -660 -100 -238 -164 -392 -324 -775 -28 -66 -88 -209 -134 -317 -104 -245 -146 -367 -175 -498 -76 -356 72 -656 379 -767 162 -59 93 -56 1400 -60 1332 -5 1270 -8 1140 58 -278 140 -445 377 -489 693 l-12 86 -639 0 c-691 0 -677 -1 -728 55 -21 23 -25 36 -25 93 0 63 7 84 122 357 66 160 154 369 193 465 64 156 99 239 237 570 105 251 187 440 208 476 30 51 100 116 157 145 105 54 86 53 889 56 l745 4 154 162 c84 89 196 207 249 262 296 306 361 376 361 389 0 8 -15 16 -37 20 -38 6 -2007 6 -2073 0z"/>
                <path d="M7053 7063 c-40 -4 -50 -13 -230 -206 -103 -111 -303 -323 -443 -472 -980 -1036 -1079 -1147 -1258 -1401 -391 -556 -452 -1166 -149 -1490 220 -236 584 -347 1028 -315 746 55 1379 509 1652 1187 138 342 149 664 30 904 -81 162 -252 291 -468 352 -85 24 -326 33 -422 15 -36 -6 -43 -5 -43 9 0 8 88 109 196 222 109 114 339 358 513 542 173 184 377 399 454 478 87 90 137 150 135 160 -3 16 -41 17 -478 18 -261 0 -494 -1 -517 -3z m-432 -2149 c59 -28 115 -78 140 -126 85 -166 -37 -504 -239 -663 -126 -101 -277 -155 -427 -155 -304 0 -420 189 -304 493 72 187 225 355 387 425 130 55 349 68 443 26z"/>
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
              Intelligent Protection for<br/>Generative AI Traffic
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
      <div className="login-right">
        <div className="login-right-stack">
          <div className="card" style={{ width: 'min(420px, 90vw)', padding: '36px 32px', borderTop: '3px solid var(--gaf-green)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Request Access</h3>
              <button onClick={toggleTheme} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center' }} title="Toggle theme">
                {isLight ? <Sun w={18} /> : <Moon w={18} />}
              </button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="label" style={{ display: 'block', marginBottom: 4 }}>Full Name *</label>
                <input
                  className="input"
                  type="text"
                  value={fullName}
                  onChange={e => { setFullName(e.target.value); setFieldErrors(p => ({ ...p, fullName: '' })) }}
                  autoFocus
                  required
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
                {fieldErrors.fullName && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 2 }}>{fieldErrors.fullName}</div>}
              </div>
              <div>
                <label className="label" style={{ display: 'block', marginBottom: 4 }}>Email *</label>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setFieldErrors(p => ({ ...p, email: '' })) }}
                  onBlur={e => setEmail(e.target.value.toLowerCase().trim())}
                  required
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
                {fieldErrors.email && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 2 }}>{fieldErrors.email}</div>}
              </div>
              <div>
                <label className="label" style={{ display: 'block', marginBottom: 4 }}>Company</label>
                <input
                  className="input"
                  type="text"
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label className="label" style={{ display: 'block', marginBottom: 4 }}>Reason for Access</label>
                <textarea
                  className="input"
                  rows={3}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
                />
              </div>
              <div>
                <label className="label" style={{ display: 'block', marginBottom: 4 }}>Security Check *</label>
                <div style={{ fontSize: 14, padding: '8px 0', color: 'var(--fg-secondary)' }}>
                  {captchaQuestion || 'Loading...'}
                </div>
                {captchaQuestion && (
                  <button
                    type="button"
                    onClick={() => { loadCaptcha(); setCaptchaAnswer('') }}
                    style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 6, textDecoration: 'underline' }}
                  >
                    New challenge
                  </button>
                )}
                <input
                  className="input"
                  type="number"
                  value={captchaAnswer}
                  onChange={e => { setCaptchaAnswer(e.target.value); setFieldErrors(p => ({ ...p, captcha: '' })) }}
                  placeholder="Your answer"
                  required
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
                {fieldErrors.captcha && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 2 }}>{fieldErrors.captcha}</div>}
              </div>
              {pageState === 'duplicate' && (
                <div style={{ fontSize: 12, color: '#B8860B', background: 'rgba(185,134,11,0.1)', padding: '8px 10px', borderRadius: 4 }}>
                  {duplicateMsg}
                </div>
              )}
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
                {busy ? 'Submitting\u2026' : 'Submit Request'}
              </button>
            </form>
            <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--fg-tertiary)' }}>
              Already have an account?{' '}
              <Link to="/login" style={{ color: 'var(--gaf-green)' }}>
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
