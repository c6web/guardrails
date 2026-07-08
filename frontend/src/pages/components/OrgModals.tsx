import React, { useEffect, useState } from 'react'
import { Field, FormModal, KV, FORM_INPUT_STYLE, LoadingState, Drawer } from '../../components/ui'
import { Network, Pencil, Trash2 } from '../../components/ui/Icons'
import { apiFetch } from '../../api/client'
import type { UIOrg } from '../../api/organizations'

const inputStyle: React.CSSProperties = { ...FORM_INPUT_STYLE, marginTop: 4 }

interface CreateOrgModalProps {
  onClose: () => void
  onSubmit: (payload: { name: string; description?: string | null; owner_user_id?: string | null }) => Promise<void>
  busy: boolean
}

export function CreateOrgModal({ onClose, onSubmit, busy }: CreateOrgModalProps) {
  const [name, setName] = React.useState('')
  const [nameError, setNameError] = React.useState('')
  const [description, setDescription] = React.useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setNameError('Name is required'); return }
    if (name.length > 200) { setNameError('Maximum 200 characters'); return }
    setNameError('')
    await onSubmit({ name: name.trim(), description: description.trim() || null })
  }

  return (
    <FormModal
      open
      title="New organization"
      busy={busy}
      busyLabel="Creating\u2026"
      submitLabel="Create"
      onSubmit={handleSubmit}
      onClose={onClose}
      width={420}
      top="20vh"
    >
      <Field label="Name *" error={nameError}>
        <input className="input" style={inputStyle} value={name}
          onChange={e => { setName(e.target.value); setNameError('') }}
          placeholder="Acme Corp" autoFocus maxLength={200} />
      </Field>
      <Field label="Description">
        <textarea className="input" style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Optional description\u2026" />
      </Field>
    </FormModal>
  )
}

interface EditOrgModalProps {
  org: UIOrg
  onClose: () => void
  onSubmit: (id: string, payload: { name: string; description?: string | null }) => Promise<void>
  busy: boolean
}

export function EditOrgModal({ org, onClose, onSubmit, busy }: EditOrgModalProps) {
  const [name, setName] = React.useState(org.name)
  const [nameError, setNameError] = React.useState('')
  const [description, setDescription] = React.useState(org.description ?? '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setNameError('Name is required'); return }
    if (name.length > 200) { setNameError('Maximum 200 characters'); return }
    setNameError('')
    await onSubmit(org.id, { name: name.trim(), description: description.trim() || null })
  }

  return (
    <FormModal
      open
      title="Edit organization"
      busy={busy}
      busyLabel="Saving\u2026"
      submitLabel="Save"
      onSubmit={handleSubmit}
      onClose={onClose}
      width={420}
      top="20vh"
    >
      <Field label="Name *" error={nameError}>
        <input className="input" style={inputStyle} value={name}
          onChange={e => { setName(e.target.value); setNameError('') }}
          autoFocus maxLength={200} />
      </Field>
      <Field label="Description">
        <textarea className="input" style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Optional description\u2026" />
      </Field>
    </FormModal>
  )
}

interface Member { id: string; display_name: string; username: string; email: string }

export function OrgDetailDrawer({ org, open, onClose, onEdit, onDelete }: {
  org: UIOrg
  open?: boolean
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [members, setMembers] = useState<Member[]>([])
  const [membersLoading, setMembersLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setMembersLoading(true)
    apiFetch<{ data: Member[] }>(`/api/users?organization_id=${org.id}&limit=100`)
      .then(r => { if (!cancelled) setMembers(r.data) })
      .catch(() => { if (!cancelled) setMembers([]) })
      .finally(() => { if (!cancelled) setMembersLoading(false) })
    return () => { cancelled = true }
  }, [org.id])

  return (
    <Drawer
      open={open}
      icon={<Network w={14} style={{ color: 'var(--accent)' }} />}
      title={org.name}
      subtitle={org.id}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={onDelete}>
            <Trash2 w={12} /> Delete
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={onEdit}>
            <Pencil w={12} /> Edit
          </button>
        </>
      }
    >
      <div style={{ padding: '16px 20px' }}>
        <KV
          labelWidth={130}
          gap={10}
          style={{ marginBottom: 18 }}
          rows={[
            { label: 'Name', value: <span style={{ fontWeight: 500 }}>{org.name}</span> },
            { label: 'Description', value: <span style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{org.description || <span style={{ color: 'var(--fg-tertiary)' }}>—</span>}</span> },
            { label: 'Owner ID', value: <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>{org.ownerUserId ?? <span style={{ color: 'var(--fg-tertiary)', fontSize: 12 }}>—</span>}</span>, mono: true },
            { label: 'Members', value: <span style={{ fontSize: 13 }}>{org.memberCount}</span> },
            { label: 'Created', value: <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>{org.createdAt}</span>, mono: true },
            { label: 'Updated', value: <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>{org.updatedAt}</span>, mono: true },
          ]}
        />

        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Members</div>
          {membersLoading ? (
            <LoadingState size="sm" />
          ) : members.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>No members</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {members.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, background: 'var(--bg-sunken)' }}>
                  <span style={{ fontWeight: 500, fontSize: 12, flex: 1 }}>{m.display_name}</span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>{m.email}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Drawer>
  )
}
