import React from 'react'
import { PageHeader, Breadcrumbs, Chip, KV, FILTER_INPUT_STYLE, FilterBar, BulkActionBar, EmptyState, LoadingState, Drawer, DataTable, Pagination } from '../components/ui'
import type { ColumnDef } from '../components/ui'
import { Trash2, RefreshCw, ChevronR, Lock, DatabaseRi } from '../components/ui/Icons'
import { getEmbeddingLogs, deleteEmbeddingLog, bulkDeleteEmbeddingLogs, deleteEmbeddingLogsBefore, deleteAllEmbeddingLogs } from '../api/logs'
import type { EmbeddingLogRecord, LogMeta } from '../api/logs'
import { fmtTsStr, fmtAgeFromIso } from '../utils/format'
import { ConfirmModal, Toast } from './components/ProviderShared'
import { DeleteLogsModal } from '../components/DeleteLogsModal'
import type { TweakValues } from '../types'

interface EmbeddingLogsPageProps { tweaks: TweakValues }

function fmtMs(ms: number) {
  if (!ms) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`
}

// ── Detail drawer ─────────────────────────────────────────────────────────────

function DetailDrawer({ row, onClose, onDelete, open }: { row: EmbeddingLogRecord; onClose: () => void; onDelete?: () => void; open?: boolean }) {
  return (
    <Drawer open={open}
      title={
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Lock w={14} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>{row.id}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 2 }}>
            {row.provider_name} · {row.model || '—'}
          </div>
        </>
      }
      onClose={onClose}
      footer={onDelete && (
        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={onDelete}>
          <Trash2 w={13} /> Delete this record
        </button>
      )}
    >
      <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
        <KV
          labelWidth={80} gap={8} style={{ marginBottom: 18 }}
          rows={[
            { label: 'Status', value: row.success ? <Chip kind="ok" dot>Success</Chip> : <Chip kind="err" dot>Failed</Chip> },
            { label: 'Duration', value: <span style={{ fontSize: 12 }}>{fmtMs(row.duration_ms)}</span>, mono: true },
            { label: 'Source', value: <Chip kind="muted">{row.source}</Chip> },
            { label: 'Time', value: <span style={{ fontSize: 12 }}>{fmtAgeFromIso(row.created_at)}</span>, mono: true },
            { label: 'Provider', value: row.provider_name },
            { label: 'Provider ID', value: <span style={{ fontSize: 11, wordBreak: 'break-all' }}>{row.provider_id}</span>, mono: true },
            row.model && { label: 'Model', value: <span style={{ fontSize: 12 }}>{row.model}</span>, mono: true },
            { label: 'Input chars', value: <span style={{ fontSize: 12 }}>{row.input_chars.toLocaleString()}</span>, mono: true },
            { label: 'Dimensions', value: <span style={{ fontSize: 12 }}>{row.dimensions ?? '—'}</span>, mono: true },
            row.request_id && { label: 'Linked request', value: <span style={{ fontSize: 11, wordBreak: 'break-all' }}>{row.request_id}</span>, mono: true },
          ]}
        />

        <div style={{ marginBottom: 18 }}>
          <div className="label" style={{ marginBottom: 6 }}>Input text</div>
          {row.input_text ? (
            <pre style={{
              margin: 0, padding: '8px 10px', borderRadius: 4,
              background: 'var(--bg-sunken)', fontSize: 12,
              fontFamily: 'var(--font-mono)', overflowX: 'auto',
              color: 'var(--fg-primary)', lineHeight: 1.5,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              maxHeight: 320, overflowY: 'auto',
              border: '1px solid var(--border-subtle)',
            }}>
              {row.input_text}
            </pre>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', fontStyle: 'italic' }}>
              Not recorded for this entry.
            </div>
          )}
        </div>

        {row.error_message && (
          <div style={{ marginBottom: 18 }}>
            <div className="label" style={{ marginBottom: 6 }}>Error</div>
            <pre style={{
              margin: 0, padding: '8px 10px', borderRadius: 4,
              background: 'var(--bg-sunken)', fontSize: 11,
              fontFamily: 'var(--font-mono)', overflowX: 'auto',
              color: 'var(--err)', lineHeight: 1.5,
              border: '1px solid var(--border-subtle)',
            }}>
              {row.error_message}
            </pre>
          </div>
        )}
      </div>
    </Drawer>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EmbeddingLogsPage(_props: EmbeddingLogsPageProps) {
  const [rows, setRows]             = React.useState<EmbeddingLogRecord[]>([])
  const [meta, setMeta]             = React.useState<LogMeta>({ page: 1, limit: 50, total: 0, totalPages: 0 })
  const [page, setPage]             = React.useState(1)
  const [loading, setLoading]       = React.useState(true)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [detailRow, setDetailRow]   = React.useState<EmbeddingLogRecord | null>(null)
  const [toast, setToast]           = React.useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)
  const [confirmDel, setConfirmDel] = React.useState<string | null>(null)
  const [confirmBulk, setConfirmBulk] = React.useState(false)
  const [deleting, setDeleting]     = React.useState(false)

  // Filters
  const [filterSuccess, setFilterSuccess] = React.useState('')
  const [filterSource, setFilterSource]   = React.useState('')
  const [filterFrom, setFilterFrom]       = React.useState('')
  const [filterTo, setFilterTo]           = React.useState('')
  const [showDeleteModal, setShowDeleteModal] = React.useState(false)
  const hasFilters = !!(filterSuccess || filterSource || filterFrom || filterTo)

  async function handleDeleteEmbeddingLogs(daysBack: number | null): Promise<number> {
    if (daysBack === -1) return await deleteAllEmbeddingLogs()
    return await deleteEmbeddingLogsBefore(daysBack ?? 0)
  }

  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  async function load(p = page) {
    setPage(p)
    setLoading(true)
    try {
      const params: Parameters<typeof getEmbeddingLogs>[0] = { page: p, limit: 50 }
      if (filterSuccess !== '') params.success = filterSuccess === 'true'
      if (filterSource)  params.source = filterSource
      if (filterFrom)    params.from   = filterFrom
      if (filterTo)      params.to     = filterTo
      const res = await getEmbeddingLogs(params)
      setRows(res.rows)
      setMeta(res.meta)
      setSelectedIds(new Set())
    } catch {
      showToast('Failed to load embedding logs')
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => { load(1); setPage(1) }, [filterSuccess, filterSource, filterFrom, filterTo])

  function showToast(msg: string) {
    setToast({ msg, kind: 'ok' })
    setTimeout(() => setToast(null), 3000)
  }

  function handleSelectRow(row: EmbeddingLogRecord, checked: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(row.id)
      else next.delete(row.id)
      return next
    })
  }

  function handleSelectAll(checked: boolean) {
    if (checked) setSelectedIds(new Set(rows.map(r => r.id)))
    else setSelectedIds(new Set())
  }

  async function handleConfirmDelete() {
    if (!confirmDel) return
    setDeleting(true)
    try {
      await deleteEmbeddingLog(confirmDel)
      showToast('Deleted')
      load(page)
    } catch {
      showToast('Delete failed')
    } finally {
      setDeleting(false); setConfirmDel(null)
    }
  }

  async function handleConfirmBulkDelete() {
    setDeleting(true)
    try {
      await bulkDeleteEmbeddingLogs(Array.from(selectedIds))
      showToast(`Deleted ${selectedIds.size} entries`)
      setSelectedIds(new Set())
      load(page)
      setDetailRow(null)
    } catch {
      showToast('Bulk delete failed')
    } finally {
      setDeleting(false); setConfirmBulk(false)
    }
  }

  const handleSelectAndOpen = React.useCallback((row: EmbeddingLogRecord) => {
    if (detailRow?.id === row.id) {
      setDetailRow(null)
    } else {
      setDetailRow(row)
    }
  }, [detailRow])

  const columns: ColumnDef<EmbeddingLogRecord>[] = [
    {
      key: 'checkbox',
      width: 36,
      label: (
        <input type="checkbox" checked={selectedIds.size === rows.length && rows.length > 0 ? true : selectedIds.size === 0 ? false : undefined} onChange={e => handleSelectAll(e.target.checked)} style={{ cursor: 'pointer' }} />
      ),
      render: (row) => (
        <input type="checkbox" checked={selectedIds.has(row.id)} onChange={e => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); handleSelectRow(row, e.target.checked) }} style={{ cursor: 'pointer' }} />
      ),
    },
    {
      key: 'time',
      width: 160,
      label: 'Time',
      render: (row) => (
        <>
          <div className="mono" style={{ fontSize: 11 }}>{fmtAgeFromIso(row.created_at)}</div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>{fmtTsStr(row.created_at)}</div>
        </>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => row.success ? <Chip kind="ok" dot>OK</Chip> : <Chip kind="err" dot>Failed</Chip>,
    },
    {
      key: 'provider',
      label: 'Provider',
      render: (row) => (
        <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.provider_name}</span>
      ),
    },
    {
      key: 'model',
      label: 'Model',
      render: (row) => (
        <span className="mono" style={{ fontSize: 12, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.model ?? '—'}</span>
      ),
    },
    {
      key: 'input',
      label: 'Input',
      render: (row) => (
        <span style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: row.input_text ? 'var(--fg-secondary)' : 'var(--fg-tertiary)' }}>
          {row.input_text || '—'}
        </span>
      ),
    },
    {
      key: 'chars',
      label: 'Chars',
      render: (row) => <span className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{row.input_chars.toLocaleString()}</span>,
    },
    {
      key: 'dims',
      label: 'Dims',
      render: (row) => <span className="mono" style={{ fontSize: 12 }}>{row.dimensions ?? '—'}</span>,
    },
    {
      key: 'duration',
      label: 'Duration',
      render: (row) => <span className="mono" style={{ fontSize: 11 }}>{fmtMs(row.duration_ms)}</span>,
    },
    {
      key: 'source',
      label: 'Source',
      render: (row) => <Chip kind="muted">{row.source}</Chip>,
    },
    {
      key: 'chevron',
      width: 32,
      label: '',
      render: (row) => (
        <ChevronR w={13} style={{ color: 'var(--fg-tertiary)', transform: detailRow?.id === row.id ? 'rotate(90deg)' : undefined, transition: 'transform 150ms' }} />
      ),
    },
  ]

  return (
    <div className="page fade-in">
      {toast && <Toast msg={toast.msg} kind={toast.kind} />}
      {detailRow && <DetailDrawer row={detailRow} onClose={() => setDetailRow(null)} onDelete={() => setConfirmDel(detailRow.id)} />}
      {confirmDel && (
        <ConfirmModal title="Delete embedding log"
          message={<><strong>ID:</strong> {confirmDel}<br />Permanently delete this embedding log record? This cannot be undone.</>}
          confirmLabel="Delete" danger
          onClose={() => setConfirmDel(null)} onConfirm={handleConfirmDelete} busy={deleting} />
      )}
      {confirmBulk && (
        <ConfirmModal title="Delete selected logs"
          message={<><strong>{selectedIds.size}</strong> embedding log records will be permanently deleted. This cannot be undone.</>}
          confirmLabel="Delete all" danger
          onClose={() => setConfirmBulk(false)} onConfirm={handleConfirmBulkDelete} busy={deleting} />
      )}

      {showDeleteModal && (
        <DeleteLogsModal
          title="Delete embedding logs older than"
          onClose={() => { setShowDeleteModal(false); load(1) }}
          onDelete={handleDeleteEmbeddingLogs}
        />
      )}

      <Breadcrumbs pageId="embedding-logs" />
      <PageHeader title="Embedding Log" subtitle="Review all embedding API calls used for threat knowledge semantic search. Inspect request payloads, latency, and errors, and filter by provider."
        actions={<><button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setShowDeleteModal(true)} title="Delete old logs"><Trash2 w={14} /> Delete old logs</button><button className="btn btn-ghost btn-sm" onClick={() => load(page)} title="Refresh data"><RefreshCw w={14} /></button></>} />

      {/* Filters */}
      <FilterBar mb={12}>
        <select className="select" value={filterSuccess} onChange={e => setFilterSuccess(e.target.value)} style={{ width: 150 }}>
          <option value="">All statuses</option>
          <option value="true">Success</option>
          <option value="false">Failed</option>
        </select>

        <select className="select" value={filterSource} onChange={e => setFilterSource(e.target.value)} style={{ width: 160 }}>
          <option value="">All sources</option>
          <option value="pipeline">Pipeline</option>
          <option value="threat_knowledge">Threat Knowledge</option>
          <option value="test">Test</option>
        </select>

        <span className="label" style={{ marginLeft: 4 }}>From</span>
        <input style={{ ...FILTER_INPUT_STYLE, width: 148 }} type="datetime-local" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
        <span className="label">To</span>
        <input style={{ ...FILTER_INPUT_STYLE, width: 148 }} type="datetime-local" value={filterTo} onChange={e => setFilterTo(e.target.value)} />

        {(filterSuccess || filterSource || filterFrom || filterTo) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilterSuccess(''); setFilterSource(''); setFilterFrom(''); setFilterTo('') }}>Clear</button>
        )}
        <div style={{ flex: 1 }} />
        {!loading && <span className="caption">{meta.total.toLocaleString()} logs</span>}
      </FilterBar>

      {/* Table */}
      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<DatabaseRi w={28} />}
          title="No embedding logs found."
          subtitle={hasFilters ? 'Try clearing the filters.' : undefined}
        />
      ) : (
        <div className="card">
          <BulkActionBar selectedCount={selectedIds.size} onDelete={() => setConfirmBulk(true)} busy={deleting} />
          <DataTable
            card={false}
            columns={columns}
            data={rows}
            minWidth={880}
            rowKey={(row) => row.id}
            onRowClick={handleSelectAndOpen}
            rowClassName={(row) => detailRow?.id === row.id ? 'selected' : undefined}
            rowStyle={() => ({ cursor: 'pointer' })}
          >
            <Pagination page={page} totalPages={meta.totalPages} onPage={p => load(p)} />
          </DataTable>
        </div>
      )}

    </div>
  )
}
