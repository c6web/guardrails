import React, { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { fmtDateTimeStr, copyToClipboard } from '../utils/format'
import { getGateways, checkGatewayHealth, deleteGateway, revealGatewayApiKeys, reloadGatewayDirect, fetchEngineInstanceId, type GatewayInstance, type GatewayHealth, type GatewayReloadResult } from '../api/gateways'
import { PageHeader, Breadcrumbs, StatCard, StatRow, EmptyState, ErrorState, LoadingState, ConfirmModal, Drawer, DataTable, type ColumnDef } from '../components/ui'
import { PulseInject, HealthBadge, GatewayFormModal, GatewayApiKeysModal, GatewayConnectModal, GatewayDetectionBanner } from './components/GatewayModals'
import { Toast } from './components/ProviderShared'
import ActionCell from '../components/ui/ActionCell'
import { Network, Plus, X, Pencil, Trash2, Refresh, Check, Key, Code } from '../components/ui/Icons'
import { Chip } from '../components/ui'
import type { TweakValues } from '../types'

interface GatewayPageProps { tweaks: TweakValues }

function DbDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 14, height: 14, borderRadius: '50%',
      fontSize: 8, fontWeight: 700, lineHeight: 1,
      color: '#fff',
      background: ok ? 'var(--ok, #76B400)' : 'var(--danger, #dc2626)',
    }} title={label}>{label}</span>
  )
}

