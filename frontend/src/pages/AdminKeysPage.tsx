import React from 'react'
import { PageHeader, Chip, EmptyState, DataTable, Toast, useToast, Breadcrumbs, type ColumnDef } from '../components/ui'
import ActionCell from '../components/ui/ActionCell'
import type { ActionDef } from '../components/ui/ActionCell'
import { Refresh, AlertO, Copy, Check, Key, Pencil, Trash2 } from '../components/ui/Icons'
import { getAdminKeys, createAdminKey, updateAdminKey, revokeAdminKey, deleteAdminKey } from '../api/adminkeys'
import type { UIAdminKey } from '../api/adminkeys'
import { copyToClipboard } from '../utils/format'
import type { TweakValues } from '../types'

interface AdminKeysPageProps { tweaks: TweakValues }

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false)
  async function handleCopy() {
    try { await copyToClipboard(text); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }
  return (
    <button className="icon-btn" onClick={handleCopy} title="Copy">
      {copied ? <Check w={11} /> : <Copy w={11} />}
    </button>
  )
}

// ── Generate key modal ────────────────────────────────────────────────────────

function GenerateModal({
  onClose, onCreated,
}: {
  onClose: () => void
  onCreated: (key: UIAdminKey, fullKey: string) => void
}) {
  const [name, setName]               = React.useState('')
  const [description, setDescription] = React.useState('')
  const [saving, setSaving]           = React.useState(false)
  const [err, setErr]                 = React.useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr('Name is required'); return }
    setSaving(true); setErr('')
    try {
      const { key, full_key } = await createAdminKey(name.trim(), description.trim() || undefined)
      onCreated(key, full_key)
    } catch {
      setErr('Failed to generate key')
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 'min(420px, 90vw)', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Generate Admin Key</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label className="label" style={{ display: 'block', marginBottom: 4 }}>Key name *</label>
            <input className="input" style={{ width: '100%', boxSizing: 'border-box' }}
              value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Prometheus scraper, CI deploy key"
              autoFocus disabled={saving} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label className="label" style={{ display: 'block', marginBottom: 4 }}>Description</label>
            <textarea className="input" style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 60 }}
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Optional — what is this key used for?"
              disabled={saving} />
          </div>
          {err && <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 10 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Generating…' : 'Generate key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Key reveal modal ──────────────────────────────────────────────────────────

function RevealModal({ keyName, fullKey, onClose }: { keyName: string; fullKey: string; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false)
  async function handleCopy() {
    try { await copyToClipboard(fullKey); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 'min(480px, 90vw)', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Admin key generated</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 6, background: 'var(--warning-bg, rgba(250,180,0,0.1))', border: '1px solid var(--warning, #FAB400)', fontSize: 12, color: 'var(--fg-primary)' }}>
          <AlertO w={12} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Copy this key now — it will not be shown again.
        </div>
        <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--fg-secondary)' }}>{keyName}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 6, background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', marginBottom: 18 }}>
          <span className="mono" style={{ flex: 1, fontSize: 12, wordBreak: 'break-all', lineHeight: 1.5 }}>{fullKey}</span>
          <button className="icon-btn" onClick={handleCopy} title="Copy">
            {copied ? <Check w={13} /> : <Copy w={13} />}
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

// ── Rename modal ──────────────────────────────────────────────────────────────

