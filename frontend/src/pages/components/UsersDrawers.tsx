import React from 'react'
import { Chip, Drawer, Field, KV } from '../../components/ui'
import { GROUP_LABELS } from '../../api/users'
import type { UIUser, UpdateUserPayload } from '../../api/users'
import { inputStyle, avClass, initials, GROUP_COLORS } from './UsersShared'

interface OrgOption { id: string; name: string }

interface EditDrawerProps {
  user: UIUser
  currentUserId: string | undefined
  isAdmin: boolean
  organizations: OrgOption[]
  open?: boolean
  onClose: () => void
  onSubmit: (p: UpdateUserPayload) => Promise<void>
  onToggleOtp: () => void
  busy: boolean
}

export function EditDrawer({ user, open, currentUserId, isAdmin, organizations, onClose, onSubmit, onToggleOtp, busy }: EditDrawerProps) {
  const isSelf = user.id === currentUserId
  const [form, setForm] = React.useState({
     display_name: user.displayName,
     email:     user.email,
    team:      user.team === '—' ? '' : user.team,
    group_id:  user.groupId ?? '',
    status:    user.rawStatus,
    organization_id: user.organizationId ?? '',
  })
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  function set(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => { const next = { ...e }; delete (next as Record<string, unknown>)[k]; return next })
  }

  function validate() {
    const e: Record<string, string> = {}
    if (form.display_name && form.display_name.length > 100) e['display_name'] = 'Maximum 100 characters'
    if (form.email && !/\S+@\S+\.\S+/.test(form.email)) e['email'] = 'Invalid email'
    return e
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    const origTeam     = user.team === '—' ? '' : user.team

    const payload: UpdateUserPayload = {}
    if (form.display_name !== user.displayName) payload.display_name = form.display_name
    if (form.email     !== user.email)      payload.email     = form.email
    if (form.team      !== origTeam)        payload.team      = form.team || undefined
    if (!isSelf && isAdmin) {
      if (form.group_id          !== user.groupId)          payload.group_id          = form.group_id
      if (form.status            !== user.rawStatus)        payload.status            = form.status
      if (form.organization_id   !== (user.organizationId ?? '')) {
        payload.organization_id = form.organization_id || null
      }
    }

    if (Object.keys(payload).length === 0) { onClose(); return }

    await onSubmit(payload)
  }

  return (
    <Drawer
      open={open}
      title={user.displayName}
      subtitle={user.username}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="edit-user-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <div style={{ padding: '16px 20px' }}>
        <form id="edit-user-form" onSubmit={handleSubmit}>
          <Field label="Display name" error={errors['display_name']}>
            <input className="input" style={inputStyle} value={form.display_name} onChange={e => set('display_name', e.target.value)} placeholder={user.username} />
          </Field>

          <Field label="Email" error={errors['email']}>
            <input className="input" style={inputStyle} type="email" value={form.email} onChange={e => set('email', e.target.value)} />
          </Field>
          <Field label="Team">
            <input className="input" style={inputStyle} value={form.team} onChange={e => set('team', e.target.value)} placeholder="e.g. Security" />
          </Field>
          <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '16px 0', paddingTop: 16 }}>
              <div className="label" style={{ marginBottom: 8, color: 'var(--fg-tertiary)' }}>OTP</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13 }}>{user.otpEnabled ? <Chip kind="ok" dot>enabled</Chip> : <Chip kind="muted" dot>disabled</Chip>}</span>
                <button className="btn btn-ghost btn-sm" onClick={onToggleOtp}>
                  {user.otpEnabled ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>

            {isAdmin && !isSelf && (
            <>
              <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '16px 0', paddingTop: 16 }}>
                <div className="label" style={{ marginBottom: 12, color: 'var(--fg-tertiary)' }}>Admin controls</div>
                <Field label="Group">
                  <select className="select" style={inputStyle} value={form.group_id} onChange={e => set('group_id', e.target.value)}>
                    {Object.entries(GROUP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select className="select" style={inputStyle} value={form.status} onChange={e => set('status', e.target.value)}>
                    <option value="active">Active</option>
                    <option value="dormant">Dormant</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </Field>
                <Field label="Organization">
                  <select className="select" style={inputStyle} value={form.organization_id} onChange={e => set('organization_id', e.target.value)}>
                    <option value="">— None —</option>
                    {organizations.map(o => <option key={o.id} value={o.id}>{o.name} - {o.id}</option>)}
                  </select>
                </Field>
              </div>
            </>
          )}

        </form>
      </div>
    </Drawer>
  )
}

