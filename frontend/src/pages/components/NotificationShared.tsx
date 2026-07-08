import React from 'react'
import { Field, FormModal, KV, FORM_INPUT_STYLE, Drawer } from '../../components/ui'
export { Toast } from '../../components/ui'
import { Check, AlertO, Bolt } from '../../components/ui/Icons'
import { fmtDateTimeStr } from '../../utils/format'
import type { NotificationServer } from '../../api/notifications'

// ── Field registry ─────────────────────────────────────────────────────────────

type FieldInputType = 'text' | 'password' | 'number' | 'email' | 'toggle'

export interface FieldDef {
  key: string
  label: string
  type: FieldInputType
  required: boolean
  placeholder?: string
  hint?: string
  default?: string | number | boolean
}

export interface ServerTypeSpec {
  label: string
  description: string
  fields: FieldDef[]
}

export const SERVER_TYPES: Record<string, ServerTypeSpec> = {
  smtp: {
    label: 'SMTP',
    description: 'Standard mail server with username/password auth',
    fields: [
      { key: 'host',         label: 'Host',         type: 'text',     required: true,  placeholder: 'smtp.example.com' },
      { key: 'port',         label: 'Port',         type: 'number',   required: true,  default: 587 },
      { key: 'tls',          label: 'Use TLS',      type: 'toggle',   required: false, default: true },
      { key: 'username',     label: 'Username',     type: 'text',     required: false, placeholder: 'user@example.com' },
      { key: 'password',     label: 'Password',     type: 'password', required: false },
      { key: 'from_address', label: 'From address', type: 'email',    required: true,  placeholder: 'alerts@example.com' },
      { key: 'from_name',    label: 'From name',    type: 'text',     required: false, placeholder: 'AI Firewall Gateway' },
    ],
  },
  // Add new providers here — ServerFormModal needs zero changes:
  // sendgrid: { label: 'SendGrid', description: '...', fields: [...] }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildDefaultConfig(type: string): Record<string, unknown> {
  const spec = SERVER_TYPES[type]
  if (!spec) return {}
  const cfg: Record<string, unknown> = {}
  for (const f of spec.fields) {
    if (f.default !== undefined) cfg[f.key] = f.default
    else if (f.type === 'toggle') cfg[f.key] = false
    else cfg[f.key] = ''
  }
  return cfg
}

