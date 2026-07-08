import React from 'react'
import { RefreshCw, ChevronR, DatabaseRi, Trash2 } from '../components/ui/Icons'
import { getTrafficLogs, getTrafficStats, deleteTrafficLogsBefore, deleteAllTrafficLogs, type TrafficStats } from '../api/logs'
import { deleteTrafficLog, bulkDeleteTrafficLogs } from '../api/logs'
import { getApps } from '../api/apps'
import { getDetectors } from '../api/detectors'
import type { UIDetector } from '../api/detectors'
import { getAllDetectionFrameworks } from '../api/detectionFrameworks'
import type { TrafficRow, TweakValues, App } from '../types'
import { fmtAgeFromTs, fmtDateTime } from '../utils/format'
import { fmtTokens, fmtMs } from './components/AIActivitiesShared'
import { PageHeader, Breadcrumbs, OwaspPill, StatCard, FILTER_INPUT_STYLE, FilterBar, BulkActionBar, EmptyState, LoadingState, DataTable, type ColumnDef } from '../components/ui'
import { Pagination, statusChip, CopyButton, classificationFeedbackCell } from './components/AIActivitiesShared'
import { ScannerBadge } from '../components/ui'
import { RowDetail } from './components/AIActivitiesModals'
import { ConfirmModal } from './components/ProviderShared'
import { DeleteLogsModal } from '../components/DeleteLogsModal'
import { useAuth } from '../context/AuthContext'

interface AIActivitiesPageProps { tweaks: TweakValues }
const ENDPOINT_OPTIONS = [
  '/v1/chat/completions', '/v1/completions', '/v1/messages', '/v1/responses',
  '/v1/embeddings', '/v1/moderations', '/v1/test/upstream', '/v1/test/classification',
]

