import React from 'react'
import { PageHeader, Breadcrumbs, Toast, Chip, Field, KV, FORM_INPUT_STYLE, LoadingState } from '../components/ui'
import { User, Lock, Check, Eye, X, Cpu, Shield } from '../components/ui/Icons'
import { useAuth } from '../context/AuthContext'
import { updateUser, changePassword, GROUP_LABELS } from '../api/users'
import { apiFetch } from '../api/client'
import { getApps } from '../api/apps'
import { GROUP_COLORS } from './components/UsersShared'
import type { App } from '../types'

interface ProfileData {
  id: string
  username: string
  email: string
  display_name: string
  group_id: string | null
  group_name?: string | null
  team: string | null
  otp_enabled: boolean
  otp_verified_at: string | null
  status: string
  last_seen_at: string | null
  created_at: string
}

function fmtDate(iso: string | null) {
  if (!iso) return 'never'
  const d = new Date(iso)
  try {
    const formatter = new Intl.DateTimeFormat(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    return formatter.format(d)
  } catch {
    return d.toLocaleString()
  }
}

function avInitials(displayName: string | null, username: string) {
  const name = displayName?.trim() || username
  const parts = name.split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

interface PasswordSectionProps {
  userId: string
  onSuccess: () => void
  onError: (msg: string) => void
}

function PasswordSection({ userId, onSuccess, onError }: PasswordSectionProps) {
  const [form, setForm] = React.useState({ current: '', next: '', confirm: '' })
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [showCurrent, setShowCurrent] = React.useState(false)
  const [showNext, setShowNext] = React.useState(false)
  const [showConfirm, setShowConfirm] = React.useState(false)

  function set(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: '' }))
    setSaved(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!form.current)                         errs['current']  = 'Required'
    if (!form.next)                            errs['next']     = 'Required'
    else if (form.next.length < 8)             errs['next']     = 'Minimum 8 characters'
    if (form.next !== form.confirm)            errs['confirm']  = 'Passwords do not match'
    if (Object.keys(errs).length) { setErrors(errs); return }

    setBusy(true)
    try {
      await changePassword(userId, form.current, form.next)
      setForm({ current: '', next: '', confirm: '' })
      setSaved(true)
      onSuccess()
    } catch (err) {
      onError((err as Error).message || 'Failed to change password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Field label="Current password" error={errors['current']}>
        <div style={{ position: 'relative' }}>
          <input className="input" style={FORM_INPUT_STYLE} type={showCurrent ? 'text' : 'password'} value={form.current} onChange={e => { set('current', e.target.value); setShowCurrent(false) }} autoComplete="current-password" />
          <button type="button" className="icon-btn" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', padding: 2 }} onClick={() => setShowCurrent(v => !v)}>
            {showCurrent ? <X w={13} /> : <Eye w={13} />}
          </button>
        </div>
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }} className="profile-form-fields">
        <Field label="New password" error={errors['next']}>
          <div style={{ position: 'relative' }}>
            <input className="input" style={FORM_INPUT_STYLE} type={showNext ? 'text' : 'password'} value={form.next} onChange={e => { set('next', e.target.value); setShowNext(false) }} autoComplete="new-password" />
            <button type="button" className="icon-btn" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', padding: 2 }} onClick={() => setShowNext(v => !v)}>
              {showNext ? <X w={13} /> : <Eye w={13} />}
            </button>
          </div>
        </Field>
        <Field label="Confirm new password" error={errors['confirm']}>
          <div style={{ position: 'relative' }}>
            <input className="input" style={FORM_INPUT_STYLE} type={showConfirm ? 'text' : 'password'} value={form.confirm} onChange={e => { set('confirm', e.target.value); setShowConfirm(false) }} autoComplete="new-password" />
            <button type="button" className="icon-btn" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', padding: 2 }} onClick={() => setShowConfirm(v => !v)}>
              {showConfirm ? <X w={13} /> : <Eye w={13} />}
            </button>
          </div>
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="submit" className="btn btn-secondary" disabled={busy}>
          <Lock w={12} /> {busy ? 'Saving…' : 'Change password'}
        </button>
        {saved && (
          <span style={{ fontSize: 12, color: 'var(--ok, #76B400)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Check w={13} /> Password updated
          </span>
        )}
      </div>
    </form>
  )
}

const GROUP_PERMISSIONS: Record<string, { label: string; perms: string[] }> = {
  '00000000-0000-0000-0000-000000000001': { label: 'Full system access', perms: ['*'] },
  '00000000-0000-0000-0000-000000000002': { label: 'Read-only access', perms: ['read:all'] },
  '00000000-0000-0000-0000-000000000003': { label: 'Standard user', perms: ['app:create', 'app:manage', 'detector:manage', 'read:all'] },
  '00000000-0000-0000-0000-000000000004': { label: 'Knowledge management + standard user', perms: ['app:create', 'app:manage', 'threat-knowledge:manage', 'detector:manage', 'detection-framework:manage', 'tool-guardrail:manage', 'read:all'] },
}

function getGroupInfo(groupId: string | null): { label: string; perms: string[] } {
  if (!groupId) return { label: 'Unassigned', perms: [] }
  return GROUP_PERMISSIONS[groupId] ?? { label: 'Custom', perms: [] }
}

export default function ProfilePage() {
  const { user: me } = useAuth()

  const [profile, setProfile] = React.useState<ProfileData | null>(null)
  const [loading, setLoading]  = React.useState(true)
  const [busy, setBusy]        = React.useState(false)
  const [saved, setSaved]      = React.useState(false)
  const [toast, setToast]      = React.useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)
  const [otpToggleBusy, setOtpToggleBusy] = React.useState(false)
  const [myApps, setMyApps]    = React.useState<App[]>([])

  const [form, setForm] = React.useState({ display_name: '', email: '', team: '' })
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    if (!me?.id) return
    apiFetch<{ data: ProfileData }>(`/api/users/${me.id}`)
      .then(res => {
        setProfile(res.data)
        setForm({
          display_name: res.data.display_name,
          email:     res.data.email,
          team:      res.data.team ?? '',
        })
      })
      .catch(() => {/* silently use me context */})
      .finally(() => setLoading(false))
  }, [me?.id])

  React.useEffect(() => {
    getApps().then(setMyApps).catch(() => {})
  }, [])

  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  function setField(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: '' }))
    setSaved(false)
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.email.trim())                     e['email'] = 'Required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e['email'] = 'Invalid email'
    return e
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    if (!me?.id) return
    setBusy(true)
    try {
      await updateUser(me.id, {
        display_name: form.display_name || undefined,
        email:     form.email,
        team:      form.team || undefined,
      })
      setSaved(true)
      setToast({ msg: 'Profile updated', kind: 'ok' })
      const res = await apiFetch<{ data: ProfileData }>(`/api/users/${me.id}`)
      setProfile(res.data)
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to update profile', kind: 'err' })
    } finally {
      setBusy(false)
    }
  }

  async function handleToggleOtp() {
    if (!me?.id) return
    const newEnabled = !p?.otp_enabled
    setOtpToggleBusy(true)
    try {
      await apiFetch(`/api/users/${me.id}/otp`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: newEnabled }),
      })
      setToast({ msg: `OTP ${newEnabled ? 'enabled' : 'disabled'}`, kind: 'ok' })
      const res = await apiFetch<{ data: ProfileData }>(`/api/users/${me.id}`)
      setProfile(res.data)
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to toggle OTP', kind: 'err' })
    } finally {
      setOtpToggleBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="page fade-in">
        <Breadcrumbs pageId="profile" />
        <LoadingState />
      </div>
    )
  }

  const p = profile
  const groupId = p?.group_id ?? me?.groupId ?? null
  const groupName = groupId ? (GROUP_LABELS[groupId] ?? (p?.group_name as string)) : (p?.group_name as string) ?? 'Unassigned'
  const groupInfo = getGroupInfo(groupId)
  const displayName = p?.display_name || p?.username || me?.username || '—'
  const avLetters = avInitials(p?.display_name ?? null, p?.username ?? me?.username ?? '?')

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="profile" />
      <PageHeader title="My profile" subtitle="Update your name and email, change your password, configure two-factor authentication, and review active sessions and login history." />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }} className="profile-page-grid">

        {/* ── Left column ───────────────────────────────────────────────── */}
        <div className="stack">

          {/* Profile info card */}
          <div className="card">
            <div className="card-hdr"><h3>Profile information</h3></div>
            <div style={{ padding: '16px 20px 20px' }}>
              <div className="row-tight" style={{ marginBottom: 20 }}>
                <div className="av av-jade" style={{ width: 52, height: 52, fontSize: 20, borderRadius: 12 }}>
                  {avLetters}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{displayName}</div>
                  <div className="mono" style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>{p?.username ?? me?.username}</div>
                </div>
              </div>

              <form id="profile-form" onSubmit={handleSave}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }} className="profile-form-fields">
                  <Field label="Display name">
                    <input className="input" style={FORM_INPUT_STYLE} value={form.display_name} onChange={e => setField('display_name', e.target.value)} placeholder={p?.username ?? ''} />
                  </Field>
                  <Field label="Username">
                    <input className="input input-mono" style={{ ...FORM_INPUT_STYLE, opacity: 0.6 }} value={p?.username ?? me?.username ?? ''} disabled title="Username cannot be changed" />
                  </Field>
                </div>
                <Field label="Email" error={errors['email']}>
                  <input className="input" style={FORM_INPUT_STYLE} type="email" value={form.email} onChange={e => setField('email', e.target.value)} />
                </Field>
                <Field label="Team">
                  <input className="input" style={FORM_INPUT_STYLE} value={form.team} onChange={e => setField('team', e.target.value)} placeholder="e.g. Security" />
                </Field>
              </form>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                <button type="submit" form="profile-form" className="btn btn-primary" disabled={busy}>
                  <User w={12} /> {busy ? 'Saving…' : 'Save changes'}
                </button>
                {saved && !busy && (
                  <span style={{ fontSize: 12, color: 'var(--ok, #76B400)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Check w={13} /> Saved
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Password card */}
          <div className="card">
            <div className="card-hdr"><h3>Change password</h3></div>
            <div style={{ padding: '16px 20px 20px' }}>
              {me?.id && (
                <PasswordSection
                  userId={me.id}
                  onSuccess={() => setToast({ msg: 'Password changed', kind: 'ok' })}
                  onError={msg => setToast({ msg, kind: 'err' })}
                />
              )}
            </div>
          </div>
        </div>

        {/* ── Right column ──────────────────────────────────────────────── */}
        <div className="stack">

          {/* Account details card */}
          <div className="card">
            <div className="card-hdr"><h3>Account details</h3></div>
            <div style={{ padding: '12px 16px' }}>
              <KV labelWidth={110} gap={10} rows={[
                { label: 'Group', value: <Chip kind={GROUP_COLORS[groupId ?? ''] ?? 'muted'} dot>{groupName}</Chip> },
                { label: 'Status', value: p?.status === 'active'
                  ? <Chip kind="ok" dot>Active</Chip>
                  : <Chip kind="muted" dot>{p?.status ?? 'unknown'}</Chip>
                },
                { label: 'OTP', value: <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {p?.otp_enabled
                    ? <Chip kind="ok" dot>enabled</Chip>
                    : <Chip kind="muted" dot>disabled</Chip>}
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleToggleOtp}
                    style={{ fontSize: 11, padding: '2px 8px' }}
                  >
                    {p?.otp_enabled ? 'Disable' : 'Enable'}
                  </button>
                </span> },
                { label: 'Last seen', value: <span style={{ fontSize: 11 }}>{fmtDate(p?.last_seen_at ?? null)}</span>, mono: true },
                { label: 'Member since', value: <span style={{ fontSize: 11 }}>{fmtDate(p?.created_at ?? null)}</span>, mono: true },
              ]} />
            </div>
          </div>

          {/* OTP card */}
          <div className="card">
            <div className="card-hdr"><h3>One-time password</h3></div>
            <div style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>Status</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2 }}>
                    {p?.otp_enabled
                      ? 'An OTP code is required when signing in'
                      : 'Sign-in uses password only'}
                  </div>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleToggleOtp}
                  disabled={otpToggleBusy}
                  style={{ flexShrink: 0 }}
                >
                  {otpToggleBusy ? 'Saving\u2026' : p?.otp_enabled ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
          </div>

          {/* Permissions card */}
          <div className="card">
            <div className="card-hdr"><h3>Permissions</h3></div>
            <div style={{ padding: '12px 16px' }}>
              <div className="row-tight" style={{ marginBottom: 8 }}>
                <Shield w={13} style={{ color: 'var(--accent)' }} />
                <span className="label" style={{ fontSize: 12 }}>Granted by</span>
                <Chip kind={GROUP_COLORS[groupId ?? ''] ?? 'muted'} dot>{groupName}</Chip>
              </div>
              <div className="caption" style={{ marginBottom: 10, color: 'var(--fg-secondary)', fontSize: 11 }}>
                {groupInfo.label}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {groupInfo.perms.map(s => (
                  <Chip key={s} kind="muted" mono>{s}</Chip>
                ))}
              </div>
              {!groupInfo.perms.length && (
                <div className="caption" style={{ color: 'var(--fg-tertiary)' }}>No specific permissions — access is managed per-app.</div>
              )}
              <div className="caption" style={{ marginTop: 10, color: 'var(--fg-tertiary)' }}>
                Group changes require an admin. Contact your SecOps team.
              </div>
            </div>
          </div>

          {/* My apps card */}
          <div className="card">
            <div className="card-hdr"><h3>My apps</h3></div>
            <div style={{ padding: '12px 16px' }}>
              {myApps.length === 0 ? (
                <div className="caption" style={{ color: 'var(--fg-tertiary)' }}>
                  No apps owned or shared with you yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {myApps.map(app => (
                    <div key={app.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                      background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 6,
                    }}>
                      <Cpu w={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.name}</div>
                        <div className="mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>{app.env}</div>
                      </div>
                      <Chip kind={app.status === 'enable' ? 'ok' : 'muted'} mono>{app.status}</Chip>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sessions card (placeholder) */}
          <div className="card">
            <div className="card-hdr"><h3>Active sessions</h3></div>
            <div style={{ padding: '12px 16px' }}>
              <div className="row-tight" style={{ marginBottom: 8 }}>
                 <span className="dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok, #76B400)', display: 'inline-block' }} />
                 <span style={{ fontSize: 12 }}>Current session</span>
                 <div style={{ marginLeft: 'auto' }}><Chip kind="ok" mono>this device</Chip></div>
               </div>
              <div className="caption" style={{ color: 'var(--fg-tertiary)' }}>
                Session management coming soon.
              </div>
            </div>
          </div>
        </div>
      </div>

      {toast && <Toast {...toast} />}
    </div>
  )
}
