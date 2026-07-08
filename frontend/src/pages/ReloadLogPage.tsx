import React from 'react'
import { PageHeader, Breadcrumbs, KV, BulkActionBar, EmptyState, Drawer, DataTable, type ColumnDef } from '../components/ui'
import { RefreshCw, DatabaseRi, Trash2, Zap, ChevronR } from '../components/ui/Icons'
import { getReloadLogs, deleteReloadLog, bulkDeleteReloadLogs, deleteReloadLogsBefore, deleteAllReloadLogs, getReloadGateways, type ReloadLogRecord } from '../api/logs'
import { DeleteLogsModal } from '../components/DeleteLogsModal'
import { Toast } from './components/ProviderShared'
import { Pagination } from './components/AIActivitiesShared'
import type { TweakValues } from '../types'

interface ReloadLogPageProps { tweaks: TweakValues }

type ResultFilter = 'all' | 'success' | 'error' | 'rate_limited'

function fmtTimeStr(s: string): string {
  try { return new Date(s).toLocaleString() } catch { return s }
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

const ReloadLogPage: React.FC<ReloadLogPageProps> = () => {
  const [logs, setLogs]           = React.useState<ReloadLogRecord[]>([])
  const [loading, setLoading]     = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [filter, setFilter]       = React.useState<ResultFilter>('all')
  const [page, setPage]           = React.useState(1)
  const [total, setTotal]         = React.useState(0)
  const [selectedRow, setSelectedRow] = React.useState<ReloadLogRecord | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [showDeleteModal, setShowDeleteModal] = React.useState(false)
  const [reloading, setReloading]     = React.useState(false)

  const LIMIT = 50
  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  async function handleDeleteLogs(daysBack: number | null): Promise<number> {
    if (daysBack === -1) return await deleteAllReloadLogs()
    return await deleteReloadLogsBefore(daysBack ?? 0)
  }

  const [toast, setToast] = React.useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)

  function showToast(msg: string, kind: 'ok' | 'err') {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3000)
  }

  const load = React.useCallback(async (pg: number, f: ResultFilter) => {
    setLoading(true); setLoadError(null)
    try {
      const params: Record<string, string | number> = { page: pg, limit: LIMIT }
      if (f !== 'all') params['result'] = f
      const res = await getReloadLogs(params)
      setLogs(res.rows)
      setTotal(res.meta.total)
    } catch (err) {
      setLoadError((err as Error).message || 'Failed to load')
    } finally { setLoading(false) }
  }, [])

  React.useEffect(() => { load(page, filter) }, [load, page, filter])

  const refresh = () => load(page, filter)

  const handleForceReload = async () => {
    setReloading(true)
    try {
      const gateways = await getReloadGateways()
      let anyCalled = false
      await Promise.allSettled(gateways.map(async (gw) => {
        if (!gw.apiKey) { console.warn('No API key for', gw.name); return }
        anyCalled = true
        const resp = await fetch(`${gw.url}/reload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${gw.apiKey}` },
          signal: AbortSignal.timeout(10000),
        })
        if (!resp.ok) console.warn(`${gw.name} reload returned ${resp.status}`)
      }))
      if (!anyCalled) {
        showToast('No gateways with active API keys found', 'err')
        return
      }
      showToast('Reload sent — refreshing data…', 'ok')
      setTimeout(() => {
        refresh()
        showToast('Data refreshed', 'ok')
      }, 2000)
    } catch (e) {
      console.error(e)
      showToast('Force reload failed', 'err')
    } finally {
      setReloading(false)
    }
  }

  const handleDeleteRow = async (id: string) => {
    try {
      await deleteReloadLog(id)
      setSelectedRow(null)
      refresh()
    } catch (e) { console.error(e) }
  }

  const toggleAll = () => {
    if (selectedIds.size === logs.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(logs.map(l => l.id)))
  }
  const toggleOne = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelectedIds(next)
  }

  const handleBulkDelete = async () => {
    try {
      await bulkDeleteReloadLogs([...selectedIds])
      setSelectedIds(new Set())
      refresh()
    } catch (e) { console.error(e) }
  }

  const resultChip = (r: string) => {
    const cls = r === 'success' ? 'chip-ok' : r === 'rate_limited' ? 'chip-warn' : 'chip-err'
    return <span className={`chip ${cls}`}>{r}</span>
  }

  const columns: ColumnDef<ReloadLogRecord>[] = [
    {
      key: 'checkbox',
      label: (
        <input type="checkbox" checked={selectedIds.size === logs.length && logs.length > 0}
          onChange={toggleAll} style={{ cursor: 'pointer' }} />
      ),
      width: 36,
      render: (log) => (
        <span onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={selectedIds.has(log.id)}
            onChange={() => toggleOne(log.id)} style={{ cursor: 'pointer' }} />
        </span>
      ),
    },
    {
      key: 'triggered_by',
      label: 'Triggered By',
      render: (log) => <code style={{ fontSize: 12 }}>{log.triggered_by}</code>,
    },
    {
      key: 'key_prefix',
      label: 'Key Prefix',
      width: 100,
      render: (log) => <code style={{ fontSize: 12 }}>{log.key_prefix}</code>,
    },
    {
      key: 'result',
      label: 'Result',
      width: 90,
      render: (log) => resultChip(log.result),
    },
    {
      key: 'duration',
      label: 'Duration',
      width: 80,
      render: (log) => <span className="mono" style={{ fontSize: 12 }}>{fmtDuration(log.duration_ms)}</span>,
    },
    {
      key: 'gateway',
      label: 'Gateway',
      width: 160,
      render: (log) => <span style={{ fontSize: 12 }}>{log.gateway_name || log.gateway_instance_id || '—'}</span>,
    },
    {
      key: 'source_ip',
      label: 'Source IP',
      width: 130,
      render: (log) => <span className="mono" style={{ fontSize: 12 }}>{log.source_ip}</span>,
    },
    {
      key: 'created_at',
      label: 'Created',
      width: 160,
      render: (log) => <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>{fmtTimeStr(log.created_at)}</span>,
    },
    {
      key: 'chevron',
      label: '',
      width: 32,
      render: (log) => (
        <ChevronR w={13} style={{
          color: 'var(--fg-tertiary)',
          transform: selectedRow?.id === log.id ? 'rotate(90deg)' : undefined,
          transition: 'transform 150ms',
        }} />
      ),
    },
  ]

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="reload-logs" />
      <PageHeader title="Reload Log" subtitle="Cache reload events triggered via the /reload endpoint — includes source, result, and duration."
        actions={<><button className="btn btn-ghost btn-sm" disabled={reloading} onClick={handleForceReload}><Zap w={14} /> {reloading ? 'Reloading…' : 'Force Reload'}</button><button className="btn btn-ghost btn-sm" onClick={() => setShowDeleteModal(true)}><DatabaseRi w={14} /> Manage</button><button className="btn btn-ghost btn-sm" onClick={refresh} title="Refresh"><RefreshCw w={14} /></button></>} />

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, alignItems: 'center' }}>
        <span className="label">Result:</span>
        {(['all', 'success', 'error', 'rate_limited'] as const).map(f => (
          <button key={f} className={`btn btn-${f === filter ? 'solid' : 'ghost'} btn-xs`} onClick={() => { setFilter(f); setPage(1) }}>
            {f === 'all' ? 'All' : f}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {!loading && <span className="caption">{total.toLocaleString()} events</span>}
      </div>

      {/* Error */}
      {loadError && (
        <div className="card" style={{ padding: 16, marginBottom: 12, color: 'var(--danger)', background: 'var(--danger-bg)' }}>
          {loadError}
        </div>
      )}

      {/* Table */}
      <div className="card">
        <BulkActionBar selectedCount={selectedIds.size} onDelete={handleBulkDelete} />
        <DataTable card={false} columns={columns} data={logs}
          rowKey={l => l.id}
          onRowClick={log => setSelectedRow(log)}
          loading={loading}
          emptyState={<EmptyState icon={<DatabaseRi w={28} />} title="No reload events found." subtitle={filter !== 'all' ? 'Try changing the filter.' : undefined} />}
          rowClassName={log => selectedRow?.id === log.id ? 'selected' : undefined}
        >
          <Pagination page={page} totalPages={totalPages} onPage={p => setPage(p)} />
        </DataTable>
      </div>

      {/* Detail drawer */}
      <Drawer
        open={!!selectedRow}
        icon={<DatabaseRi w={14} style={{ color: 'var(--accent)' }} />}
          title={selectedRow ? `Reload ${selectedRow.id.slice(0, 8)}` : ''}
          subtitle={selectedRow ? `${selectedRow.result} · ${fmtTimeStr(selectedRow.created_at)}` : ''}
          onClose={() => setSelectedRow(null)}
          footer={selectedRow ? (
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteRow(selectedRow.id)}>
              <Trash2 w={13} /> Delete this log
            </button>
          ) : undefined}
        >
          {selectedRow && (
          <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
            <KV labelWidth={120} gap={8} style={{ marginBottom: 18 }} rows={[
              { label: 'ID', value: selectedRow.id, mono: true },
              { label: 'Triggered by', value: <span className="chip chip-muted"><code>{selectedRow.triggered_by}</code></span> },
              { label: 'Key prefix', value: selectedRow.key_prefix, mono: true },
              { label: 'Gateway', value: selectedRow.gateway_name || selectedRow.gateway_instance_id || '—', mono: true },
              { label: 'Source IP', value: selectedRow.source_ip, mono: true },
              { label: 'Result', value: resultChip(selectedRow.result) },
              { label: 'Duration', value: fmtDuration(selectedRow.duration_ms) },
              { label: 'Created', value: fmtTimeStr(selectedRow.created_at) },
            ]} />

            {selectedRow.error_message && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ padding: '12px 14px', borderRadius: 6, background: 'var(--danger-bg)', border: '1px solid var(--danger)' }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>Error</div>
                  <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{selectedRow.error_message}</pre>
                </div>
              </div>
            )}
          </div>
          )}
        </Drawer>

      {showDeleteModal && (
        <DeleteLogsModal
          title="Delete Reload Logs"
          onDelete={handleDeleteLogs}
          onClose={() => { setShowDeleteModal(false); refresh() }}
        />
      )}

      {toast && <Toast msg={toast.msg} kind={toast.kind} />}
    </div>
  )
}

export default ReloadLogPage
