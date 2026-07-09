import React from 'react'
import { PageHeader, Breadcrumbs, Chip, FILTER_INPUT_STYLE, FilterBar, BulkActionBar, EmptyState, LoadingState, DataTable, type ColumnDef } from '../components/ui'
import { Trash2, RefreshCw, DatabaseRi } from '../components/ui/Icons'
import { getProviderCallLogs, deleteProviderCallLog, bulkDeleteProviderCallLogs, deleteProviderCallLogsBefore, deleteAllProviderCallLogs, getProviderCallLogStats } from '../api/aiProviderCallLogs'
import type { AiProviderCallLogRecord, ProviderCallLogStats } from '../api/aiProviderCallLogs'
import type { LogMeta } from '../api/logs'
import { fmtTsStr, fmtAgeFromIso } from '../utils/format'
import { ConfirmModal, Toast } from './components/ProviderShared'
import { DeleteLogsModal } from '../components/DeleteLogsModal'
import type { TweakValues } from '../types'
import { callTypeKind, fmtMs, Pagination, DetailDrawer, isTimeoutError } from './components/ProviderCallLogPrimitives'

interface ProviderCallLogsPageProps { tweaks: TweakValues }

export default function ProviderCallLogsPage(_props: ProviderCallLogsPageProps) {
  const [rows, setRows]               = React.useState<AiProviderCallLogRecord[]>([])
  const [meta, setMeta]               = React.useState<LogMeta>({ page: 1, limit: 50, total: 0, totalPages: 0 })
  const [stats, setStats]             = React.useState<ProviderCallLogStats>({ tokensInTotal: 0, tokensOutTotal: 0, tokensTotal: 0, totalCalls: 0 })
  const [page, setPage]               = React.useState(1)
  const [loading, setLoading]         = React.useState(true)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [detailRow, setDetailRow]     = React.useState<AiProviderCallLogRecord | null>(null)
  const [toast, setToast]             = React.useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)
  const [confirmDel, setConfirmDel]   = React.useState<string | null>(null)
  const [confirmBulk, setConfirmBulk] = React.useState(false)
  const [deleting, setDeleting]       = React.useState(false)

  const [filterCallType, setFilterCallType] = React.useState('')
  const [filterSuccess, setFilterSuccess]   = React.useState('')
  const [filterSource, setFilterSource]     = React.useState('')
  const [filterFrom, setFilterFrom]         = React.useState('')
  const [filterTo, setFilterTo]             = React.useState('')
  const [showDeleteModal, setShowDeleteModal] = React.useState(false)

  async function handleDeleteProviderCallLogs(daysBack: number | null): Promise<number> {
    if (daysBack === -1) return await deleteAllProviderCallLogs()
    return await deleteProviderCallLogsBefore(daysBack ?? 0)
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
      const params: Parameters<typeof getProviderCallLogs>[0] = { page: p, limit: 50 }
      if (filterCallType)         params.call_type = filterCallType
      if (filterSuccess !== '')   params.success   = filterSuccess === 'true'
      if (filterSource)           params.source    = filterSource
      if (filterFrom)             params.from      = filterFrom
      if (filterTo)               params.to        = filterTo
      const [res, statsRes] = await Promise.all([
        getProviderCallLogs(params),
        getProviderCallLogStats(params),
      ])
      setRows(res.rows)
      setMeta(res.meta)
      setStats(statsRes)
      setSelectedIds(new Set())
    } catch {
      showToast('Failed to load provider call logs')
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => { load(1); setPage(1) }, [filterCallType, filterSuccess, filterSource, filterFrom, filterTo])

  function showToast(msg: string, kind: 'ok' | 'err' = 'ok') {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3000)
  }

  function handleSelectRow(row: AiProviderCallLogRecord, checked: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(row.id); else next.delete(row.id)
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
      await deleteProviderCallLog(confirmDel)
      showToast('Deleted')
      load(page)
    } catch {
      showToast('Delete failed', 'err')
    } finally {
      setDeleting(false); setConfirmDel(null)
    }
  }

  async function handleConfirmBulkDelete() {
    setDeleting(true)
    try {
      await bulkDeleteProviderCallLogs(Array.from(selectedIds))
      showToast(`Deleted ${selectedIds.size} entries`)
      setSelectedIds(new Set())
      load(page)
      setDetailRow(null)
    } catch {
      showToast('Bulk delete failed', 'err')
    } finally {
      setDeleting(false); setConfirmBulk(false)
    }
  }

  const handleSelectAndOpen = React.useCallback((row: AiProviderCallLogRecord) => {
    setDetailRow(prev => prev?.id === row.id ? null : row)
  }, [])

  const hasFilters = !!(filterCallType || filterSuccess || filterSource || filterFrom || filterTo)

  const columns: ColumnDef<AiProviderCallLogRecord>[] = [
    {
      key: 'checkbox',
      label: (
        <input type="checkbox"
          checked={selectedIds.size === rows.length && rows.length > 0}
          onChange={e => handleSelectAll(e.target.checked)}
          style={{ cursor: 'pointer' }}
        />
      ),
      width: 36,
      render: (row) => (
        <span onClick={e => e.stopPropagation()}>
          <input type="checkbox"
            checked={selectedIds.has(row.id)}
            onChange={e => { e.stopPropagation(); handleSelectRow(row, e.target.checked) }}
            style={{ cursor: 'pointer' }}
          />
        </span>
      ),
    },
    {
      key: 'time',
      label: 'Time',
      width: 160,
      render: (row) => (
        <>
          <div className="mono" style={{ fontSize: 11 }}>{fmtAgeFromIso(row.created_at)}</div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>{fmtTsStr(row.created_at)}</div>
        </>
      ),
    },
    {
      key: 'call_type',
      label: 'Type',
      render: (row) => <Chip kind={callTypeKind(row.call_type)}>{row.call_type}</Chip>,
    },
    {
      key: 'provider_name',
      label: 'Provider',
      render: (row) => (
        <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
          {row.provider_name ?? <span style={{ color: 'var(--fg-tertiary)' }}>—</span>}
        </span>
      ),
    },
    {
      key: 'model',
      label: 'Model',
      render: (row) => (
        <span className="mono" style={{ fontSize: 11, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
          {row.model ?? '—'}
        </span>
      ),
    },
    {
      key: 'tokens_in',
      label: 'Tok in',
      align: 'right',
      render: (row) => <span className="mono" style={{ fontSize: 11 }}>{row.tokens_in?.toLocaleString() ?? '—'}</span>,
    },
    {
      key: 'tokens_out',
      label: 'Tok out',
      align: 'right',
      render: (row) => <span className="mono" style={{ fontSize: 11 }}>{row.tokens_out?.toLocaleString() ?? '—'}</span>,
    },
    {
      key: 'tokens_total',
      label: 'Total',
      align: 'right',
      render: (row) => <span className="mono" style={{ fontSize: 11 }}>{row.tokens_total?.toLocaleString() ?? '—'}</span>,
    },
    {
      key: 'duration',
      label: 'Duration',
      render: (row) => <span className="mono" style={{ fontSize: 11 }}>{fmtMs(row.duration_ms)}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => row.success
        ? <Chip kind="ok" dot>OK</Chip>
        : <span style={{ display: 'flex', gap: 4 }}>
            <Chip kind="err" dot>Err</Chip>
            {isTimeoutError(row.error_message) && <Chip kind="warn">Timeout</Chip>}
          </span>,
    },
    {
      key: 'source',
      label: 'Source',
      render: (row) => <Chip kind="muted">{row.source}</Chip>,
    },
    {
      key: 'chevron',
      label: '',
      width: 32,
      render: (row) => (
        <span style={{ color: 'var(--fg-tertiary)', fontSize: 13, transform: detailRow?.id === row.id ? 'rotate(90deg)' : undefined, display: 'inline-block', transition: 'transform 150ms' }}>›</span>
      ),
    },
  ]

  return (
    <div className="page fade-in">
      {toast && <Toast msg={toast.msg} kind={toast.kind} />}
      {detailRow && (
        <DetailDrawer
          row={detailRow}
          onClose={() => setDetailRow(null)}
          onDelete={() => setConfirmDel(detailRow.id)}
        />
      )}
      {confirmDel && (
        <ConfirmModal
          title="Delete provider call log"
          message={<><strong>ID:</strong> {confirmDel}<br />Permanently delete this log record? This cannot be undone.</>}
          confirmLabel="Delete" danger
          onClose={() => setConfirmDel(null)} onConfirm={handleConfirmDelete} busy={deleting}
        />
      )}
      {confirmBulk && (
        <ConfirmModal
          title="Delete selected logs"
          message={<><strong>{selectedIds.size}</strong> records will be permanently deleted. This cannot be undone.</>}
          confirmLabel="Delete all" danger
          onClose={() => setConfirmBulk(false)} onConfirm={handleConfirmBulkDelete} busy={deleting}
        />
      )}

      {showDeleteModal && (
        <DeleteLogsModal
          title="Delete provider call logs older than"
          onClose={() => { setShowDeleteModal(false); load(1) }}
          onDelete={handleDeleteProviderCallLogs}
        />
      )}

      <Breadcrumbs pageId="provider-logs" />
      <PageHeader title="AI Provider Log" subtitle="Raw outbound calls to AI providers — upstream, classifier, T2, content quality, knowledge developer, and more."
        actions={<><button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setShowDeleteModal(true)} title="Delete old logs"><Trash2 w={14} /> Delete old logs</button><button className="btn btn-ghost btn-sm" onClick={() => load(page)} title="Refresh data"><RefreshCw w={14} /></button></>} />

      <div className="card" style={{ padding: '12px 16px', marginBottom: 12, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 120 }}>
          <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginBottom: 2 }}>Tokens In</div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>{stats.tokensInTotal.toLocaleString()}</div>
        </div>
        <div style={{ minWidth: 120 }}>
          <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginBottom: 2 }}>Tokens Out</div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>{stats.tokensOutTotal.toLocaleString()}</div>
        </div>
        <div style={{ minWidth: 120 }}>
          <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginBottom: 2 }}>Total Tokens</div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>{stats.tokensTotal.toLocaleString()}</div>
        </div>
        <div style={{ minWidth: 80 }}>
          <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginBottom: 2 }}>Total Calls</div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>{stats.totalCalls.toLocaleString()}</div>
        </div>
      </div>

      <FilterBar mb={12}>
        <select className="select" value={filterCallType} onChange={e => setFilterCallType(e.target.value)} style={{ width: 160 }}>
          <option value="">All call types</option>
          <option value="upstream">Upstream</option>
          <option value="cache">Cache</option>
          <option value="classifier">Classifier</option>
          <option value="t2">T2 Intent</option>
          <option value="knowledge_dev">Knowledge Dev</option>
          <option value="content_quality">Content Quality</option>
          <option value="refusal_generation">Refusal Generation</option>
          <option value="knowledge_dedup">Knowledge Dedup</option>
          <option value="chat">Chat</option>
          <option value="test">Test</option>
        </select>

        <select className="select" value={filterSuccess} onChange={e => setFilterSuccess(e.target.value)} style={{ width: 150 }}>
          <option value="">All statuses</option>
          <option value="true">Success</option>
          <option value="false">Failed</option>
        </select>

        <select className="select" value={filterSource} onChange={e => setFilterSource(e.target.value)} style={{ width: 140 }}>
          <option value="">All sources</option>
          <option value="pipeline">Pipeline</option>
          <option value="test">Test</option>
        </select>

        <span className="label" style={{ marginLeft: 4 }}>From</span>
        <input style={{ ...FILTER_INPUT_STYLE, width: 148 }} type="datetime-local" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
        <span className="label">To</span>
        <input style={{ ...FILTER_INPUT_STYLE, width: 148 }} type="datetime-local" value={filterTo} onChange={e => setFilterTo(e.target.value)} />

        {hasFilters && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilterCallType(''); setFilterSuccess(''); setFilterSource(''); setFilterFrom(''); setFilterTo('') }}>Clear</button>
        )}
        <div style={{ flex: 1 }} />
        {!loading && <span className="caption">{meta.total.toLocaleString()} logs</span>}
      </FilterBar>

      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<DatabaseRi w={28} />}
          title="No provider call logs found."
          subtitle={hasFilters ? 'Try clearing the filters.' : undefined}
        />
      ) : (
        <div className="card">
          <BulkActionBar selectedCount={selectedIds.size} onDelete={() => setConfirmBulk(true)} busy={deleting} />
          <DataTable
            card={false}
            columns={columns}
            data={rows}
            rowKey={row => row.id}
            onRowClick={handleSelectAndOpen}
            rowClassName={row => detailRow?.id === row.id ? 'selected' : undefined}
            minWidth={960}
          >
            <Pagination page={page} totalPages={meta.totalPages} onPage={p => load(p)} />
          </DataTable>
        </div>
      )}
    </div>
  )
}
