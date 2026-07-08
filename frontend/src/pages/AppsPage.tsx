import React from 'react'
import { Chip } from '../components/ui'
import { Plus, Cpu, Eye, Pencil, Trash2, Shield } from '../components/ui/Icons'
import KeyRevealModal from '../components/ui/KeyRevealModal'
import { getApps, deleteApp, bulkDeleteApps, getQuotaUsageSummary, type QuotaSummaryEntry } from '../api/apps'
import { getProviders, type AiProvider } from '../api/providers'
import { getOrganizations } from '../api/organizations'
import type { App as UIApp } from '../types'
import type { TweakValues } from '../types/index'
import { PageHeader, Breadcrumbs, StatCard, StatRow, EmptyState, ErrorState, LoadingState, DataTable, type ColumnDef } from '../components/ui'
import { Toast } from './components/AppsShared'
import { AppFormDrawer, ConfirmModal } from './components/AppsModals'
import { DetailDrawer } from './components/AppsDetail'
import { AppsSecurityRulesDrawer } from './components/AppsSecurityRulesDrawer'
import ActionCell from '../components/ui/ActionCell'
import { FrameworkProvider } from '../context/FrameworkContext'

interface AppsPageProps { tweaks: TweakValues }

// ── Main page ─────────────────────────────────────────────────────────────────