function renderField(
  def: FieldDef,
  value: unknown,
  onChange: (key: string, val: unknown) => void,
  error?: string,
) {
  if (def.type === 'toggle') {
    return (
      <Field key={def.key} label={def.label} hint={def.hint} error={error}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!value}
            onChange={e => onChange(def.key, e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <span style={{ fontSize: 12, color: 'var(--fg-secondary)' }}>
            {value ? 'Enabled' : 'Disabled'}
          </span>
        </label>
      </Field>
    )
  }
  return (
    <Field key={def.key} label={`${def.label}${def.required ? ' *' : ''}`} hint={def.hint} error={error}>
      <input
        className="input"
        style={FORM_INPUT_STYLE}
        type={def.type === 'password' ? 'password' : def.type === 'number' ? 'number' : def.type === 'email' ? 'email' : 'text'}
        value={String(value ?? '')}
        placeholder={def.placeholder}
        autoComplete={def.type === 'password' ? 'new-password' : undefined}
        onChange={e => onChange(def.key, def.type === 'number' ? Number(e.target.value) : e.target.value)}
      />
    </Field>
  )
}

// ── ServerFormModal ────────────────────────────────────────────────────────────

interface ServerFormModalProps {
  server?: NotificationServer
  onClose: () => void
  onSubmit: (data: { name: string; description?: string; type: string; config: Record<string, unknown> }) => Promise<void>
  busy: boolean
}

export function ServerFormModal({ server, onClose, onSubmit, busy }: ServerFormModalProps) {
  const isEdit = !!server
  const [name, setName]               = React.useState(server?.name ?? '')
  const [description, setDescription] = React.useState(server?.description ?? '')
  const [type, setType]               = React.useState(server?.type ?? Object.keys(SERVER_TYPES)[0])
  const [config, setConfig]           = React.useState<Record<string, unknown>>(
    server?.config ?? buildDefaultConfig(type)
  )
  const [errors, setErrors]     = React.useState<Record<string, string>>({})

  function handleTypeChange(newType: string) {
    setType(newType)
    if (!isEdit) setConfig(buildDefaultConfig(newType))
  }

  function setField(key: string, val: unknown) {
    setConfig(c => ({ ...c, [key]: val }))
    setErrors(e => { const n = { ...e }; delete n[key]; return n })
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!name.trim()) e['name'] = 'Required'
    const spec = SERVER_TYPES[type]
    if (spec) {
      for (const f of spec.fields) {
        if (f.required && !config[f.key]) e[f.key] = 'Required'
      }
    }
    return e
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    await onSubmit({ name: name.trim(), description: description.trim() || undefined, type, config })
  }

  const spec = SERVER_TYPES[type]

  return (
    <FormModal
      open
      title={isEdit ? 'Edit server' : 'Add email server'}
      busy={busy}
      busyLabel="Saving\u2026"
      submitLabel={isEdit ? 'Save changes' : 'Add server'}
      onSubmit={handleSubmit}
      onClose={onClose}
      width={480}
      top="4vh"
    >
      <Field label="Name *" error={errors['name']}>
        <input className="input" style={FORM_INPUT_STYLE} value={name}
          onChange={e => { setName(e.target.value); setErrors(v => ({ ...v, name: '' })) }}
          placeholder="Production SMTP" autoFocus />
      </Field>
      <Field label="Description">
        <textarea className="input" style={{ ...FORM_INPUT_STYLE, resize: 'vertical', minHeight: 56 }}
          value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Optional \u2014 purpose or notes for this server" />
      </Field>
      <Field label="Type *">
        <select className="select" style={FORM_INPUT_STYLE} value={type}
          onChange={e => handleTypeChange(e.target.value)} disabled={isEdit}>
          {Object.entries(SERVER_TYPES).map(([k, s]) => (
            <option key={k} value={k}>{s.label} \u2014 {s.description}</option>
          ))}
        </select>
        {isEdit && (
          <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 3 }}>Type cannot be changed after creation</div>
        )}
      </Field>
      {spec && (
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14, marginTop: 4 }}>
          <div className="label" style={{ marginBottom: 12, color: 'var(--fg-tertiary)' }}>{spec.label} configuration</div>
          {spec.fields.map(f => renderField(f, config[f.key], setField, errors[f.key]))}
        </div>
      )}
    </FormModal>
  )
}

// ── TestSendModal ──────────────────────────────────────────────────────────────

interface TestSendModalProps {
  server: NotificationServer
  onClose: () => void
  onTest: (recipient: string) => Promise<{ success: boolean; message_id?: string; error?: string }>
}

export function TestSendModal({ server, onClose, onTest }: TestSendModalProps) {
  const [recipient, setRecipient] = React.useState('')
  const [busy, setBusy]           = React.useState(false)
  const [result, setResult]       = React.useState<{ success: boolean; message_id?: string; error?: string } | null>(null)
  const [inputError, setInputError] = React.useState('')

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!recipient.trim() || !/\S+@\S+\.\S+/.test(recipient)) {
      setInputError('Enter a valid email address'); return
    }
    setBusy(true)
    setResult(null)
    const r = await onTest(recipient.trim())
    setResult(r)
    setBusy(false)
  }

  return (
    <FormModal
      open
      title="Send test email"
      busy={busy}
      busyLabel="Sending\u2026"
      submitLabel="Send test"
      onSubmit={handleSend}
      onClose={onClose}
      width={420}
      top="28vh"
    >
      <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginBottom: 14 }}>
        via <strong>{server.name}</strong> ({SERVER_TYPES[server.type]?.label ?? server.type})
      </div>
      <Field label="Recipient address *" error={inputError}>
        <input className="input" style={FORM_INPUT_STYLE} type="email" value={recipient}
          onChange={e => { setRecipient(e.target.value); setInputError('') }}
          placeholder="you@example.com" autoFocus />
      </Field>
      {result && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px',
          borderRadius: 6, marginBottom: 12,
          background: result.success ? 'var(--ok-bg, rgba(118,180,0,0.12))' : 'var(--danger-bg)',
          border: `1px solid ${result.success ? 'var(--ok, #76B400)' : 'var(--danger)'}`,
        }}>
          {result.success
            ? <Check w={14} style={{ color: 'var(--ok)', flexShrink: 0, marginTop: 1 }} />
            : <AlertO w={14} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
          }
          <div style={{ fontSize: 12 }}>
            {result.success
              ? <><strong style={{ color: 'var(--ok)' }}>Sent successfully</strong>{result.message_id && <span style={{ color: 'var(--fg-tertiary)', marginLeft: 6, fontFamily: 'monospace', fontSize: 11 }}>{result.message_id}</span>}</>
              : <><strong style={{ color: 'var(--danger)' }}>Failed: </strong><span style={{ color: 'var(--danger)' }}>{result.error}</span></>
            }
          </div>
        </div>
      )}
    </FormModal>
  )
}

