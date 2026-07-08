import React from 'react'
import { PageHeader, Breadcrumbs, Chip, Field, KV, StatCard, StatRow, FORM_INPUT_STYLE, EmptyState, ErrorState, LoadingState, ConfirmModal, Drawer, DataTable, FormModal, Toast, useToast, type ColumnDef } from '../components/ui'
import { Refresh, AlertO, Copy, X, Check, Lock, Key, Eye, EyeOff, Pencil, Trash2 } from '../components/ui/Icons'
import ActionCell from '../components/ui/ActionCell'
import { getApiKeys, getApiKeyVersions, updateApiKey, rotateApiKey, revokeApiKey, revokeKeyVersion, deleteApiKey, revealApiKey } from '../api/apikeys'
import type { UIKey, UIKeyVersion } from '../api/apikeys'
import { copyToClipboard } from '../utils/format'
import type { TweakValues } from '../types/index'

interface ApiKeysPageProps { tweaks: TweakValues }

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false)
 async function handleCopy() {
    try {
      await copyToClipboard(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error('Copy failed', e)
    }
  }
  return (
    <button className="icon-btn" onClick={handleCopy} title="Copy">
      {copied ? <Check w={11} /> : <Copy w={11} />}
    </button>
  )
}

function KeyValueDisplay({ keyId, prefix }: { keyId: string; prefix: string }) {
  const [revealed, setRevealed] = React.useState<string | null>(null)
  const [visible, setVisible]   = React.useState(false)
  const [loading, setLoading]   = React.useState(false)
  const [copied, setCopied]     = React.useState(false)

  async function handleToggle() {
    if (revealed) { setVisible(v => !v); return }
    setLoading(true)
    try {
      const data = await revealApiKey(keyId)
      setRevealed(data.full_key)
      setVisible(true)
    } catch {
      // silently fail — show "not available" state
    } finally { setLoading(false) }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)' }}>
      <span className="mono" style={{ flex: 1, fontSize: 11, wordBreak: 'break-all', lineHeight: 1.5 }}>
        {visible && revealed ? revealed : `${prefix}_${'*'.repeat(32)}`}
      </span>
      <button className="icon-btn" title={visible ? 'Hide' : 'Reveal'} onClick={handleToggle} disabled={loading}>
        {loading
          ? <LoadingState size="sm" message="" />
          : visible ? <EyeOff w={13} /> : <Eye w={13} />}
      </button>
      {revealed && (
        <button className="icon-btn" title="Copy" onClick={async () => {
          try { await copyToClipboard(revealed); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
        }}>
          {copied ? <Check w={13} /> : <Copy w={13} />}
        </button>
      )}
    </div>
  )
}

// ── Edit key modal ────────────────────────────────────────────────────────────

function EditKeyModal({ apiKey: k, onClose, onSaved }: {
  apiKey: UIKey; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm]     = React.useState({ name: k.name })
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [busy, setBusy]     = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs['name'] = 'Required'
    if (Object.keys(errs).length) { setErrors(errs); return }
    setBusy(true)
    try {
      await updateApiKey(k.id, { name: form.name.trim() })
      onSaved()
    } catch (err) {
      setErrors({ name: (err as Error).message || 'Update failed' })
    } finally { setBusy(false) }
  }

  return (
    <FormModal
      open
      title="Edit key"
      busy={busy}
      busyLabel="Saving…"
      submitLabel="Save changes"
      onSubmit={handleSubmit}
      onClose={onClose}
    >
      <Field label="Key name *" error={errors['name']}>
        <input className="input" style={FORM_INPUT_STYLE} value={form.name}
          onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setErrors(er => ({ ...er, name: '' })) }}
          autoFocus />
      </Field>
      <Field label="Application">
        <div style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', fontSize: 12, color: 'var(--fg-secondary)' }}>
          {k.appName || <span className="caption">—</span>}
          <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginLeft: 8 }}>App cannot be changed after creation</span>
        </div>
      </Field>
    </FormModal>
  )
}

// ── Grace countdown helper ────────────────────────────────────────────────────

function graceCountdown(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'expired'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h > 0) return `${h}h ${m}m remaining`
  return `${m}m remaining`
}

// ── Detail drawer ─────────────────────────────────────────────────────────────