const GatewayPage: React.FC<GatewayPageProps> = () => {
  const { user } = useAuth()
  const isAdmin = user?.groupId === '00000000-0000-0000-0000-000000000001'
  const gatewayUrlExample = `http://${new URL(window.location.origin).hostname}:8082`

  const [instances, setInstances] = useState<GatewayInstance[]>([])
  const [loading, setLoading]     = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [health, setHealth] = useState<Record<string, GatewayHealth | 'checking'>>({})
  const [healthChecking, setHealthChecking] = useState(false)
  const [engineInstanceId, setEngineInstanceId] = useState<Record<string, string | null>>({})

  const [showCreate, setShowCreate]       = useState(false)
  const [editTarget, setEditTarget]       = useState<GatewayInstance | null>(null)
  const [deleteTarget, setDeleteTarget]   = useState<GatewayInstance | null>(null)
  const [deleteBusy, setDeleteBusy]       = useState(false)
  const [viewTarget, setViewTarget]       = useState<GatewayInstance | null>(null)
  const [apiKeysTarget, setApiKeysTarget] = useState<GatewayInstance | null>(null)
  const [reloadingId, setReloadingId]     = useState<string | null>(null)

  const [showConnect, setShowConnect]   = useState(false)

  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)
  const [copiedId, setCopiedId] = useState(false)
  const [reloadResult, setReloadResult] = useState<GatewayReloadResult | null>(null)

  async function load() {
    setLoading(true); setLoadError(null)
    try {
      const data = await getGateways()
      setInstances(data)
    } catch (err) {
      setLoadError((err as Error).message || 'Failed to load gateway instances')
    } finally { setLoading(false) }
  }

  async function checkAllHealth(list: GatewayInstance[]) {
    if (!list.length) return
    setHealthChecking(true)
    const checking: Record<string, 'checking'> = {}
    list.forEach(g => { checking[g.id] = 'checking' })
    setHealth(h => ({ ...h, ...checking }))
    const results = await Promise.allSettled(list.map(g => checkGatewayHealth(g)))
    const updates: Record<string, GatewayHealth> = {}
    results.forEach((r, i) => {
      const id = list[i].id
      if (r.status === 'fulfilled') updates[id] = r.value
      else updates[id] = { id, status: 'down', latency_ms: 0, checked_at: new Date().toISOString() }
    })
    setHealth(h => ({ ...h, ...updates }))
    setHealthChecking(false)
  }

  useEffect(() => {
    load().then(() => {})
  }, [])

  useEffect(() => {
    if (!loading && instances.length) checkAllHealth(instances)
  }, [loading])

  function showToast(msg: string, kind: 'ok' | 'err') {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleSaved() {
    setShowCreate(false); setEditTarget(null)
    await load()
    showToast('Gateway instance saved', 'ok')
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteBusy(true)
    try {
      await deleteGateway(deleteTarget.id)
      setDeleteTarget(null)
      await load()
      showToast('Gateway instance removed', 'ok')
    } catch (err) {
      showToast((err as Error).message || 'Delete failed', 'err')
    } finally { setDeleteBusy(false) }
  }

  async function handleReload(instance: GatewayInstance) {
    setReloadingId(instance.id)
    setReloadResult(null)
    try {
      const keys = await revealGatewayApiKeys(instance.id)
      if (!keys.length) {
        setReloadResult({ success: false, message: 'No control key', error: 'Generate a gateway API key first' })
        return
      }
      for (const key of keys) {
        const result = await reloadGatewayDirect(instance, key.full_key)
        if (result.success) {
          result.key_prefix = key.key_prefix
          setReloadResult(result)
          return
        }
        if (result.error?.includes('401') || result.error?.includes('403')) continue
        setReloadResult(result)
        return
      }
      setReloadResult({ success: false, message: 'Reload failed', error: 'No valid key accepted by gateway' })
    } catch (err) {
      setReloadResult({ success: false, message: 'Reload failed', error: (err as Error).message })
    } finally {
      setReloadingId(null)
    }
  }

  const upCount   = instances.filter(g => (health[g.id] as GatewayHealth)?.status === 'up').length
  const downCount = instances.filter(g => (health[g.id] as GatewayHealth)?.status === 'down').length

  const columns: ColumnDef<GatewayInstance>[] = [
    {
      key: 'name',
      label: 'Name',
      width: 130,
      render: (g) => (
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.name}>
            {g.name}
          </div>
          {g.description && (
            <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.description}>
              {g.description}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'location',
      label: 'Location',
      width: 80,
      render: (g) => g.location
        ? <span style={{ color: 'var(--fg-secondary)', fontWeight: 600, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{g.location}</span>
        : <span style={{ color: 'var(--fg-tertiary)' }}>—</span>,
    },
    {
      key: 'url',
      label: 'URL',
      width: 140,
      render: (g) => (
        <span className="mono" title={g.url} style={{ fontSize: 12, color: 'var(--fg-secondary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {g.url}
        </span>
      ),
    },
    {
      key: 'firewall',
      label: 'Firewall',
      width: 90,
      render: (g) => (
        <span style={{
          color: g.defaultFirewallMode === 'block_all' ? 'var(--danger)' : 'var(--ok)',
          fontWeight: 600,
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}>
          {g.defaultFirewallMode === 'block_all' ? 'Block All' : 'Allow All'}
        </span>
      ),
    },
    {
      key: 'acl',
      label: 'ACL',
      width: 90,
      render: (g) => g.acl_list
        ? <div style={{ fontSize: 12 }}>
            <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.acl_list.name}</div>
            <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{g.acl_list.list_type}</div>
          </div>
        : <span style={{ color: 'var(--fg-tertiary)' }}>—</span>,
    },
    {
      key: 'status',
      label: 'Status',
      width: 110,
      render: (g) => {
        const h = health[g.id]
        const hObj = (h && h !== 'checking') ? h as GatewayHealth : null
        return (
          <>
            <HealthBadge health={h ?? null} />
            {hObj && (
              <>
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)', marginLeft: 4 }}>{hObj.latency_ms}ms</span>
                {typeof hObj.data_db === 'boolean' && (
                  <span style={{ marginLeft: 3, verticalAlign: 'middle' }} title={`data_db: ${hObj.data_db}, log_db: ${hObj.log_db}`}>
                    <DbDot ok={hObj.data_db} label="D" />
                    <DbDot ok={hObj.log_db ?? false} label="L" />
                  </span>
                )}
              </>
            )}
          </>
        )
      },
    },
    {
      key: 'cache',
      label: 'Cache',
      width: 140,
      render: (g) => {
        const h = health[g.id]
        const hObj = (h && h !== 'checking') ? h as GatewayHealth : null
        return (
          <div className="mono" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={hObj ? `Loaded: ${fmtDateTimeStr(hObj.cache_loaded_at)} · Next: ${hObj.cache_next_reload_at ?? '?'}` : undefined}>
            {hObj?.cache_next_reload_in
              ? hObj.cache_next_reload_in
              : hObj?.cache_loaded_at
                ? fmtDateTimeStr(hObj.cache_loaded_at)
                : <span style={{ color: 'var(--fg-tertiary)' }}>—</span>}
          </div>
        )
      },
    },
    {
      key: 'lastChecked',
      label: 'Last Checked',
      width: 110,
      render: (g) => {
        const h = health[g.id]
        const hObj = (h && h !== 'checking') ? h as GatewayHealth : null
        return (
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
            {fmtDateTimeStr(hObj?.health_timestamp || hObj?.checked_at || null)}
          </span>
        )
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      width: 160,
      render: (g) => (
        <div onClick={e => e.stopPropagation()}>
          <div className="row-tight" style={{ gap: 2 }}>
            {isAdmin && (
              <>
                <ActionCell actions={[
                  { icon: <Key w={13} />, label: 'API Keys', onClick: () => setApiKeysTarget(g) },
                  { icon: <Pencil w={13} />, label: 'Edit', onClick: () => setEditTarget(g) },
                  { icon: <Trash2 w={13} />, label: 'Remove', danger: true, onClick: () => setDeleteTarget(g) },
                ]} />
                <button className="icon-btn" title="Reload cache" disabled={reloadingId === g.id}
                  onClick={() => handleReload(g)} style={{ opacity: reloadingId === g.id ? 0.6 : 1 }}>
                  <Refresh w={13} style={{ animation: reloadingId === g.id ? 'spin 0.6s linear infinite' : 'none' }} />
                </button>
              </>
            )}
          </div>
        </div>
      ),
    },
  ]

  return (
    <div className="page fade-in">
      <PulseInject />
      <Breadcrumbs pageId="gateways" />
      <PageHeader title="Gateway Instances" subtitle="Register and monitor gateway-engine proxy instances across environments. Check live health status, manage connection details, view API keys, and trigger configuration reloads."
        actions={<><button className="btn btn-secondary" disabled={healthChecking || loading}
            onClick={() => checkAllHealth(instances)} title="Re-check health of all instances"><Refresh w={13} /> Check health</button>
          <button className="btn btn-secondary" onClick={() => setShowConnect(true)}><Code w={13} /> Connect your app</button>
          {isAdmin && (<button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus w={13} /> Add instance</button>)}</>} />

      {/* Stats */}
      <StatRow>
        <StatCard variant="compact" label="Total instances" value={instances.length} accent="var(--accent)" />
        <StatCard variant="compact" label="Up" value={upCount} accent="var(--ok)" />
        <StatCard variant="compact" label="Down" value={downCount} accent={downCount > 0 ? 'var(--danger)' : undefined} />
      </StatRow>

      <GatewayDetectionBanner instanceCount={instances.length} />

      {/* Content */}
      {loadError ? (
        <ErrorState title="Failed to load" message={loadError} onRetry={load} />
      ) : (
        <DataTable
          columns={columns}
          data={instances}
          rowKey={g => g.id}
          onRowClick={g => setViewTarget(g)}
          loading={loading}
          emptyState={
            <EmptyState
              icon={<Network w={32} />}
              title="No gateway instances registered"
              subtitle="Add instances to monitor their health and manage connectivity."
              action={isAdmin ? (
                <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
                  <Plus w={12} /> Add first instance
                </button>
              ) : undefined}
            />
          }
          minWidth={1050}
        />
      )}

      {/* Info callout */}
      {instances.length > 0 && (
        <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 8, background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', fontSize: 12, color: 'var(--fg-secondary)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Check w={14} style={{ marginTop: 1, flexShrink: 0, color: 'var(--accent)' }} />
          <span>
            Health is checked via <span className="mono">/health</span> on each instance URL (reads <span className="mono">status</span>, <span className="mono">timestamp</span>, <span className="mono">cache_*</span> and <span className="mono">*_db</span> from the response).
            {' '}To send a live test prompt to the gateway, go to <strong>Prompt Testing</strong>.
            {' '}Removing an instance from this list does not shut down the gateway process.
          </span>
        </div>
      )}

      {/* Modals */}
      {showConnect && (
        <GatewayConnectModal instances={instances} onClose={() => setShowConnect(false)} />
      )}
      {showCreate && (
        <GatewayFormModal onClose={() => setShowCreate(false)} onSave={handleSaved} gatewayUrlExample={gatewayUrlExample} />
      )}
      {editTarget && (
        <GatewayFormModal initial={editTarget} onClose={() => setEditTarget(null)} onSave={handleSaved} gatewayUrlExample={gatewayUrlExample} isOnlyInstance={instances.length === 1} />
      )}
      {deleteTarget && (
        <ConfirmModal
          open={true}
          title="Remove gateway instance?"
          message={
            <p style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>
              <b>{deleteTarget.name}</b> will be removed from the console. This does not shut down the gateway process.
            </p>
          }
          confirmLabel="Remove"
          danger
          busy={deleteBusy}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
      {apiKeysTarget && (
        <GatewayApiKeysModal instance={apiKeysTarget} onClose={() => { setApiKeysTarget(null); load() }} />
      )}
      {toast && <Toast msg={toast.msg} kind={toast.kind} />}
      {reloadResult && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 300,
          width: 320, borderRadius: 10, overflow: 'hidden',
          boxShadow: 'var(--shadow-2)',
          border: `1px solid ${reloadResult.success ? 'var(--ok)' : 'var(--danger)'}`,
          background: 'var(--bg-surface)',
        }}>
          {/* Header bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 12px',
            background: reloadResult.success ? 'var(--ok-bg)' : 'var(--danger-bg)',
            borderBottom: `1px solid ${reloadResult.success ? 'var(--ok)' : 'var(--danger)'}`,
          }}>
            {reloadResult.success
              ? <Check w={13} style={{ color: 'var(--ok)', flexShrink: 0 }} />
              : <span style={{ fontSize: 13, lineHeight: 1 }}>✕</span>}
            <span style={{ fontWeight: 600, fontSize: 13, color: reloadResult.success ? 'var(--ok)' : 'var(--danger)', flex: 1 }}>
              {reloadResult.success ? 'Cache reload triggered' : 'Reload failed'}
            </span>
            <button className="icon-btn" style={{ padding: 0 }} onClick={() => setReloadResult(null)}>
              <X w={12} />
            </button>
          </div>
          {/* Detail rows */}
          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12 }}>
            {reloadResult.success ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--fg-tertiary)' }}>Gateway</span>
                  <span style={{ fontWeight: 500 }}>{reloadResult.gateway}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--fg-tertiary)' }}>URL</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--fg-secondary)' }}>{reloadResult.gateway_url}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--fg-tertiary)' }}>Key used</span>
                  <span className="mono" style={{ fontSize: 11 }}>{reloadResult.key_prefix}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--fg-tertiary)' }}>Timestamp</span>
                  <span className="mono" style={{ fontSize: 11 }}>{reloadResult.timestamp}</span>
                </div>
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--fg-tertiary)' }}>
                  All caches refreshed. Check gateway logs for per-cache detail.
                </div>
              </>
            ) : (
              <>
                <div style={{ color: 'var(--danger)', fontWeight: 500 }}>{reloadResult.error || reloadResult.message}</div>
                {reloadResult.retry_after && (
                  <div style={{ color: 'var(--fg-tertiary)' }}>Retry in {reloadResult.retry_after}s</div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Fetch engine instance ID when drawer opens */}
      {viewTarget && (() => {
        if (engineInstanceId[viewTarget.id] === undefined) {
          setEngineInstanceId(p => ({ ...p, [viewTarget.id]: null }))
          revealGatewayApiKeys(viewTarget.id)
            .then(keys => {
              const active = keys.find(k => k.status === 'active') ?? keys[0]
              if (active) return fetchEngineInstanceId(viewTarget.url, active.full_key)
              return null
            })
            .then(id => {
              if (id !== undefined) setEngineInstanceId(p => ({ ...p, [viewTarget.id]: id }))
            })
            .catch(() => {})
        }
        return null
      })()}

      {/* View drawer */}
      <Drawer
        open={!!viewTarget}
        title={viewTarget ? (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="crumbs" style={{ marginBottom: 4 }}>
                <span>Settings</span><span className="sep">/</span><span className="here">Instance</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.2 }}>{viewTarget.name}</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 4 }}>{viewTarget.id}</div>
            </div>
          ) : <></>}
          onClose={() => setViewTarget(null)}
          zIndex={210}
          footer={viewTarget && isAdmin && (
            <>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => { setViewTarget(null); setDeleteTarget(viewTarget) }}>
                Remove
              </button>
              <div style={{ flex: 1 }} />
              <button className="btn btn-secondary btn-sm" disabled={reloadingId === viewTarget?.id}
                onClick={() => handleReload(viewTarget!)} style={{ opacity: reloadingId === viewTarget?.id ? 0.6 : 1 }}>
                {reloadingId === viewTarget?.id
                  ? <LoadingState message="Reloading…" size="sm" />
                  : <><Refresh w={12} /> Reload cache</>}
              </button>
              <button className="btn btn-primary" onClick={() => { setViewTarget(null); setEditTarget(viewTarget) }}>
                Edit
              </button>
            </>
          )}
        >
          {viewTarget && (
          <div style={{ padding: '16px 18px', overflowY: 'auto' }}>
            <dl className="kv">
              {viewTarget.description && (
                <>
                  <dt>description</dt>
                  <dd>{viewTarget.description}</dd>
                </>
              )}
              <dt>location</dt>
              <dd>{viewTarget.location || '—'}</dd>
              <dt>url</dt>
              <dd className="mono">{viewTarget.url}</dd>
              <dt>Gateway ID</dt>
              <dd>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="mono" style={{ wordBreak: 'break-all' }}>{viewTarget.id}</span>
                  <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}
                    onClick={async () => { await copyToClipboard(viewTarget.id); setCopiedId(true); setTimeout(() => setCopiedId(false), 1800) }}>
                    {copiedId ? <><Check w={11} /> Copied</> : 'Copy'}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 4 }}>
                  Paste into the engine's <span className="mono">GATEWAY_INSTANCE_ID</span> env var.
                </div>
              </dd>
              <dt>connection</dt>
              <dd>
                {engineInstanceId[viewTarget.id] === undefined
                  ? <span style={{ color: 'var(--fg-tertiary)' }}>checking…</span>
                  : engineInstanceId[viewTarget.id] === null
                    ? <span style={{ color: 'var(--fg-tertiary)' }}>offline — engine not reachable</span>
                    : engineInstanceId[viewTarget.id] === viewTarget.id
                      ? <span style={{ color: 'var(--ok)' }}><Check w={11} /> connected</span>
                      : <span style={{ color: 'var(--danger)' }}>mismatch — engine reports <span className="mono">{engineInstanceId[viewTarget.id]}</span></span>}
              </dd>
              <dt>control key</dt>
              <dd>{viewTarget.hasActiveKey ? `configured (${viewTarget.activeKeyPrefix}, v${viewTarget.activeKeyVersion})` : 'not set'}</dd>
              <dt>default firewall mode</dt>
              <dd>
                <span style={{
                  display: 'inline-block',
                  padding: '4px 8px',
                  borderRadius: 4,
                  background: viewTarget.defaultFirewallMode === 'block_all' ? 'var(--danger-bg)' : 'var(--ok-bg)',
                  color: viewTarget.defaultFirewallMode === 'block_all' ? 'var(--danger)' : 'var(--ok)',
                  fontWeight: 500,
                  fontSize: 12,
                }}>
                  {viewTarget.defaultFirewallMode === 'block_all' ? '🚫 Block All' : '✓ Allow All'}
                </span>
                <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 6 }}>
                  When no ACL is assigned
                </div>
              </dd>
              <dt>network acl</dt>
              <dd>
                {viewTarget.acl_list
                  ? <div>
                      <div style={{ fontWeight: 500 }}>{viewTarget.acl_list.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>Type: {viewTarget.acl_list.list_type}</div>
                      <div style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>Entries: {viewTarget.acl_list.entry_count}</div>
                    </div>
                  : '—'}
              </dd>
              <dt>created</dt>
              <dd className="mono">{fmtDateTimeStr(viewTarget.createdAt)}</dd>
              <dt>updated</dt>
              <dd className="mono">{fmtDateTimeStr(viewTarget.updatedAt)}</dd>

              {health[viewTarget.id] && health[viewTarget.id] !== 'checking' && (() => {
                const h = health[viewTarget.id] as GatewayHealth
                return (
                  <>
                    <div style={{ gridColumn: '1 / -1', height: 1, background: 'var(--border-subtle)', margin: '8px 0' }} />
                    <dt style={{ alignSelf: 'center' }}>health</dt>
                    <dd>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Chip kind={h.status === 'up' ? 'ok' : 'danger'}>{h.health_status || (h.status === 'up' ? 'up' : 'down')}</Chip>
                        <Chip kind="muted">{h.latency_ms}ms</Chip>
                        <Chip kind="muted">{fmtDateTimeStr(h.checked_at)}</Chip>
                      </div>
                    </dd>
                    {typeof h.data_db === 'boolean' && (
                      <>
                        <dt>cache loaded</dt>
                        <dd className="mono">{fmtDateTimeStr(h.cache_loaded_at) || '—'}</dd>
                        <dt>cache next reload</dt>
                        <dd className="mono">{fmtDateTimeStr(h.cache_next_reload_at) || '—'} {h.cache_next_reload_in ? `(${h.cache_next_reload_in})` : ''}</dd>
                        <dt>data db</dt>
                        <dd>{h.data_db ? <Chip kind="ok">connected</Chip> : <Chip kind="danger">disconnected</Chip>}</dd>
                        <dt>log db</dt>
                        <dd>{h.log_db ? <Chip kind="ok">connected</Chip> : <Chip kind="danger">disconnected</Chip>}</dd>
                      </>
                    )}
                  </>
                )
              })()}
            </dl>
          </div>
          )}
        </Drawer>
    </div>
  )
}

export default GatewayPage