const AIActivitiesPage: React.FC<AIActivitiesPageProps> = () => {
  const { hasViewerOrAbove } = useAuth()
  const [rows, setRows]         = React.useState<TrafficRow[]>([])
  const [loading, setLoading]   = React.useState(true)
  const [page, setPage]         = React.useState(1)
  const [totalPages, setTotalPages] = React.useState(1)
  const [total, setTotal]       = React.useState(0)
  const [apps, setApps]         = React.useState<App[]>([])
  const [detectors, setDetectors] = React.useState<UIDetector[]>([])
  const [frameworks, setFrameworks] = React.useState<{ id: string; name: string; framework_code: string }[]>([])

  const [appFilter, setAppFilter]         = React.useState('')
  const [flaggedFilter, setFlaggedFilter] = React.useState('')
  const [frameworkFilter, setFrameworkFilter] = React.useState('')
  const [modelFilter, setModelFilter]     = React.useState('')
  const [pathFilter, setPathFilter]       = React.useState('')
  const [fromFilter, setFromFilter]       = React.useState('')
  const [toFilter, setToFilter]           = React.useState('')

  const [selectedRow, setSelectedRow] = React.useState<TrafficRow | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [deleting, setDeleting]       = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null)
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = React.useState(false)
  const [showDeleteModal, setShowDeleteModal] = React.useState(false)
  const hasFilters = !!(appFilter || flaggedFilter || frameworkFilter || modelFilter || pathFilter || fromFilter || toFilter)
  const [stats, setStats] = React.useState<TrafficStats | null>(null)
  const [statsLoading, setStatsLoading] = React.useState(true)

  async function handleDeleteTrafficLogs(daysBack: number | null): Promise<number> {
    if (daysBack === -1) return await deleteAllTrafficLogs()
    return await deleteTrafficLogsBefore(daysBack ?? 0)
  }

  const [toast, setToast] = React.useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)

  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  React.useEffect(() => {
    getApps().then(setApps).catch(() => {})
    getDetectors().then(res => setDetectors(res.data)).catch(() => {})
    getAllDetectionFrameworks({ limit: 50 }).then(r => setFrameworks(r.data.map((f: { id: string; name: string; framework_code: string }) => ({ id: f.id, name: f.name, framework_code: f.framework_code })))).catch(() => {})
  }, [])

  const loadRef = React.useRef(async (p: number) => {
    setLoading(true)
    try {
      const res = await getTrafficLogs({
        page: p, limit: 50,
        flagged:        flaggedFilter ? flaggedFilter === 'true' : undefined,
        app_id:         appFilter || undefined,
        framework_id:   frameworkFilter || undefined,
        model:          modelFilter.trim() || undefined,
        path:           pathFilter || undefined,
        from:           fromFilter || undefined,
        to:             toFilter   || undefined,
      })
      setRows(res.rows)
      setTotal(res.meta.total)
      setTotalPages(res.meta.totalPages)
      setPage(p)
    } catch { /* silent */ }
    finally { setLoading(false) }
  })

  React.useEffect(() => { loadRef.current(1) }, [appFilter, flaggedFilter, frameworkFilter, modelFilter, pathFilter, fromFilter, toFilter])

  React.useEffect(() => {
    setStatsLoading(true)
    getTrafficStats({
      flagged:      flaggedFilter ? flaggedFilter === 'true' : undefined,
      app_id:       appFilter || undefined,
      framework_id: frameworkFilter || undefined,
      model:        modelFilter.trim() || undefined,
      path:         pathFilter || undefined,
      from:         fromFilter || undefined,
      to:           toFilter   || undefined,
    }).then(setStats).catch(() => {}).finally(() => setStatsLoading(false))
  }, [appFilter, flaggedFilter, frameworkFilter, modelFilter, pathFilter, fromFilter, toFilter])

  const refresh = () => loadRef.current(1)

  const selectAllRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedIds.size > 0 && selectedIds.size < rows.length
    }
  }, [selectedIds, rows])

  const handleSelectRow = React.useCallback((row: TrafficRow, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(row.id)
      else next.delete(row.id)
      return next
    })
  }, [])

  const handleSelectAll = React.useCallback((checked: boolean) => {
    if (checked) setSelectedIds(new Set(rows.map(r => r.id)))
    else setSelectedIds(new Set())
  }, [rows])

  async function handleConfirmBulkDelete() {
    setDeleting(true)
    try {
      await bulkDeleteTrafficLogs(Array.from(selectedIds))
      setSelectedIds(new Set())
      await loadRef.current(1)
      setSelectedRow(null)
    } catch (err) {
      console.error('Bulk delete failed', err)
    }
    finally { setDeleting(false); setBulkDeleteConfirm(false) }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteTrafficLog(deleteTarget)
      setSelectedIds(prev => { const n = new Set(prev); n.delete(deleteTarget); return n })
      await loadRef.current(page)
      setSelectedRow(null)
    } catch (err) {
      console.error('Delete failed', err)
    }
    finally { setDeleting(false) }
  }

  const handleSelectAndOpen = React.useCallback((row: TrafficRow) => {
    if (selectedRow?.id === row.id) {
      setSelectedRow(null)
    } else {
      setSelectedRow(row)
    }
  }, [selectedRow])

  const columns: ColumnDef<TrafficRow>[] = [
    {
      key: 'checkbox',
      width: 36,
      label: (
        <input ref={selectAllRef} type="checkbox" checked={selectedIds.size === rows.length && rows.length > 0}
          onChange={e => handleSelectAll(e.target.checked)} style={{ cursor: 'pointer' }}
        />
      ),
      render: (row) => (
        <span onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={selectedIds.has(row.id)}
            onChange={e => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); handleSelectRow(row, e.target.checked) }} style={{ cursor: 'pointer' }}
          />
        </span>
      ),
    },
    {
      key: 'time',
      width: 160,
      label: 'Time',
      render: (row) => (
        <>
          <div className="mono" style={{ fontSize: 11 }}>{fmtAgeFromTs(row.ts)}</div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>{fmtDateTime(row.ts)}</div>
        </>
      ),
    },
    {
      key: 'requestId',
      label: 'Request ID',
      render: (row) => (
        <span onClick={e => e.stopPropagation()}>
          <div className="mono" style={{ fontSize: 11 }}>{row.id || row.id}</div>
          <CopyButton text={row.id || row.id} />
        </span>
      ),
    },
    {
      key: 'app',
      label: 'App',
      render: (row) => <>{row.appName}</>,
    },
    {
      key: 'model',
      label: 'Model',
      render: (row) => <span className="mono" style={{ fontSize: 12 }}>{row.model}</span>,
    },
    {
      key: 'endpoint',
      label: 'Endpoint',
      render: (row) => <span className="mono" style={{ fontSize: 11 }}>{row.path}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => statusChip(row.code),
    },
    {
      key: 'tokens',
      label: 'Tokens',
      render: (row) => <span className="mono" style={{ fontSize: 11 }}>{fmtTokens(row.tokensIn)} / {fmtTokens(row.tokensOut)}</span>,
    },
    {
      key: 'duration',
      label: 'Duration',
      render: (row) => <span className="mono" style={{ fontSize: 11 }}>{fmtMs(row.ms)}</span>,
    },
    {
      key: 'gateway',
      label: 'Gateway',
      render: (row) => <span style={{ fontSize: 12 }}>{row.gatewayName ?? row.gatewayInstanceId ?? '—'}</span>,
    },
    {
      key: 'blocker',
      label: 'Blocker',
      render: (row) => row.flag ? <ScannerBadge row={row} /> : <span style={{ color: 'var(--fg-tertiary)', fontSize: 11 }}>—</span>,
    },
    {
      key: 'classification',
      label: 'Classification',
      render: (row) => classificationFeedbackCell(row),
    },
    {
      key: 'attackType',
      label: 'Attack type',
      render: (row) => row.framework_id ? <OwaspPill id={row.framework_id} /> : null,
    },
    {
      key: 'chevron',
      width: 32,
      label: '',
      render: (row) => (
        <ChevronR w={13} style={{ color: 'var(--fg-tertiary)', transform: selectedRow?.id === row.id ? 'rotate(90deg)' : undefined, transition: 'transform 150ms' }} />
      ),
    },
  ]

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="ai-activities" />
      <PageHeader title="Gateway Activity Log" subtitle="All gateway requests across every app-authenticated endpoint — prompts, responses, detections, and latency metrics."
        actions={<>{hasViewerOrAbove && (<button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setShowDeleteModal(true)}><Trash2 w={13} /> Delete old logs</button>)}<button className="btn btn-ghost btn-sm" onClick={refresh} title="Refresh data"><RefreshCw w={14} /></button></>} />

      {/* KPI row */}
      <div className="kpi-row">
        <StatCard label="Requests" loading={statsLoading} value={(stats?.total ?? 0).toLocaleString()} />
        <StatCard
          label="Blocked / flagged"
          tone="danger"
          loading={statsLoading}
          value={(stats?.blocked_flagged ?? 0).toLocaleString()}
          caption={`rate ${stats ? (stats.blocked_flagged_rate * 100).toFixed(1) : '—'}%`}
        />
        <StatCard label="Avg latency" loading={statsLoading} value={`${stats?.avg_duration_ms ?? '—'} ms`} />
        <StatCard
          label="Tokens"
          tone="warning"
          loading={statsLoading}
          value={((stats?.tokens_in ?? 0) + (stats?.tokens_out ?? 0)).toLocaleString()}
          caption={`in ${(stats?.tokens_in ?? 0).toLocaleString()} · out ${(stats?.tokens_out ?? 0).toLocaleString()}`}
        />
      </div>

      {/* Filters */}
      <FilterBar mb={12}>
        <select className="select" value={appFilter} onChange={e => setAppFilter(e.target.value)} style={{ width: 170 }}>
          <option value="">All apps</option>
          {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <select className="select" value={flaggedFilter} onChange={e => setFlaggedFilter(e.target.value)} style={{ width: 140 }}>
          <option value="">All requests</option>
          <option value="true">Flagged only</option>
          <option value="false">Clean only</option>
        </select>

        <select className="select" value={frameworkFilter} onChange={e => setFrameworkFilter(e.target.value)} style={{ width: 160 }}>
          <option value="">All frameworks</option>
          {frameworks.map(f => <option key={f.id} value={f.id}>{f.framework_code} · {f.name}</option>)}
        </select>

        <input style={{ ...FILTER_INPUT_STYLE, width: 150 }} type="text" placeholder="Model…" value={modelFilter} onChange={e => setModelFilter(e.target.value)} />

        <select className="select" value={pathFilter} onChange={e => setPathFilter(e.target.value)} style={{ width: 180 }}>
          <option value="">All endpoints</option>
          {ENDPOINT_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <span className="label" style={{ marginLeft: 4 }}>From</span>
        <input style={{ ...FILTER_INPUT_STYLE, width: 148 }} type="datetime-local" value={fromFilter} onChange={e => setFromFilter(e.target.value)} />
        <span className="label">To</span>
        <input style={{ ...FILTER_INPUT_STYLE, width: 148 }} type="datetime-local" value={toFilter} onChange={e => setToFilter(e.target.value)} />

        {(appFilter || flaggedFilter || frameworkFilter || modelFilter || pathFilter || fromFilter || toFilter) && (
          <button className="btn btn-ghost btn-sm" onClick={() => {
            setAppFilter(''); setFlaggedFilter(''); setFrameworkFilter('')
            setModelFilter(''); setPathFilter(''); setFromFilter(''); setToFilter('')
          }}>Clear</button>
        )}
        <div style={{ flex: 1 }} />
        {!loading && <span className="caption">{total.toLocaleString()} requests</span>}
      </FilterBar>

      {/* Table */}
      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<DatabaseRi w={28} />}
          title="No requests found."
          subtitle={hasFilters ? 'Try clearing the filters.' : undefined}
        />
      ) : (
        <div className="card">
          <BulkActionBar selectedCount={selectedIds.size} onDelete={hasViewerOrAbove ? () => setBulkDeleteConfirm(true) : undefined} busy={deleting} />
          <DataTable card={false} columns={columns} data={rows} rowKey={(row) => row.id}
            onRowClick={handleSelectAndOpen}
            rowClassName={(row) => selectedRow?.id === row.id ? 'selected' : undefined}
            minWidth={1080}
          >
            <Pagination page={page} totalPages={totalPages} onPage={p => loadRef.current(p)} />
          </DataTable>
        </div>
      )}

      {selectedRow && (
        <RowDetail
          row={selectedRow}
          detectors={detectors}
          onClose={() => setSelectedRow(null)}
          onDelete={hasViewerOrAbove ? () => { setDeleteTarget(selectedRow.id); setSelectedRow(null) } : undefined}
          onUpdateClassification={(id, correct, reason) => {
            setSelectedRow(prev => prev ? { ...prev, isClassificationCorrect: correct, correctionReason: reason || null } : null)
            setRows(prev => prev.map(r => r.id === id ? { ...r, isClassificationCorrect: correct, correctionReason: reason || null } : r))
          }}
        />
      )}

      {deleteTarget && !deleting && (
        <ConfirmModal title="Delete traffic log"
          message={<><strong>ID:</strong> {deleteTarget}<br />Permanently delete this traffic log record? This cannot be undone.</>}
          confirmLabel="Delete" danger
          onClose={() => setDeleteTarget(null)} onConfirm={handleConfirmDelete} busy={deleting} />
      )}

      {bulkDeleteConfirm && !deleting && (
        <ConfirmModal title="Delete selected logs"
          message={<><strong>{selectedIds.size}</strong> traffic log records will be permanently deleted. This cannot be undone.</>}
          confirmLabel="Delete all" danger
          onClose={() => setBulkDeleteConfirm(false)} onConfirm={handleConfirmBulkDelete} busy={deleting} />
      )}

      {showDeleteModal && (
        <DeleteLogsModal
          title="Delete traffic logs older than"
          onClose={() => { setShowDeleteModal(false); refresh() }}
          onDelete={handleDeleteTrafficLogs}
        />
      )}
    </div>
  )
}

export default AIActivitiesPage
