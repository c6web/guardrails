import React, { useState } from 'react'
import { Chip, FormModal, Drawer } from '../../components/ui'
import type { AclEntryType } from '../../api/networkAcl'

const ENTRY_TYPES: { value: AclEntryType; label: string }[] = [
  { value: 'ip',     label: 'IP Address' },
  { value: 'cidr',   label: 'CIDR Range' },
  { value: 'host',   label: 'Hostname' },
  { value: 'domain', label: 'Domain' },
]

const ENTRY_PLACEHOLDERS: Record<AclEntryType, string> = {
  ip:     '203.0.113.42',
  cidr:   '10.0.0.0/8',
  host:   'evil.example.com',
  domain: 'malicious.net',
}

const ENTRY_EXAMPLES: Record<AclEntryType, string[]> = {
  ip:     ['203.0.113.42', '192.168.1.10'],
  cidr:   ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '0.0.0.0/0'],
  host:   ['gateway.corp.example.com', 'api.provider.internal'],
  domain: ['example.com', '*.malicious.net', 'cdn.safe-provider.io'],
}

const ENTRY_DESCRIPTIONS: Record<AclEntryType, string> = {
  ip:     'Single IPv4 or IPv6 address',
  cidr:   'CIDR notation (IP/mask)',
  host:   'Fully qualified domain name',
  domain: 'Domain with optional wildcard (*)',
}

const HELP_ITEMS = [
  {
    title: 'Allowlist vs Blocklist',
    body: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p><strong>Allowlist</strong> — Only IPs/domains in this list are permitted. Everything else is blocked.</p>
        <p><strong>Blocklist</strong> — IPs/domains in this list are blocked. Everything else is allowed.</p>
      </div>
    ),
  },
  {
    title: 'Entry Types & Supported Formats',
    body: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ENTRY_TYPES.map(t => (
          <div key={t.value}>
            <div className="label">{t.label}</div>
            <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: 12, lineHeight: 1.6 }}>
              {ENTRY_EXAMPLES[t.value].map((ex, i) => (
                <li key={i} className="mono" style={{ marginBottom: 2 }}>{ex}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    ),
  },
]

interface FormatsModalProps {
  onClose: () => void
}

function FormatsModal({ onClose }: FormatsModalProps) {
  return (
    <Drawer
      open
      title="Entry Formats & Examples"
      onClose={onClose}
      width={600}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {ENTRY_TYPES.map(entryType => (
          <div key={entryType.value} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--fg-primary)' }}>
              {entryType.label}
            </h4>
            <p style={{ fontSize: 12, color: 'var(--fg-secondary)', marginBottom: 8 }}>
              {ENTRY_DESCRIPTIONS[entryType.value]}
            </p>
            <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', fontFamily: 'monospace', background: 'rgba(0,0,0,0.05)', padding: '8px 12px', borderRadius: 4 }}>
              {ENTRY_EXAMPLES[entryType.value].map((ex, i) => (
                <div key={i}>{ex}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Drawer>
  )
}

interface HelpModalProps {
  onClose: () => void
}

export function HelpModal({ onClose }: HelpModalProps) {
  return (
    <Drawer
      open
      title="Network ACL — Help & Formats"
      onClose={onClose}
      width={620}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {HELP_ITEMS.map((item, i) => (
          <div key={i} style={{ borderBottom: i < HELP_ITEMS.length - 1 ? '1px solid var(--border)' : 'none', paddingBottom: 16 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--fg-primary)' }}>
              {item.title}
            </h4>
            <div style={{ fontSize: 12, color: 'var(--fg-secondary)', lineHeight: 1.6 }}>
              {item.body}
            </div>
          </div>
        ))}
      </div>
    </Drawer>
  )
}

interface EntryModalProps {
  listName: string
  onSave: (payload: { value: string; entry_type: AclEntryType; note: string; enabled: boolean }) => Promise<void>
  onClose: () => void
  initial?: { id: string; value: string; entry_type: AclEntryType; note: string; enabled: boolean } | null
}

export function EntryModal({ listName, onSave, onClose, initial }: EntryModalProps) {
  const [entryType, setEntryType] = useState<AclEntryType>(initial?.entry_type ?? 'ip')
  const [value, setValue] = useState(initial?.value ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [enabled, setEnabled] = useState(initial?.enabled ?? true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [showFormats, setShowFormats] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!value.trim()) { setErr('Value is required'); return }
    setSaving(true); setErr('')
    try {
      await onSave({ value: value.trim(), entry_type: entryType, note: note.trim(), enabled })
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to save entry')
      setSaving(false)
    }
  }

  return (
    <>
      <FormModal
        open
        title={initial ? 'Edit Entry' : 'Add Entry'}
        busy={saving}
        busyLabel={initial ? 'Saving\u2026' : 'Adding\u2026'}
        submitLabel={initial ? 'Save Changes' : 'Add Entry'}
        onSubmit={handleSubmit}
        onClose={onClose}
      >
        <div style={{ fontSize: 12, color: 'var(--fg-secondary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Chip kind={listName.includes('Allow') ? 'ok' : 'danger'}>
            {listName.includes('Allow') ? 'Allowlist' : 'Blocklist'}
          </Chip>
          {listName}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="label" style={{ display: 'block', marginBottom: 8 }}>Entry Type</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {ENTRY_TYPES.map(t => (
              <button key={t.value} type="button" onClick={() => setEntryType(t.value)}
                style={{
                  padding: '8px 12px', borderRadius: 6, fontSize: 13, fontWeight: 500,
                  border: `2px solid ${entryType === t.value ? 'var(--accent)' : 'var(--border)'}`,
                  background: entryType === t.value ? 'rgba(var(--accent-rgb), 0.08)' : 'transparent',
                  color: entryType === t.value ? 'var(--accent)' : 'var(--fg-secondary)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', marginBottom: 8 }}>
            <label className="label">Value <span style={{ color: 'var(--danger)' }}>*</span></label>
            <button type="button" onClick={() => setShowFormats(true)}
              style={{ fontSize: 11, color: 'var(--accent)', cursor: 'pointer', background: 'none', border: 'none', textDecoration: 'underline', padding: 0, fontWeight: 500 }}>
              View formats & examples
            </button>
          </div>
          <input className="input" type="text" value={value} onChange={e => setValue(e.target.value)}
            placeholder={ENTRY_PLACEHOLDERS[entryType]} autoFocus style={{ width: '100%' }} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="label" style={{ display: 'block', marginBottom: 8 }}>Note <span style={{ color: 'var(--fg-tertiary)' }}>(optional)</span></label>
          <input className="input" type="text" value={note} onChange={e => setNote(e.target.value)}
            placeholder="e.g. Temporary block, External API, etc." style={{ width: '100%' }} />
        </div>

        <div style={{ paddingBottom: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}
              style={{ accentColor: 'var(--accent)' }} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>Enabled</span>
            <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>(disabled entries are not enforced)</span>
          </label>
        </div>

        {err && (
          <div style={{ padding: '10px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid var(--danger)', color: 'var(--danger)', fontSize: 12 }}>
            {err}
          </div>
        )}
      </FormModal>
      {showFormats && <FormatsModal onClose={() => setShowFormats(false)} />}
    </>
  )
}
