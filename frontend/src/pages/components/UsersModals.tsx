import React from 'react'
import { X, Eye } from '../../components/ui/Icons'
import { GROUP_LABELS } from '../../api/users'
import type { CreateUserPayload, UIUser } from '../../api/users'
import { Field, FormModal } from '../../components/ui'
import { inputStyle } from './UsersShared'

interface InviteModalProps {
  onClose: () => void
  onSubmit: (p: CreateUserPayload & { team?: string }) => Promise<void>
  busy: boolean
}

export function InviteModal({ onClose, onSubmit, busy }: InviteModalProps) {
  const [form, setForm] = React.useState({
    username: '', email: '', password: '', display_name: '', group_id: '00000000-0000-0000-0000-000000000003', team: '',
    create_first_app: true,
  })
  const [displayNameTouched, setDisplayNameTouched] = React.useState(false)
  const [errors, setErrors] = React.useState<Partial<Record<keyof CreateUserPayload, string>>>({})

  function set(k: keyof CreateUserPayload | 'team', v: string) {
    if (k === 'display_name') setDisplayNameTouched(true)
    setForm(f => {
      const updated = { ...f, [k]: v }
      if (k === 'username' && !displayNameTouched) {
        updated.display_name = v
      }
      return updated
    })
    setErrors(e => ({ ...e, [k]: undefined }))
  }

  function validate() {
    const e: typeof errors = {}
    if (!form.username.trim())                    e.username = 'Required'
    else if (!/^[a-z0-9_.-]{3,32}$/.test(form.username)) e.username = 'Lowercase letters, digits, _ . - only (3–32 chars)'
    if (!form.display_name.trim())                e.display_name = 'Required'
    else if (form.display_name.length > 100)     e.display_name = 'Maximum 100 characters'
    if (!form.email.trim())                       e.email = 'Required'
    else if (!/\S+@\S+\.\S+/.test(form.email))   e.email = 'Enter a valid email'
    if (!form.password)                           e.password = 'Required'
    else if (form.password.length < 8)            e.password = 'Minimum 8 characters'
    if (!form.group_id)                           e.group_id = 'Required'
    return e
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    await onSubmit(form as CreateUserPayload & { team?: string })
  }

  return (
    <FormModal
      open
      title="Invite member"
      busy={busy}
      busyLabel="Creating…"
      submitLabel="Create user"
      onSubmit={handleSubmit}
      onClose={onClose}
      width={460}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
        <Field label="Username *" error={errors.username}>
          <input className="input input-mono" style={inputStyle} value={form.username} onChange={e => set('username', e.target.value.toLowerCase())} placeholder="jane.smith" autoFocus />
        </Field>
      </div>
      <Field label="Display name *" error={errors.display_name}>
        <input className="input" style={inputStyle} value={form.display_name} onChange={e => set('display_name', e.target.value)} placeholder="Jane's Display Name" />
      </Field>
      <Field label="Email *" error={errors.email}>
        <input className="input" style={inputStyle} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@company.com" />
      </Field>
      <Field label="Temporary password *" error={errors.password}>
        <input className="input" style={inputStyle} type="password" value={form.password} onChange={e => set('password', e.target.value)} autoComplete="new-password" />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
        <Field label="Group *" error={errors.group_id}>
          <select className="select" style={inputStyle} value={form.group_id} onChange={e => set('group_id', e.target.value)}>
            {Object.entries(GROUP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Team">
          <input className="input" style={inputStyle} value={form.team} onChange={e => set('team', e.target.value)} placeholder="Security" />
        </Field>
      </div>
      <div style={{ marginBottom: 14, padding: '8px 10px', background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="checkbox" id="create-first-app" checked={form.create_first_app}
          onChange={e => setForm(f => ({ ...f, create_first_app: e.target.checked }))}
          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }} />
        <label htmlFor="create-first-app" style={{ fontSize: 13, fontWeight: 500, cursor: 'pointer', userSelect: 'none', color: 'var(--fg-primary)' }}>
          Create 'My First App' for quick start
        </label>
      </div>
    </FormModal>
  )
}

interface PasswordResetModalProps {
  user: UIUser
  onClose: () => void
  onConfirm: (password: string) => Promise<void>
  busy: boolean
}

export function PasswordResetModal({ user, onClose, onConfirm, busy }: PasswordResetModalProps) {
  const [newPassword, setNewPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [showNew, setShowNew] = React.useState(false)
  const [showConfirm, setShowConfirm] = React.useState(false)
  const [error, setError] = React.useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return }
    if (!newPassword) { setError('Password is required'); return }
    setError('')
    await onConfirm(newPassword)
  }

  return (
    <FormModal
      open
      title="Force Password Reset"
      busy={busy}
      busyLabel="Resetting…"
      submitLabel="Set password"
      submitVariant="warning"
      onSubmit={handleSubmit}
      onClose={onClose}
      width={420}
      top="30vh"
    >
      <p style={{ fontSize: 13, marginBottom: 16, color: 'var(--fg-tertiary)' }}>
        Set a new password for <span className="mono" style={{ fontSize: 12 }}>{user.displayName}</span>
      </p>
      <Field label="New password" error={error && !newPassword ? error : undefined}>
        <div style={{ position: 'relative' }}>
          <input className="input" style={inputStyle} type={showNew ? 'text' : 'password'}
            value={newPassword} onChange={e => { setNewPassword(e.target.value); setError('') }}
            placeholder="Enter new password" />
          <button type="button" className="icon-btn"
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', padding: 2 }}
            onClick={() => setShowNew(v => !v)}>
            {showNew ? <X w={13} /> : <Eye w={13} />}
          </button>
        </div>
      </Field>
      <Field label="Confirm password" error={error && newPassword ? 'Passwords do not match' : undefined}>
        <div style={{ position: 'relative' }}>
          <input className="input" style={inputStyle} type={showConfirm ? 'text' : 'password'}
            value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setError('') }}
            placeholder="Confirm new password" />
          <button type="button" className="icon-btn"
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', padding: 2 }}
            onClick={() => setShowConfirm(v => !v)}>
            {showConfirm ? <X w={13} /> : <Eye w={13} />}
          </button>
        </div>
      </Field>
    </FormModal>
  )
}
