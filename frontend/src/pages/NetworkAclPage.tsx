import React, { useEffect, useState } from 'react'
import { PageHeader, Breadcrumbs, Chip, EmptyState, LoadingState, FormModal } from '../components/ui'
import ActionCell from '../components/ui/ActionCell'
import { Plus, Pencil, Trash2, ChevronD, ChevronR } from '../components/ui/Icons'
import {
  getAclLists, createAclList, updateAclList, deleteAclList,
  getAclEntries, createAclEntry, updateAclEntry, deleteAclEntry,
  type AclList, type AclEntry, type AclListType, type AclEntryType,
} from '../api/networkAcl'
import type { TweakValues } from '../types'
import { useAuth } from '../context/AuthContext'
import { EntryModal, HelpModal } from './components/NetworkAclModals'

interface NetworkAclPageProps { tweaks: TweakValues }

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

// ── Create List Modal ─────────────────────────────────────────────────────────

interface CreateListModalProps {
  onSave: (payload: { name: string; list_type: AclListType; description: string }) => Promise<void>
  onClose: () => void
  initial?: AclList | null
}

function ListModal({ onSave, onClose, initial }: CreateListModalProps) {
  const [name, setName]         = useState(initial?.name ?? '')
  const [listType, setListType] = useState<AclListType>(initial?.list_type ?? 'blocklist')
  const [desc, setDesc]         = useState(initial?.description ?? '')
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr('Name is required'); return }
    setSaving(true); setErr('')
    try {
      await onSave({ name: name.trim(), list_type: listType, description: desc.trim() })
    } catch {
      setErr('Failed to save list')
      setSaving(false)
    }
  }

  return (
    <FormModal
      open
      title={initial ? 'Edit List' : 'New ACL List'}
      busy={saving}
      busyLabel="Saving…"
      submitLabel={initial ? 'Save Changes' : 'Create List'}
      onSubmit={handleSubmit}
      onClose={onClose}
      width={480}
    >
      <div style={{ marginBottom: 14 }}>
        <label className="label" style={{ display: 'block', marginBottom: 4 }}>Name</label>
        <input className="input" type="text" value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Office Allowlist" autoFocus />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label className="label">Type</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['allowlist', 'blocklist'] as AclListType[]).map(t => (
            <button key={t} type="button" onClick={() => setListType(t)}
              style={{
                flex: 1, padding: '8px 12px', borderRadius: 6, fontSize: 13,
                border: `2px solid ${listType === t ? (t === 'allowlist' ? 'var(--ok)' : 'var(--danger)') : 'var(--border)'}`,
                background: listType === t ? (t === 'allowlist' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)') : 'transparent',
                color: listType === t ? (t === 'allowlist' ? 'var(--ok)' : 'var(--danger)') : 'var(--fg-secondary)',
                fontWeight: listType === t ? 600 : 400,
                cursor: 'pointer',
              }}>
              {t === 'allowlist' ? '✓ Allowlist' : '✗ Blocklist'}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 6 }}>
          {listType === 'allowlist'
            ? 'Only IPs in this list are permitted; all others are blocked.'
            : 'IPs in this list are blocked; all others are permitted.'}
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label className="label" style={{ display: 'block', marginBottom: 4 }}>Description (optional)</label>
        <input className="input" type="text" value={desc}
          onChange={e => setDesc(e.target.value)}
          placeholder="Purpose or scope of this list" />
      </div>

      {err && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{err}</div>}
    </FormModal>
  )
}

// ── Add Entry Form ────────────────────────────────────────────────────────────

interface AddEntryFormProps {
  onSave: (payload: { value: string; entry_type: AclEntryType; note: string }) => Promise<void>
  onCancel: () => void
}

function AddEntryForm({ onSave, onCancel }: AddEntryFormProps) {
  const [entryType, setEntryType] = useState<AclEntryType>('ip')
  const [value, setValue] = useState('')
  const [note, setNote]   = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!value.trim()) { setErr('Value is required'); return }
    setSaving(true); setErr('')
    try {
      await onSave({ value: value.trim(), entry_type: entryType, note: note.trim() })
    } catch {
      setErr('Failed to add entry')
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '14px 12px', borderRadius: 6, background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)' }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select
            className="select"
            value={entryType}
            onChange={e => setEntryType(e.target.value as AclEntryType)}
            style={{ flex: '0 0 130px' }}
          >
            {ENTRY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input
            className="input"
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={ENTRY_PLACEHOLDERS[entryType]}
            style={{ flex: 1, minWidth: 140 }}
            autoFocus
          />
          <input
            className="input"
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Note (optional)"
            style={{ flex: 1, minWidth: 120 }}
          />
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>
          Format: <span className="mono">{ENTRY_PLACEHOLDERS[entryType]}</span> · Examples: {ENTRY_EXAMPLES[entryType].join(' · ')}
        </div>
        {err && <div style={{ color: 'var(--danger)', fontSize: 11 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ fontSize: 12 }}>
            {saving ? 'Adding…' : 'Add'}
          </button>
          <button type="button" className="btn" onClick={onCancel} style={{ fontSize: 12 }}>Cancel</button>
        </div>
      </form>
    </div>
  )
}