// ── ServerDetailDrawer ────────────────────────────────────────────────────────

interface ServerDetailDrawerProps {
  server: NotificationServer
  open?: boolean
  onClose: () => void
  onEdit: () => void
  onTest: () => void
}

export function ServerDetailDrawer({ server, open, onClose, onEdit, onTest }: ServerDetailDrawerProps) {
  const spec = SERVER_TYPES[server.type]

  function ts(s: NotificationServer, field: 'created' | 'updated') {
    if (field === 'created') return s.created_at ?? s.createdAt ?? ''
    return s.updated_at ?? s.updatedAt ?? ''
  }

  return (
    <Drawer
      open={open}
      title="Server details"
      subtitle={server.name}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onTest}><Bolt w={13} style={{ marginRight: 5 }} />Send test</button>
          <button className="btn btn-primary" onClick={onEdit}>Edit server</button>
        </>
      }
    >
      <div style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>{server.name}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', fontFamily: 'monospace' }}>
            {spec?.label ?? server.type}
          </span>
          {server.is_default && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--ok-bg, rgba(118,180,0,0.12))', border: '1px solid var(--ok, #76B400)', color: 'var(--ok, #76B400)' }}>
              <Check w={11} /> default
            </span>
          )}
        </div>

        {server.description && (
          <div style={{ fontSize: 12, color: 'var(--fg-secondary)', marginBottom: 16, lineHeight: 1.5 }}>{server.description}</div>
        )}

        {spec && (
          <>
            <div className="label" style={{ marginBottom: 10, color: 'var(--fg-tertiary)' }}>{spec.label} configuration</div>
            <dl className="kv" style={{ gridTemplateColumns: '120px 1fr', rowGap: 10, marginBottom: 20 }}>
              {spec.fields.map(f => {
                const val = server.config[f.key]
                const isSensitive = f.type === 'password'
                const display = isSensitive
                  ? (val ? '••••••••' : <span style={{ color: 'var(--fg-tertiary)' }}>not set</span>)
                  : f.type === 'toggle'
                    ? <span style={{ color: val ? 'var(--ok)' : 'var(--fg-tertiary)' }}>{val ? 'Enabled' : 'Disabled'}</span>
                    : val !== undefined && val !== ''
                      ? <span className="mono" style={{ fontSize: 12 }}>{String(val)}</span>
                      : <span style={{ color: 'var(--fg-tertiary)' }}>—</span>
                return (
                  <React.Fragment key={f.key}>
                    <dt>{f.label}</dt>
                    <dd>{display}</dd>
                  </React.Fragment>
                )
              })}
            </dl>
          </>
        )}

        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
          <KV labelWidth={120} gap={10} rows={[
            { label: 'Created', value: <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>{fmtDateTimeStr(ts(server, 'created'))}</span>, mono: true },
            { label: 'Last updated', value: <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>{fmtDateTimeStr(ts(server, 'updated'))}</span>, mono: true },
          ]} />
        </div>
      </div>
    </Drawer>
  )
}

export { ConfirmModal } from '../../components/ui'


