import React from 'react'
import { Badge, Field, KV, FORM_INPUT_STYLE, Drawer } from '../../components/ui'
import { Pencil } from '../../components/ui/Icons'
import type { AccessRequest, UpdateAccessRequestPayload } from '../../api/accessRequests'

// ── Detail Drawer ──────────────────────────────────────────────────────────

interface DetailDrawerProps {
  request: AccessRequest
  open?: boolean
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onReview: (status: 'approved' | 'rejected', adminNotes: string, sendEmail: boolean) => void
  reviewBusy: boolean
}

export function DetailDrawer({ request, open, onClose, onEdit, onDelete, onReview, reviewBusy }: DetailDrawerProps) {
  const [confirmAction, setConfirmAction] = React.useState<'approved' | 'rejected' | null>(null)
  const [notes, setNotes] = React.useState('')
  const [sendEmail, setSendEmail] = React.useState(true)

  React.useEffect(() => {
    setConfirmAction(null)
    setNotes('')
    setSendEmail(true)
  }, [request.id])

  const statusChip = (s: string) => {
    if (s === 'pending')  return <Badge kind="warn">pending</Badge>
    if (s === 'approved') return <Badge kind="ok">approved</Badge>
    return <Badge kind="err">rejected</Badge>
  }

  return (
    <Drawer
      open={open}
      title={
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{request.full_name}</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2 }}>{request.email}</div>
        </div>
      }
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" style={{ color: 'var(--danger)', marginRight: 'auto' }} onClick={onDelete}>
            Delete
          </button>
          {request.status === 'pending' && !confirmAction && (
            <>
              <button className="btn btn-primary" onClick={() => setConfirmAction('approved')}>Approve</button>
              <button className="btn btn-danger" onClick={() => setConfirmAction('rejected')}>Reject</button>
            </>
          )}
          {confirmAction && (
            <>
              <button className="btn btn-ghost" onClick={() => { setConfirmAction(null); setNotes(''); setSendEmail(true) }}>Cancel</button>
              <button
                className={`btn ${confirmAction === 'approved' ? 'btn-primary' : 'btn-danger'}`}
                onClick={() => onReview(confirmAction, notes, sendEmail)}
                disabled={reviewBusy}
              >
                {reviewBusy ? 'Processing\u2026' : `Confirm ${confirmAction === 'approved' ? 'Approve' : 'Reject'}`}
              </button>
            </>
          )}
          <button className="btn btn-secondary" onClick={onEdit}><Pencil w={13} /> Edit</button>
        </>
      }
    >
      <div style={{ padding: '16px 20px' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{request.full_name}</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{request.email}</div>
        </div>
        <KV
          labelWidth={110}
          gap={12}
          rows={[
            { label: 'Name', value: request.full_name },
            { label: 'Email', value: <span style={{ fontSize: 12 }}>{request.email}</span>, mono: true },
            { label: 'Company', value: request.company || '\u2014' },
            { label: 'Reason', value: <span style={{ whiteSpace: 'pre-wrap' }}>{request.reason || '\u2014'}</span> },
            { label: 'Status', value: statusChip(request.status) },
            { label: 'Submitted', value: <span style={{ fontSize: 12 }}>{new Date(request.created_at).toLocaleString()}</span>, mono: true },
            request.updated_at && { label: 'Updated', value: <span style={{ fontSize: 12 }}>{new Date(request.updated_at).toLocaleString()}</span>, mono: true },
            request.admin_notes && { label: 'Admin Notes', value: <span style={{ whiteSpace: 'pre-wrap' }}>{request.admin_notes}</span> },
          ]}
        />

        {confirmAction && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: confirmAction === 'approved' ? 'var(--ok)' : 'var(--danger)' }}>
              {confirmAction === 'approved' ? 'Approve' : 'Reject'} {request.full_name}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="label" style={{ display: 'block', marginBottom: 4 }}>Admin Notes (optional)</label>
              <textarea
                className="input"
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={'Optional notes\u2026'}
                style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
              />
            </div>
            <div style={{ marginBottom: 12, padding: '8px 10px', background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                id="drawer-send-email"
                checked={sendEmail}
                onChange={e => setSendEmail(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }}
              />
              <label htmlFor="drawer-send-email" style={{ fontSize: 13, fontWeight: 500, cursor: 'pointer', userSelect: 'none', color: 'var(--fg-primary)' }}>
                Send email notification
              </label>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  )
}

// ── Edit Drawer ─────────────────────────────────────────────────────────────

interface EditDrawerProps {
  request: AccessRequest
  open?: boolean
  onClose: () => void
  onSubmit: (p: UpdateAccessRequestPayload) => Promise<void>
  busy: boolean
}

export function EditDrawer({ request, open, onClose, onSubmit, busy }: EditDrawerProps) {
  const [form, setForm] = React.useState({
    full_name: request.full_name,
    company: request.company || '',
    reason: request.reason || '',
    admin_notes: request.admin_notes || '',
    status: request.status,
  })
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  function set(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => { const next = { ...e }; delete (next as any)[k]; return next })
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.full_name.trim()) e.full_name = 'Required'
    return e
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    const payload: UpdateAccessRequestPayload = {}
    if (form.full_name !== request.full_name) payload.full_name = form.full_name.trim()
    if ((form.company || null) !== request.company) payload.company = form.company.trim() || undefined
    if ((form.reason || null) !== request.reason) payload.reason = form.reason.trim() || undefined
    if ((form.admin_notes || null) !== (request.admin_notes || null)) payload.admin_notes = form.admin_notes.trim() || undefined
    if (form.status !== request.status) payload.status = form.status
    if (Object.keys(payload).length === 0) { onClose(); return }
    await onSubmit(payload)
  }

  return (
    <Drawer
      open={open}
      title={
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{request.full_name}</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2 }}>{request.email}</div>
        </div>
      }
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="submit" form="edit-access-request-form" disabled={busy}>
            {busy ? 'Saving\u2026' : 'Save'}
          </button>
        </>
      }
    >
      <form id="edit-access-request-form" onSubmit={handleSubmit} style={{ padding: '16px 20px' }}>
        <Field label="Full Name *" error={errors.full_name}>
          <input className="input" style={FORM_INPUT_STYLE} value={form.full_name} onChange={e => set('full_name', e.target.value)} />
        </Field>
        <Field label="Company">
          <input className="input" style={FORM_INPUT_STYLE} value={form.company} onChange={e => set('company', e.target.value)} />
        </Field>
        <Field label="Reason">
          <textarea className="input" style={{ ...FORM_INPUT_STYLE, resize: 'vertical' }} rows={3} value={form.reason} onChange={e => set('reason', e.target.value)} />
        </Field>
        <Field label="Admin Notes">
          <textarea className="input" style={{ ...FORM_INPUT_STYLE, resize: 'vertical' }} rows={3} value={form.admin_notes} onChange={e => set('admin_notes', e.target.value)} />
        </Field>
        <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '16px 0', paddingTop: 16 }}>
          <div className="label" style={{ marginBottom: 8, color: 'var(--fg-tertiary)' }}>Status</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['pending', 'approved', 'rejected'] as const).map(s => (
              <button
                key={s}
                type="button"
                className={`filter-chip ${form.status === s ? 'active' : ''}`}
                onClick={() => set('status', s)}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </form>
    </Drawer>
  )
}

// ── Shared helpers ──────────────────────────────────────────────────────────