interface UserDetailDrawerProps {
  user: UIUser
  open?: boolean
  currentUserId: string | undefined
  isAdmin: boolean
  orgNameMap: Record<string, string>
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleStatus: () => void
  onToggleOtp: () => void
  onResetPassword: () => void
  onRequirePasswordChange?: () => void
}

export function UserDetailDrawer({ user, open, currentUserId, isAdmin, orgNameMap, onClose, onEdit, onDelete, onToggleStatus, onToggleOtp, onResetPassword, onRequirePasswordChange }: UserDetailDrawerProps) {
  const isSelf = user.id === currentUserId
  return (
    <Drawer
      open={open}
      title={user.displayName}
      subtitle={user.username}
      onClose={onClose}
      footer={
        <>
          {isAdmin && !isSelf && (
            <>
              <button className="btn btn-ghost" style={{ color: 'var(--danger)', marginRight: 'auto' }} onClick={onDelete}>Remove</button>
              <button className="btn btn-secondary" onClick={onToggleStatus}>
                {user.rawStatus === 'active' ? 'Suspend' : 'Activate'}
              </button>
            </>
          )}
          {isAdmin && (
            <>
              <button className="btn btn-secondary" onClick={onToggleOtp}>
                {user.otpEnabled ? 'Disable OTP' : 'Enable OTP'}
              </button>
              <button className="btn btn-ghost" style={{ color: 'var(--warning)' }} onClick={onResetPassword}>
                Reset password
              </button>
              {onRequirePasswordChange && (
                <button className="btn btn-ghost" style={{ color: 'var(--warning)' }} onClick={onRequirePasswordChange}>
                  {user.mustChangePassword ? 'Clear password change' : 'Require change'}
                </button>
              )}
            </>
          )}
          <button className="btn btn-primary" onClick={onEdit}>Edit profile</button>
        </>
      }
    >
      <div style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          <span className={`av ${avClass(user.groupId)}`} style={{ width: 48, height: 48, fontSize: 18 }}>{initials(user.displayName)}</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              {user.displayName}
              {isSelf && <span className="mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)', marginLeft: 8 }}>you</span>}
            </div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{user.email}</div>
          </div>
        </div>
        <KV
          labelWidth={110}
          gap={12}
          rows={[
            { label: 'Username', value: <span style={{ fontSize: 12 }}>{user.username}</span>, mono: true },
            { label: 'Display name', value: user.displayName },
            { label: 'Email', value: <span style={{ fontSize: 12 }}>{user.email}</span>, mono: true },
            { label: 'Group', value: <Chip kind={GROUP_COLORS[user.groupId ?? ''] ?? 'muted'} dot>{user.groupName}</Chip> },
            { label: 'Team', value: user.team },
            { label: 'Organization', value: <span style={{ fontSize: 12 }}>{user.organizationId ? <><span style={{ fontWeight: 500 }}>{orgNameMap[user.organizationId] ?? 'Unknown'}</span><span className="mono" style={{ color: 'var(--fg-tertiary)', marginLeft: 6, fontSize: 10 }}>{user.organizationId}</span></> : <span style={{ color: 'var(--fg-tertiary)' }}>—</span>}</span> },
            { label: 'Status', value: <>{user.rawStatus === 'active' && <Chip kind="ok" dot>active</Chip>}{user.rawStatus === 'suspended' && <Chip kind="err" dot>suspended</Chip>}{user.rawStatus === 'dormant' && <Chip kind="muted" dot>dormant</Chip>}</> },
            { label: 'OTP', value: user.otpEnabled ? <Chip kind="ok" dot>enabled</Chip> : <Chip kind="muted" dot>disabled</Chip> },
            { label: 'Password', value: user.mustChangePassword ? <Chip kind="warning" dot>change required</Chip> : <Chip kind="ok" mono>ok</Chip> },
            { label: 'Last seen', value: <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>{user.lastSeen}</span>, mono: true },
          ]}
        />
      </div>
    </Drawer>
  )
}