const AppsPageInner: React.FC<AppsPageProps> = () => {
  const [apps, setApps]               = React.useState<UIApp[]>([])
  const [quotaUsage, setQuotaUsage]   = React.useState<Record<string, QuotaSummaryEntry>>({})
  const [upstreamProviders, setUpstreamProviders] = React.useState<AiProvider[]>([])
  const [orgNameMap, setOrgNameMap]   = React.useState<Record<string, string>>({})
  const [loading, setLoading]         = React.useState(true)
  const [loadError, setLoadError]     = React.useState<string | null>(null)
  const [busy, setBusy]               = React.useState(false)

  const [search, setSearch]           = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'enable' | 'disable'>('all')

  const [showCreate, setShowCreate]   = React.useState(false)
  const [editTarget, setEditTarget]   = React.useState<UIApp | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<UIApp | null>(null)
  const [detailApp, setDetailApp]     = React.useState<UIApp | null>(null)
  const [revealData, setRevealData]   = React.useState<{ fullKey: string; title: string; graceHours?: number } | null>(null)
  const [toast, setToast]             = React.useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)

  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [deleting, setDeleting]       = React.useState(false)
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = React.useState(false)
  const [secRulesApp, setSecRulesApp] = React.useState<UIApp | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true); setLoadError(null)
    try {
      const [appsData, providersData, quotaData, orgsData] = await Promise.all([
        getApps(), getProviders().catch(() => []), getQuotaUsageSummary().catch(() => ({} as Record<string, QuotaSummaryEntry>)),
        getOrganizations().catch(() => []),
      ])
      setApps(appsData)
      setUpstreamProviders(providersData)
      setQuotaUsage(quotaData)
      setOrgNameMap(Object.fromEntries(orgsData.map(o => [o.id, o.name])))
    }
    catch (err) { setLoadError((err as Error).message || 'Failed to load apps') }
    finally { setLoading(false) }
  }, [])

  React.useEffect(() => { load() }, [load])

  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const defaultProviderId = React.useMemo(
    () => upstreamProviders.find(p => p.is_default)?.id ?? null,
    [upstreamProviders]
  )

  const providerMap = React.useMemo(
    () => new Map(upstreamProviders.map(p => [p.id, p])),
    [upstreamProviders]
  )

  const filtered = React.useMemo(() => {
    let list = apps
    if (statusFilter !== 'all') list = list.filter(a => a.status === statusFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.team.toLowerCase().includes(q)
      )
    }
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [apps, statusFilter, search])

  const enabledCount = apps.filter(a => a.status === 'enable').length
  const totalReqs    = apps.reduce((s, a) => s + a.total, 0)
  const totalBlocked = apps.reduce((s, a) => s + a.blocked, 0)

  const columns: ColumnDef<UIApp>[] = [
    {
      key: 'checkbox',
      label: (
        <input type="checkbox"
          checked={selectedIds.size === filtered.length && filtered.length > 0 ? true : selectedIds.size === 0 ? false : undefined}
          onChange={e => handleSelectAll(e.target.checked)}
          style={{ cursor: 'pointer' }} />
      ),
      width: 36,
      render: (a) => (
        <input type="checkbox"
          checked={selectedIds.has(a.id)}
          onChange={e => handleSelectRow(a, e.target.checked)}
          onClick={e => e.stopPropagation()}
          style={{ cursor: 'pointer' }} />
      ),
    },
    {
      key: 'name',
      label: 'Name',
      render: (a) => <span style={{ fontWeight: 500, fontSize: 13 }}>{a.name}</span>,
    },
    {
      key: 'mode',
      label: 'Mode',
      render: (a) => (
        <>
          {a.mode === 'guard'   && <Chip kind="ok"   >🛡️ guard</Chip>}
          {a.mode === 'soft'    && <Chip kind="ok"   >💡 soft</Chip>}
          {a.mode === 'monitor' && <Chip kind="warn" >👁️ monitor</Chip>}
          {a.mode === 'bypass'  && <Chip kind="muted">⚡ bypass</Chip>}
        </>
      ),
    },
    {
      key: 'features',
      label: 'T2 / KD / CQ',
      render: (a) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {a.enableT2
            ? <Chip kind="ok" dot>T2 on</Chip>
            : <Chip kind="muted" dot>T2 off</Chip>}
          {a.enableKnowledgeDev
            ? <Chip kind="info" dot>KD on</Chip>
            : <Chip kind="muted" dot>KD off</Chip>}
          {a.enableContentQualityScan
            ? <Chip kind="info" dot>Content Quality on</Chip>
            : <Chip kind="muted" dot>Content Quality off</Chip>}
        </div>
      ),
    },
    {
      key: 'team',
      label: 'Team',
      render: (a) => <span style={{ fontSize: 12 }}>{a.team || <span className="caption">—</span>}</span>,
    },
    {
      key: 'org',
      label: 'Org',
      render: (a) => (
        <span style={{ fontSize: 12 }}>
          {a.orgId ? (
            <span style={{ fontSize: 12 }}>{orgNameMap[a.orgId] || <span className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{a.orgId.slice(0, 8)}…</span>}</span>
          ) : (
            <Chip kind="warn" mono>missing</Chip>
          )}
        </span>
      ),
    },
    {
      key: 'env',
      label: 'Env',
      render: (a) => <Chip kind={a.env === 'production' ? 'ok' : a.env === 'development' ? 'warn' : 'muted'} mono>{a.env}</Chip>,
    },
    {
      key: 'provider',
      label: 'Primary provider',
      render: (a) => {
        const primary = a.primaryProviderId ? providerMap.get(a.primaryProviderId) : null
        return primary ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: primary.status === 'healthy' ? 'var(--ok)' : primary.status === 'degraded' ? 'var(--warning)' : 'var(--danger)' }} />
            {primary.name}
            {(a.backup1ProviderId || a.backup2ProviderId) && (
              <span style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>
                +{[a.backup1ProviderId, a.backup2ProviderId].filter(Boolean).length}
              </span>
            )}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>—</span>
        )
      },
    },
    {
      key: 'status',
      label: 'Status',
      render: (a) => (
        <>
          {a.status === 'enable'  && <Chip kind="ok" dot>enabled</Chip>}
          {a.status === 'disable' && <Chip kind="muted" dot>disabled</Chip>}
        </>
      ),
    },
    {
      key: 'quota',
      label: 'Quota',
      render: (a) => {
        const q = quotaUsage[a.id]
        if (!q || q.mode === 'unlimited' || q.limit === null) {
          return <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>—</span>
        }
        const kind = q.state === 'exceeded' ? 'err' : q.state === 'warning' ? 'warn' : 'ok'
        return <Chip kind={kind} mono>{q.used.toLocaleString()} / {q.limit.toLocaleString()}</Chip>
      },
    },
    {
      key: 'req24h',
      label: 'Req (24h)',
      render: (a) => <span className="mono" style={{ fontSize: 11 }}>{a.total.toLocaleString()}</span>,
    },
    {
      key: 'blocked',
      label: 'Blocked',
      render: (a) => <span className="mono" style={{ fontSize: 11, color: a.blocked > 0 ? 'var(--danger)' : 'inherit' }}>{a.blocked}</span>,
    },
    {
      key: 'actions',
      label: 'Action',
      width: 60,
      render: (a) => (
        <div onClick={e => e.stopPropagation()}>
          <ActionCell actions={[
            { icon: <Eye w={14} />, label: 'View details', onClick: () => openDetail(a) },
            { icon: <Shield w={13} />, label: 'Security Rules', onClick: () => openSecRules(a) },
            { icon: <Pencil w={13} />, label: 'Edit', onClick: () => openEdit(a) },
            { icon: <Trash2 w={14} />, label: 'Delete', danger: true, onClick: () => openDelete(a) },
          ]} />
        </div>
      ),
    },
  ]

  async function handleCreate() { setShowCreate(false); await load(); setToast({ msg: 'App created', kind: 'ok' }) }
  async function handleEdit(app: UIApp) { setEditTarget(null); setDetailApp(null); await load(); setToast({ msg: `${app.name} updated`, kind: 'ok' }) }
  async function handleDelete(app: UIApp) {
    setDeleteTarget(null); setBusy(true)
    try { await deleteApp(app.id); await load(); setToast({ msg: `${app.name} deleted`, kind: 'ok' }) }
    catch (err) { setToast({ msg: (err as Error).message || 'Delete failed', kind: 'err' }) }
    finally { setBusy(false) }
  }

  const handleSelectRow = React.useCallback((app: UIApp, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(app.id)
      else next.delete(app.id)
      return next
    })
  }, [])

  const handleSelectAll = React.useCallback((checked: boolean) => {
    if (checked) setSelectedIds(new Set(filtered.map(a => a.id)))
    else setSelectedIds(new Set())
  }, [filtered])

  async function handleConfirmBulkDelete() {
    setDeleting(true)
    try {
      const ids = Array.from(selectedIds)
      await bulkDeleteApps(ids)
      setSelectedIds(new Set())
      await load()
      setToast({ msg: `${ids.length} apps deleted`, kind: 'ok' })
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Bulk delete failed', kind: 'err' })
    }
    finally { setDeleting(false); setBulkDeleteConfirm(false) }
  }

  function openEdit(app: UIApp)   { setDetailApp(null); setEditTarget(app) }
  function openDelete(app: UIApp) { setDetailApp(null); setDeleteTarget(app) }
  function openDetail(app: UIApp) { setDetailApp(app) }
  function openSecRules(app: UIApp) { setDetailApp(null); setSecRulesApp(app) }

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="apps" />
      <PageHeader title="Connected AI apps" subtitle="Register AI applications that consume gateway API keys. Create and edit apps, assign keys, set rate limits and access controls, and monitor per-app usage and traffic patterns."
        actions={<button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus w={13} /> New app</button>} />

      {/* Stats */}
      <StatRow>
        <StatCard variant="compact" label="Connected apps" value={apps.length} accent="var(--accent)" />
        <StatCard variant="compact" label="Enabled" value={enabledCount} />
        <StatCard variant="compact" label="Total requests (24h)" value={totalReqs.toLocaleString()} />
        <StatCard variant="compact" label="Blocked (24h)" value={totalBlocked.toLocaleString()} />
      </StatRow>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        {(['all', 'enable', 'disable'] as const).map(s => (
          <button key={s} className={`filter-chip ${statusFilter === s ? 'active' : ''}`}
            onClick={() => setStatusFilter(s)}>{s}</button>
        ))}
        <input className="input" type="search" placeholder="Search name, team, id…"
          value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
      </div>

    {/* Table */}
    {loading ? (
        <LoadingState />
      ) : loadError ? (
      <ErrorState title="Failed to load apps" message={loadError} onRetry={load} />
    ) : filtered.length === 0 ? (
      <EmptyState
        icon={<Cpu w={28} />}
        title={search || statusFilter !== 'all' ? 'No apps match this filter.' : 'No connected apps yet.'}
        action={!search && statusFilter === 'all' ? (
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            <Plus w={12} /> Create first app
          </button>
        ) : undefined}
      />
    ) : (
      <>
        {selectedIds.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: 6, border: '1px solid var(--border-subtle)' }}>
            <span className="caption">{selectedIds.size} selected</span>
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setBulkDeleteConfirm(true)}>
              <Trash2 w={13} /> Delete selected
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set())}>Clear selection</button>
          </div>
        )}
        <div className="card">
          <DataTable card={false} columns={columns} data={filtered} rowKey={(a) => a.id} onRowClick={(a) => openDetail(a)} rowStyle={(a) => a.status === 'disable' ? { opacity: 0.5 } : undefined}>
            {filtered.length < apps.length && (
              <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--fg-tertiary)', borderTop: '1px solid var(--border-subtle)' }}>
                Showing {filtered.length} of {apps.length} apps
              </div>
            )}
          </DataTable>
        </div>
      </>
    )}

     {showCreate && (
        <AppFormDrawer
          upstreamProviders={upstreamProviders}
          defaultProviderId={defaultProviderId}
          onClose={() => setShowCreate(false)}
          onSave={handleCreate}
        />
      )}
      {editTarget && (
        <AppFormDrawer
          initialApp={editTarget}
          upstreamProviders={upstreamProviders}
          defaultProviderId={defaultProviderId}
          onClose={() => setEditTarget(null)}
          onSave={() => handleEdit(editTarget)}
        />
      )}
      {deleteTarget && (
        <ConfirmModal title="Delete AI app"
          message={<>Permanently delete <strong>{deleteTarget.name}</strong>? All API keys for this app will also be deleted.</>}
          confirmLabel="Delete app" danger
          onClose={() => setDeleteTarget(null)} onConfirm={() => handleDelete(deleteTarget)} busy={busy} />
      )}
      {bulkDeleteConfirm && !deleting && (
        <ConfirmModal title="Delete selected apps"
          message={<>Permanently delete <strong>{selectedIds.size}</strong> connected apps? All API keys for these apps will also be deleted.</>}
          confirmLabel="Delete" danger
          onClose={() => setBulkDeleteConfirm(false)} onConfirm={() => handleConfirmBulkDelete()} busy={deleting} />
      )}
      {detailApp && (
        <DetailDrawer app={detailApp} providerMap={providerMap} orgNameMap={orgNameMap}
          onClose={() => setDetailApp(null)}
          onEdit={() => openEdit(detailApp)}
          onDelete={() => openDelete(detailApp)}
          onRevealKey={(fullKey, title, graceHours) => setRevealData({ fullKey, title, graceHours })} />
      )}
      {secRulesApp && (
        <AppsSecurityRulesDrawer app={secRulesApp} providerMap={providerMap}
          onClose={() => setSecRulesApp(null)} />
      )}
      {revealData && (
        <KeyRevealModal title={revealData.title} fullKey={revealData.fullKey} graceHours={revealData.graceHours} onClose={() => setRevealData(null)} />
      )}
      {toast && <Toast {...toast} />}
    </div>
  )
}

const AppsPage: React.FC<AppsPageProps> = (props) => (
  <FrameworkProvider>
    <AppsPageInner {...props} />
  </FrameworkProvider>
)

export default AppsPage