function RenameModal({ keyItem, onClose, onSaved }: {
  keyItem: UIAdminKey; onClose: () => void; onSaved: (k: UIAdminKey) => void
}) {
  const [name, setName]               = React.useState(keyItem.name)
  const [description, setDescription] = React.useState(keyItem.description ?? '')
  const [saving, setSaving]           = React.useState(false)
  const [err, setErr]                 = React.useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr('Name is required'); return }
    setSaving(true); setErr('')
    try {
      const k = await updateAdminKey(keyItem.id, name.trim(), description.trim() || null)
      onSaved(k)
    } catch { setErr('Failed to update'); setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 'min(420px, 90vw)', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Edit key</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label className="label" style={{ display: 'block', marginBottom: 4 }}>Key name *</label>
            <input className="input" style={{ width: '100%', boxSizing: 'border-box' }}
              value={name} onChange={e => setName(e.target.value)} autoFocus disabled={saving} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label className="label" style={{ display: 'block', marginBottom: 4 }}>Description</label>
            <textarea className="input" style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 60 }}
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Optional — what is this key used for?"
              disabled={saving} />
          </div>
          {err && <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminKeysPage({ tweaks: _tweaks }: AdminKeysPageProps) {
  const [keys, setKeys]         = React.useState<UIAdminKey[]>([])
  const [loading, setLoading]   = React.useState(true)
  const [search, setSearch]     = React.useState('')
  const { toast, show: notify } = useToast()

  const [showGenerate, setShowGenerate] = React.useState(false)
  const [reveal, setReveal]             = React.useState<{ name: string; fullKey: string } | null>(null)
  const [renaming, setRenaming]         = React.useState<UIAdminKey | null>(null)

  async function load() {
    setLoading(true)
    try { setKeys(await getAdminKeys()) }
    catch { notify('Failed to load admin keys', 'err') }
    finally { setLoading(false) }
  }

  React.useEffect(() => { load() }, [])

  function handleCreated(key: UIAdminKey, fullKey: string) {
    setShowGenerate(false)
    setKeys(prev => [key, ...prev])
    setReveal({ name: key.name, fullKey })
    notify('Admin key generated')
  }

  async function handleRevoke(key: UIAdminKey) {
    if (!window.confirm(`Revoke "${key.name}"? The gateway will stop accepting it immediately after cache refresh.`)) return
    try {
      const updated = await revokeAdminKey(key.id)
      setKeys(prev => prev.map(k => k.id === updated.id ? updated : k))
      notify('Key revoked')
    } catch { notify('Failed to revoke key', 'err') }
  }

  async function handleDelete(key: UIAdminKey) {
    if (!window.confirm(`Permanently delete "${key.name}"?`)) return
    try {
      await deleteAdminKey(key.id)
      setKeys(prev => prev.filter(k => k.id !== key.id))
      notify('Key deleted')
    } catch { notify('Failed to delete key', 'err') }
  }

  const filtered = keys.filter(k =>
    k.name.toLowerCase().includes(search.toLowerCase()) ||
    k.prefix.includes(search) ||
    (k.ownerEmail ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (k.description ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const activeCount  = keys.filter(k => k.status === 'active').length
  const revokedCount = keys.filter(k => k.status === 'revoked').length

  const columns: ColumnDef<UIAdminKey>[] = [
    { key: 'name', label: 'Name', render: (row) => <span style={{ fontWeight: 500 }}>{row.name}</span> },
    { key: 'description', label: 'Description', render: (row) => <span style={{ color: 'var(--fg-tertiary)', fontSize: 12, maxWidth: 200 }}>{row.description ?? '—'}</span> },
    { key: 'prefix', label: 'Key prefix', render: (row) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="mono">{row.prefix}••••</span>
        {row.keyValue && <CopyButton text={row.keyValue} />}
      </div>
    )},
    { key: 'owner', label: 'Owner', render: (row) => <span className="caption">{row.ownerEmail ?? '—'}</span> },
    { key: 'created', label: 'Created', render: (row) => <span className="mono" style={{ color: 'var(--fg-tertiary)', fontSize: 12 }}>{row.created}</span> },
    { key: 'status', label: 'Status', render: (row) => <Chip kind={row.status === 'active' ? 'ok' : 'err'}>{row.status}</Chip> },
    { key: 'actions', label: 'Actions', render: (row) => (
      <ActionCell actions={[
        { icon: <Pencil w={13} />, label: 'Rename', onClick: () => setRenaming(row) },
        ...(row.status === 'active' ? [{ icon: <AlertO w={13} />, label: 'Revoke', onClick: () => handleRevoke(row) }] : []),
        ...(row.status === 'revoked' ? [{ icon: <Trash2 w={13} />, label: 'Delete', danger: true, onClick: () => handleDelete(row) }] : []),
      ] as ActionDef[]} />
    )},
  ]

  return (
    <div className="page fade-in">
      {toast && <Toast msg={toast.msg} kind={toast.kind} />}
      {showGenerate && <GenerateModal onClose={() => setShowGenerate(false)} onCreated={handleCreated} />}
      {reveal && <RevealModal keyName={reveal.name} fullKey={reveal.fullKey} onClose={() => setReveal(null)} />}
      {renaming && (
        <RenameModal keyItem={renaming} onClose={() => setRenaming(null)} onSaved={k => {
          setKeys(prev => prev.map(x => x.id === k.id ? k : x))
          setRenaming(null)
          notify('Key renamed')
        }} />
      )}

      <Breadcrumbs pageId="adminkeys" />
      <PageHeader title="Admin API Keys" subtitle={<><span>Generate and manage API keys for backend-to-backend automation and console API access. Track creation dates, last-used timestamps, and revoke compromised keys.<br /></span><b className="mono">{keys.length}</b> keys · {activeCount} active · {revokedCount} revoked</>}
        actions={<><button className="icon-btn" onClick={load} title="Refresh"><Refresh w={14} /></button><button className="btn btn-primary" onClick={() => setShowGenerate(true)}><Key w={13} style={{ marginRight: 6 }} />Generate key</button></>} />

      {/* Search */}
      <div style={{ marginBottom: 12 }}>
        <input className="input" type="search" placeholder="Search by name, prefix, or owner…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        loading={loading}
        emptyState={search ? <EmptyState title="No keys match your search." /> : <EmptyState title="No admin keys yet. Generate one to get started." />}
        minWidth={640}
      />

      {/* Usage hint */}
      <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 8, background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', fontSize: 12, color: 'var(--fg-tertiary)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--fg-secondary)' }}>Usage:</strong>
        {' '}Pass the key as <span className="mono">Authorization: Bearer &lt;key&gt;</span> when calling{' '}
        <span className="mono">GET /metrics</span> or <span className="mono">POST /reload</span> on the gateway engine.
        Changes take effect after the next cache refresh (15 min) or an authenticated <span className="mono">/reload</span>.
      </div>
    </div>
  )
}