function DetailDrawer({ apiKey: k, open, onClose, onEdit, onRotate, onRevoke, onDelete, onVersionRevoked }: {
  apiKey: UIKey; open?: boolean; onClose: () => void
  onEdit: () => void; onRotate: () => void; onRevoke: () => void; onDelete: () => void
  onVersionRevoked: () => void
}) {
  const [versions, setVersions]     = React.useState<UIKeyVersion[]>([])
  const [graceHours, setGraceHours] = React.useState(24)
  const [vLoading, setVLoading]     = React.useState(true)
  const [revoking, setRevoking]     = React.useState<string | null>(null)
  const [, forceRender]             = React.useReducer(x => x + 1, 0)

  React.useEffect(() => {
    getApiKeyVersions(k.id).then(({ versions: v, graceHours: gh }) => {
      setVersions(v); setGraceHours(gh); setVLoading(false)
    }).catch(() => setVLoading(false))
  }, [k.id])

  React.useEffect(() => {
    const t = setInterval(forceRender, 60000)
    return () => clearInterval(t)
  }, [])

  async function handleForceRevoke(v: UIKeyVersion) {
    setRevoking(v.id)
    try {
      await revokeKeyVersion(k.id, v.id)
      setVersions(vs => vs.map(x => x.id === v.id ? { ...x, status: 'revoked', graceExpiresAt: null } : x))
      onVersionRevoked()
    } finally { setRevoking(null) }
  }

  const superseded = versions.filter(v => v.status === 'superseded')
  const isRevoked  = k.status === 'revoked'

  return (
    <>
      <Drawer
        open={open}
        title={
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Key w={14} style={{ color: 'var(--accent)' }} />
              <span style={{ fontWeight: 600, fontSize: 14 }}>{k.name}</span>
              {k.status === 'revoked'    && <Chip kind="muted" dot>revoked</Chip>}
              {k.status === 'rotate-due' && <Chip kind="warn"  dot>rotation due</Chip>}
            </div>
            {k.appName && (
              <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 2 }}>{k.appName}</div>
            )}
          </>
        }
        onClose={onClose}
        footer={
          <>
            {isRevoked ? (
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={onDelete}>
                <Trash2 w={13} /> Delete record
              </button>
            ) : (
              <>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={onRevoke}>Revoke</button>
                <div style={{ flex: 1 }} />
                <button className="btn btn-secondary" onClick={onRotate}><Refresh w={12} /> Rotate</button>
                <button className="btn btn-primary" onClick={onEdit}>Edit</button>
              </>
            )}
          </>
        }
      >
        <div style={{ padding: '16px 20px' }}>
          {/* Key value */}
          <div style={{ marginBottom: 18 }}>
            <div className="label" style={{ marginBottom: 6 }}>API key</div>
            <KeyValueDisplay keyId={k.id} prefix={k.prefix} />
          </div>

          {/* Metadata */}
          <KV rows={[
            { label: 'App', value: <span style={{ fontSize: 12 }}>{k.appName || <span className="caption">—</span>}</span> },
            { label: 'Status', value: (
              <>
                {k.status === 'active'     && <Chip kind="ok"   dot>active</Chip>}
                {k.status === 'rotate-due' && <Chip kind="warn" dot>rotation due</Chip>}
                {k.status === 'revoked'    && <Chip kind="muted" dot>revoked</Chip>}
              </>
            ) },
            { label: 'Rotation', value: <span style={{ fontSize: 12, color: k.status === 'rotate-due' ? 'var(--warning)' : undefined }}>{k.rotates}</span>, mono: true },
            { label: 'Created', value: <span style={{ fontSize: 12 }}>{k.created}</span>, mono: true },
            { label: 'Last used', value: <span style={{ fontSize: 12 }}>{k.lastUsed}</span>, mono: true },
          ]} labelWidth={100} gap={8} style={{ marginBottom: 18 }} />

          {/* Grace period warning */}
          {!vLoading && superseded.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ padding: '12px 14px', borderRadius: 6, background: 'var(--warning-bg)', border: '1px solid var(--warning)' }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--warning)', marginBottom: 8 }}>
                  Previous key in grace period ({graceHours}h transition window)
                </div>
                {superseded.map(v => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span className="mono" style={{ fontSize: 12 }}>{v.prefix}_***</span>
                        <span style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>v{v.version}</span>
                      </div>
                      {v.graceExpiresAt && (
                        <div style={{ fontSize: 11, color: 'var(--warning)' }}>{graceCountdown(v.graceExpiresAt)}</div>
                      )}
                    </div>
                    {!isRevoked && (
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', fontSize: 11 }}
                        disabled={revoking === v.id} onClick={() => handleForceRevoke(v)}>
                        {revoking === v.id ? 'Revoking…' : 'Force revoke'}
                      </button>
                    )}
                  </div>
                ))}
                <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 8 }}>
                  The previous key still works until the grace period ends or you force-revoke it.
                </div>
              </div>
            </div>
          )}

          {/* Version history */}
          {!vLoading && versions.length > 0 && (
            <div>
              <div className="label" style={{ marginBottom: 8 }}>Key history</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {versions.map(v => (
                  <div key={v.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 10px', borderRadius: 6,
                    background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
                    opacity: v.status === 'revoked' ? 0.6 : 1,
                  }}>
                    <span style={{ fontSize: 10, color: 'var(--fg-tertiary)', width: 18, textAlign: 'right', flexShrink: 0 }}>v{v.version}</span>
                    <span className="mono" style={{ fontSize: 11, flex: 1 }}>{v.prefix}_***</span>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>{v.created}</span>
                    {v.status === 'active'     && <Chip kind="ok"   dot>active</Chip>}
                    {v.status === 'superseded' && <Chip kind="warn" dot>grace</Chip>}
                    {v.status === 'revoked'    && <Chip kind="muted">revoked</Chip>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {vLoading && <LoadingState message="Loading versions…" size="sm" />}
        </div>
      </Drawer>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type TabId = 'active' | 'revoked'

const ApiKeysPage: React.FC<ApiKeysPageProps> = () => {
  const [keys, setKeys]           = React.useState<UIKey[]>([])
  const [loading, setLoading]     = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [busy, setBusy]           = React.useState(false)
  const [tab, setTab]             = React.useState<TabId>('active')

  const [search, setSearch] = React.useState('')

  const [editTarget,   setEditTarget]   = React.useState<UIKey | null>(null)
  const [rotateTarget, setRotateTarget] = React.useState<UIKey | null>(null)
  const [revokeTarget, setRevokeTarget] = React.useState<UIKey | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<UIKey | null>(null)
  const [detailKey,    setDetailKey]    = React.useState<UIKey | null>(null)
  const { toast, show: showToast } = useToast()

  const load = React.useCallback(async () => {
    setLoading(true); setLoadError(null)
    try { setKeys(await getApiKeys()) }
    catch (err) { setLoadError((err as Error).message || 'Failed to load keys') }
    finally { setLoading(false) }
  }, [])

  React.useEffect(() => { load() }, [load])

  const activeKeys  = React.useMemo(() => keys.filter(k => k.status !== 'revoked'), [keys])
  const revokedKeys = React.useMemo(() => keys.filter(k => k.status === 'revoked'),  [keys])
  const rotateDue   = React.useMemo(() => activeKeys.filter(k => k.status === 'rotate-due'), [activeKeys])

  const sourceKeys = tab === 'active' ? activeKeys : revokedKeys

  const filtered = React.useMemo(() => {
    if (!search.trim()) return sourceKeys
    const q = search.toLowerCase()
    return sourceKeys.filter(k =>
      k.name.toLowerCase().includes(q) ||
      k.prefix.toLowerCase().includes(q) ||
      (k.appName ?? '').toLowerCase().includes(q)
    )
  }, [sourceKeys, search])

  // Group by app for display
  const grouped = React.useMemo(() => {
    const map = new Map<string, { appName: string; keys: UIKey[] }>()
    for (const k of filtered) {
      const appKey = k.appId || 'unknown'
      if (!map.has(appKey)) map.set(appKey, { appName: k.appName ?? k.appId ?? 'Unknown app', keys: [] })
      map.get(appKey)!.keys.push(k)
    }
    return [...map.entries()].sort((a, b) => a[1].appName.localeCompare(b[1].appName))
  }, [filtered])

  async function handleEdit(_k: UIKey) {
    setEditTarget(null); setDetailKey(null)
    showToast('Key updated')
    await load()
  }
  async function handleRotate(k: UIKey) {
    setRotateTarget(null); setDetailKey(null); setBusy(true)
    try {
      await rotateApiKey(k.id)
      showToast(`${k.name} rotated`)
      await load()
    } catch (err) {
      showToast((err as Error).message || 'Rotate failed', 'err')
    } finally { setBusy(false) }
  }
  async function handleRevoke(k: UIKey) {
    setRevokeTarget(null); setDetailKey(null); setBusy(true)
    try {
      await revokeApiKey(k.id)
      showToast(`${k.name} revoked`)
      await load()
    } catch (err) {
      showToast((err as Error).message || 'Revoke failed', 'err')
    } finally { setBusy(false) }
  }
  async function handleDelete(k: UIKey) {
    setDeleteTarget(null); setDetailKey(null); setBusy(true)
    try {
      await deleteApiKey(k.id)
      showToast(`${k.name} deleted`)
      await load()
    } catch (err) {
      showToast((err as Error).message || 'Delete failed', 'err')
    } finally { setBusy(false) }
  }

  function openDetail(k: UIKey) { setDetailKey(k) }

  const columns = React.useMemo<ColumnDef<UIKey>[]>(() => [
    {
      key: 'name',
      label: 'Key name',
      render: (k) => (
        <div style={{ fontWeight: 500, fontSize: 13 }}>{k.name}</div>
      ),
    },
    {
      key: 'prefix',
      label: 'Prefix',
      render: (k) => (
        <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-secondary)' }}>{k.prefix}</span>
          <CopyButton text={k.prefix} />
        </div>
      ),
    },
    {
      key: 'lastUsed',
      label: 'Last used',
      render: (k) => (
        <span className="mono" style={{ color: 'var(--fg-tertiary)', fontSize: 11 }}>{k.lastUsed}</span>
      ),
    },
    {
      key: 'rotation',
      label: 'Rotation',
      render: (k) => (
        <span className="mono" style={{ fontSize: 11, color: k.status === 'rotate-due' ? 'var(--warning)' : 'var(--fg-secondary)' }}>
          {k.rotates}
        </span>
      ),
    },
    {
      key: 'created',
      label: 'Created',
      render: (k) => (
        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>{k.created}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (k) => (
        <>
          {k.status === 'active'     && <Chip kind="ok"   dot>active</Chip>}
          {k.status === 'rotate-due' && <Chip kind="warn" dot>rotation due</Chip>}
          {k.status === 'revoked'    && <Chip kind="muted" dot>revoked</Chip>}
        </>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (k) => (
        <div onClick={e => e.stopPropagation()} className="row-tight" style={{ gap: 2 }}>
          <ActionCell actions={[
            { icon: <Eye w={14} />, label: 'View details', onClick: () => openDetail(k) },
          ]} />
          {k.status !== 'revoked' ? (
            <ActionCell actions={[
              { icon: <Pencil w={13} />, label: 'Edit', onClick: () => setEditTarget(k) },
              { icon: <Refresh w={14} />, label: 'Rotate', onClick: () => setRotateTarget(k) },
              { icon: <X w={14} />, label: 'Revoke', danger: true, onClick: () => setRevokeTarget(k) },
            ]} />
          ) : (
            <ActionCell actions={[
              { icon: <Trash2 w={14} />, label: 'Delete permanently', danger: true, onClick: () => setDeleteTarget(k) },
            ]} />
          )}
        </div>
      ),
    },
  ], [openDetail, setEditTarget, setRotateTarget, setRevokeTarget, setDeleteTarget])

  const tabStyle = (id: TabId): React.CSSProperties => ({
    padding: '7px 14px', fontSize: 13, fontWeight: tab === id ? 600 : 400,
    background: 'none', border: 'none', cursor: 'pointer',
    borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent',
    color: tab === id ? 'var(--fg-primary)' : 'var(--fg-tertiary)',
    marginBottom: -1,
  })

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="apikeys" />
      <PageHeader title="API keys" subtitle="Manage bearer tokens that authenticate applications to the gateway. Create new keys, copy key values on creation, revoke access, and filter by app or status." />

      {/* Info banner */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'flex-start',
        padding: '10px 14px', borderRadius: 8, marginBottom: 16,
        background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
        fontSize: 13, color: 'var(--fg-secondary)',
      }}>
        <Key w={14} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
        <span>
          API keys are managed per application. To generate a new key, go to{' '}
          <strong>Apps</strong> → open an app → <strong>API Keys</strong> tab.
        </span>
      </div>

      {/* Stats */}
      <StatRow>
        <StatCard variant="compact" label="Active keys" value={activeKeys.length} accent="var(--accent)" />
        <StatCard variant="compact" label="Rotation due" value={rotateDue.length}
          accent={rotateDue.length > 0 ? 'var(--warning)' : undefined} />
        <StatCard variant="compact" label="Revoked keys" value={revokedKeys.length} />
        <StatCard variant="compact" label="Total apps" value={new Set(keys.map(k => k.appId)).size} />
      </StatRow>

      {/* Rotation banner */}
      {rotateDue.length > 0 && (
        <div className="card" style={{
          padding: 14, marginBottom: 14, borderColor: 'var(--warning)', background: 'var(--warning-bg)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <AlertO w={20} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              {rotateDue.length} key{rotateDue.length > 1 ? 's are' : ' is'} past rotation window
            </div>
            <div className="caption" style={{ fontSize: 12 }}>
              {rotateDue.map((k, i) => <span key={k.id}>{i > 0 && ', '}<span className="mono">{k.name}</span> ({k.appName})</span>)}
            </div>
          </div>
          {rotateDue.length === 1 && (
            <button className="btn btn-primary btn-sm" onClick={() => setRotateTarget(rotateDue[0])}>Rotate now</button>
          )}
        </div>
      )}

      {/* Tabs + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 16, borderBottom: '1px solid var(--border-subtle)' }}>
        <button style={tabStyle('active')} onClick={() => setTab('active')}>
          Active
          <span className="mono" style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>{activeKeys.length}</span>
        </button>
        <button style={tabStyle('revoked')} onClick={() => setTab('revoked')}>
          Revoked
          <span className="mono" style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>{revokedKeys.length}</span>
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ paddingBottom: 4 }}>
          <input className="input" type="search" placeholder="Search name, app, prefix…"
            value={search} onChange={e => setSearch(e.target.value)} style={{ width: 220 }} />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <LoadingState />
      ) : loadError ? (
        <ErrorState title="Failed to load keys" message={loadError} onRetry={load} />
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={<Lock w={28} />}
          title={search ? 'No keys match this search.' : tab === 'active' ? 'No active keys.' : 'No revoked keys.'}
          subtitle={!search && tab === 'active' ? 'Go to Apps → open an app → API Keys tab to generate a key.' : undefined}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {grouped.map(([appId, { appName, keys: appKeys }]) => (
            <div key={appId} className="card" style={{ padding: 0 }}>
              {/* App header */}
              <div style={{
                padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Key w={13} style={{ color: 'var(--accent)' }} />
                <span style={{ fontWeight: 600, fontSize: 13 }}>{appName}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>{appId}</span>
                <div style={{ flex: 1 }} />
                <Chip kind={tab === 'active' ? 'ok' : 'muted'} dot>
                  {appKeys.length} {tab === 'active' ? 'active' : 'revoked'}
                </Chip>
              </div>

              {/* Keys table */}
              <DataTable
                card={false}
                columns={columns}
                data={appKeys}
                rowKey={(k) => k.id}
                onRowClick={openDetail}
                minWidth={640}
                rowStyle={(k) => ({ opacity: k.status === 'revoked' ? 0.6 : 1 })}
              />
            </div>
          ))}
        </div>
      )}

      {editTarget && (
        <EditKeyModal apiKey={editTarget} onClose={() => setEditTarget(null)} onSaved={() => handleEdit(editTarget)} />
      )}
      {rotateTarget && (
        <ConfirmModal open={true} title="Rotate key"
          message={<>Rotate <strong>{rotateTarget.name}</strong>? The old key enters a grace period before expiring.</>}
          confirmLabel="Rotate key"
          onClose={() => setRotateTarget(null)} onConfirm={() => handleRotate(rotateTarget)} busy={busy} />
      )}
      {revokeTarget && (
        <ConfirmModal open={true} title="Revoke key"
          message={<>Permanently revoke <strong>{revokeTarget.name}</strong>? Any app using this key will stop working. This cannot be undone.</>}
          confirmLabel="Revoke key" danger
          onClose={() => setRevokeTarget(null)} onConfirm={() => handleRevoke(revokeTarget)} busy={busy} />
      )}
      {deleteTarget && (
        <ConfirmModal open={true} title="Delete key record"
          message={<>
            <div>Permanently delete <strong>{deleteTarget.name}</strong> from the database?</div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--fg-tertiary)' }}>
              This removes the record entirely — audit history for this key will be lost. This cannot be undone.
            </div>
          </>}
          confirmLabel="Delete permanently" danger
          onClose={() => setDeleteTarget(null)} onConfirm={() => handleDelete(deleteTarget)} busy={busy} />
      )}
      {detailKey && (
        <DetailDrawer apiKey={detailKey}
          onClose={() => setDetailKey(null)}
          onEdit={() => { setDetailKey(null); setEditTarget(detailKey) }}
          onRotate={() => { setDetailKey(null); setRotateTarget(detailKey) }}
          onRevoke={() => { setDetailKey(null); setRevokeTarget(detailKey) }}
          onDelete={() => { setDetailKey(null); setDeleteTarget(detailKey) }}
          onVersionRevoked={load} />
      )}
      {toast && <Toast {...toast} />}
    </div>
  )
}

export default ApiKeysPage