// ── List Card ─────────────────────────────────────────────────────────────────

interface ListCardProps {
  list: AclList
  isAdmin: boolean
  onEdit: () => void
  onDelete: () => void
}

function ListCard({ list, isAdmin, onEdit, onDelete }: ListCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [entries, setEntries]   = useState<AclEntry[]>([])
  const [loadingEntries, setLoadingEntries] = useState(false)
  const [showAdd, setShowAdd]   = useState(false)
  const [editingEntry, setEditingEntry] = useState<AclEntry | null>(null)

  async function toggleExpand() {
    if (!expanded && entries.length === 0) {
      setLoadingEntries(true)
      try {
        const data = await getAclEntries(list.id)
        setEntries(data)
      } finally {
        setLoadingEntries(false)
      }
    }
    setExpanded(e => !e)
  }

  async function handleAddEntry(payload: { value: string; entry_type: AclEntryType; note: string }) {
    const entry = await createAclEntry(list.id, payload)
    setEntries(prev => [...prev, entry])
    setShowAdd(false)
  }

  async function handleUpdateEntry(payload: { value: string; entry_type: AclEntryType; note: string; enabled: boolean }) {
    if (!editingEntry) return
    const updated = await updateAclEntry(list.id, editingEntry.id, payload)
    setEntries(prev => prev.map(e => e.id === editingEntry.id ? updated : e))
    setEditingEntry(null)
  }

  async function handleToggleEnabled(entry: AclEntry) {
    const updated = await updateAclEntry(list.id, entry.id, { enabled: !entry.enabled })
    setEntries(prev => prev.map(e => e.id === entry.id ? updated : e))
  }

  async function handleDeleteEntry(id: string) {
    if (!confirm('Delete this entry?')) return
    await deleteAclEntry(list.id, id)
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const entryCount = Number(list.entry_count ?? 0)
  const isAllow = list.list_type === 'allowlist'

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Card header */}
      <div
        style={{
          padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
          cursor: 'pointer', userSelect: 'none',
        }}
        onClick={toggleExpand}
      >
        <span style={{ color: 'var(--fg-tertiary)', flexShrink: 0 }}>
          {expanded ? <ChevronD w={14} /> : <ChevronR w={14} />}
        </span>
        <Chip kind={isAllow ? 'ok' : 'danger'}>
          {isAllow ? 'Allowlist' : 'Blocklist'}
        </Chip>
        <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{list.name}</span>
        {list.description && (
          <span style={{ fontSize: 12, color: 'var(--fg-tertiary)', flex: 1 }}>{list.description}</span>
        )}
        <span style={{ fontSize: 12, color: 'var(--fg-tertiary)', flexShrink: 0 }}>
          {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
        </span>
        {isAdmin && (
          <div onClick={e => e.stopPropagation()}>
            <ActionCell actions={[
              { icon: <Pencil w={13} />, label: 'Edit list', onClick: onEdit },
              { icon: <Trash2 w={13} />, label: 'Delete list', danger: true, onClick: onDelete },
            ]} />
          </div>
        )}
      </div>

      {/* Expanded entries */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px 16px' }}>
          {loadingEntries ? (
            <LoadingState message="Loading entries…" size="sm" />
          ) : (
            <>
              {!showAdd && entries.length === 0 && isAdmin && (
                <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--fg-tertiary)', fontSize: 12 }}>
                  No entries yet. Click below to add one.
                </div>
              )}
              {!showAdd && entries.length === 0 && !isAdmin && (
                <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', textAlign: 'center', padding: '16px 0' }}>No entries yet.</div>
              )}
              {entries.map(entry => (
                <div key={entry.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                  borderRadius: 6, marginBottom: 6,
                  background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
                  opacity: entry.enabled ? 1 : 0.45,
                }}>
                  <Chip kind={entry.entry_type === 'ip' ? 'info' : entry.entry_type === 'cidr' ? 'warn' : 'ok'} mono>
                    {ENTRY_TYPES.find(t => t.value === entry.entry_type)?.label ?? entry.entry_type}
                  </Chip>
                  <span className="mono" style={{ flex: 1, fontSize: 12, wordBreak: 'break-all' }}>{entry.value}</span>
                  {entry.note && <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginLeft: 8 }}>{entry.note}</span>}
                  {isAdmin && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 11, color: 'var(--fg-secondary)' }}>
                        <input
                          type="checkbox"
                          checked={entry.enabled}
                          onChange={() => handleToggleEnabled(entry)}
                          style={{ accentColor: 'var(--accent)' }}
                        />
                        on
                      </label>
                      <button className="icon-btn" title="Edit entry" onClick={() => setEditingEntry(entry)} style={{ color: 'var(--fg-secondary)' }}>
                        <Pencil w={12} />
                      </button>
                      <button className="icon-btn" title="Delete entry" onClick={() => handleDeleteEntry(entry.id)} style={{ color: 'var(--danger)' }}>
                        <Trash2 w={12} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {showAdd && (
                <AddEntryForm onSave={handleAddEntry} onCancel={() => setShowAdd(false)} />
              )}
              {isAdmin && !showAdd && (
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12, marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}
                  onClick={() => setShowAdd(true)}
                >
                  <Plus w={12} /> Add Entry
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Entry Modal for editing */}
      {editingEntry && (
       <EntryModal
           listName={list.name}
           initial={editingEntry as any}
           onSave={handleUpdateEntry}
           onClose={() => setEditingEntry(null)}
         />
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

const NetworkAclPage: React.FC<NetworkAclPageProps> = () => {
  const { user } = useAuth()
  const isAdmin = user?.groupId === '00000000-0000-0000-0000-000000000001'

  const [lists, setLists]     = useState<AclList[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editList, setEditList]     = useState<AclList | null>(null)
  const [toastMsg, setToastMsg]     = useState('')
  const [showHelp, setShowHelp]     = useState(false)

  function toast(msg: string) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 3000)
  }

  useEffect(() => {
    getAclLists().then(setLists).finally(() => setLoading(false))
  }, [])

  async function handleCreateList(payload: { name: string; list_type: AclListType; description: string }) {
    const list = await createAclList(payload)
    setLists(prev => [...prev, list])
    setShowCreate(false)
    toast('List created')
  }

  async function handleUpdateList(payload: { name: string; list_type: AclListType; description: string }) {
    if (!editList) return
    const updated = await updateAclList(editList.id, payload)
    setLists(prev => prev.map(l => l.id === editList.id ? { ...l, ...updated } : l))
    setEditList(null)
    toast('List updated')
  }

  async function handleDeleteList(id: string) {
    try {
      await deleteAclList(id)
      setLists(prev => prev.filter(l => l.id !== id))
      toast('List deleted')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete list'
      toast(msg.includes('assigned') ? 'Cannot delete: list is assigned to a gateway' : 'Delete failed')
    }
  }

 if (loading) {
    return (
      <div className="page fade-in">
        <Breadcrumbs pageId="network-acl" />
        <PageHeader title="Network ACL Lists" subtitle={<>Reusable allowlists and blocklists for gateway traffic filtering. <button className="btn btn-ghost btn-sm" onClick={() => setShowHelp(true)} style={{ padding: '0 4px', fontSize: 12, textDecoration: 'underline' }}>View formats &amp; examples</button></>} />
        <div className="page-content"><LoadingState /></div>
      </div>
    )
  }

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="network-acl" />
      <PageHeader title="Network ACL Lists" subtitle={<>Reusable allowlists and blocklists for gateway traffic filtering. <button className="btn btn-ghost btn-sm" onClick={() => setShowHelp(true)} style={{ padding: '0 4px', fontSize: 12, textDecoration: 'underline' }}>View formats &amp; examples</button></>}
        actions={isAdmin && <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus w={13} /> New List</button>} />

      {toastMsg && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '10px 16px', fontSize: 13,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>
          {toastMsg}
        </div>
      )}

      {(showCreate || editList) && (
        <ListModal
          onSave={editList ? handleUpdateList : handleCreateList}
          onClose={() => { setShowCreate(false); setEditList(null) }}
          initial={editList}
        />
      )}

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      {lists.length === 0 ? (
        <EmptyState title="No ACL lists yet. Create an allowlist or blocklist to get started." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lists.map(list => (
            <ListCard
              key={list.id}
              list={list}
              isAdmin={isAdmin}
              onEdit={() => setEditList(list)}
              onDelete={() => handleDeleteList(list.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default NetworkAclPage
