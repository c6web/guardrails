import React from 'react'
import { PageHeader, Breadcrumbs, Chip, FILTER_INPUT_STYLE, FilterBar, EmptyState, DataTable } from '../components/ui'
import type { ColumnDef } from '../components/ui/DataTable'
import { RefreshCw, DatabaseRi } from '../components/ui/Icons'
import { getProviderCallLogs, getProviderCallLogStats } from '../api/aiProviderCallLogs'
import type { AiProviderCallLogRecord, ProviderCallLogStats } from '../api/aiProviderCallLogs'
import type { LogMeta } from '../api/logs'
import { fmtAgeFromIso } from '../utils/format'
import { fmtMs, Pagination, DetailDrawer } from './components/ProviderCallLogPrimitives'
import type { TweakValues } from '../types'

interface ContentQualityLogPageProps { tweaks: TweakValues }

function parseScores(responsePayload: unknown): { groundedness: string; relevance: string; hallucination: string } | null {
  if (!responsePayload) return null
  try {
    const parsed = JSON.parse(typeof responsePayload === 'string' ? responsePayload : JSON.stringify(responsePayload))
    return {
      groundedness: parsed.groundedness ?? '—',
      relevance: parsed.relevance ?? '—',
      hallucination: parsed.hallucination ?? '—',
    }
  } catch {
    return null
  }
}

function scoreBadge(value: string): React.ReactElement {
  const num = parseFloat(value)
  if (isNaN(num)) return <span style={{ color: 'var(--fg-tertiary)' }}>{value}</span>
  if (num >= 0.7) return <Chip kind="ok">{value}</Chip>
  if (num >= 0.4) return <Chip kind="warn">{value}</Chip>
  return <Chip kind="err">{value}</Chip>
}

export default function ContentQualityLogPage(_props: ContentQualityLogPageProps) {
  const [rows, setRows]               = React.useState<AiProviderCallLogRecord[]>([])
  const [meta, setMeta]               = React.useState<LogMeta>({ page: 1, limit: 50, total: 0, totalPages: 0 })
  const [stats, setStats]             = React.useState<ProviderCallLogStats>({ tokensInTotal: 0, tokensOutTotal: 0, tokensTotal: 0, totalCalls: 0 })
  const [page, setPage]               = React.useState(1)
  const [loading, setLoading]         = React.useState(true)
  const [detailRow, setDetailRow]     = React.useState<AiProviderCallLogRecord | null>(null)
  const [toast, setToast]             = React.useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)

  const [filterSuccess, setFilterSuccess] = React.useState('')
  const [filterSource, setFilterSource]   = React.useState('')
  const [filterFrom, setFilterFrom]       = React.useState('')
  const [filterTo, setFilterTo]           = React.useState('')

  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  async function load(p = page) {
    setPage(p)
    setLoading(true)
    try {
      const params: Parameters<typeof getProviderCallLogs>[0] = { page: p, limit: 50, call_type: 'content_quality' }
      if (filterSuccess !== '')   params.success = filterSuccess === 'true'
      if (filterSource)           params.source  = filterSource
      if (filterFrom)             params.from    = filterFrom
      if (filterTo)               params.to      = filterTo
      const [res, statsRes] = await Promise.all([
        getProviderCallLogs(params),
        getProviderCallLogStats(params),
      ])
      setRows(res.rows)
      setMeta(res.meta)
      setStats(statsRes)
    } catch {
      setToast({ msg: 'Failed to load content quality logs', kind: 'err' })
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => { load(1); setPage(1) }, [filterSuccess, filterSource, filterFrom, filterTo])

  const hasFilters = !!(filterSuccess || filterSource || filterFrom || filterTo)

  const handleSelectAndOpen = React.useCallback((row: AiProviderCallLogRecord) => {
    setDetailRow(prev => prev?.id === row.id ? null : row)
  }, [])

  const columns: ColumnDef<AiProviderCallLogRecord>[] = [
    {
      key: 'time',
      label: 'Time',
      width: 160,
      render: (row) => (
        <>
          <div className="mono" style={{ fontSize: 11 }}>{fmtAgeFromIso(row.created_at)}</div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>{new Date(row.created_at).toLocaleString()}</div>
        </>
      ),
    },
    {
      key: 'app',
      label: 'App',
      render: (row) => (
        <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
          {row.app_name ?? <span style={{ color: 'var(--fg-tertiary)' }}>—</span>}
        </span>
      ),
    },
    {
      key: 'source',
      label: 'Source',
      render: (row) => <Chip kind="muted">{row.source}</Chip>,
    },
    {
      key: 'vendor',
      label: 'Vendor',
      render: (row) => <span className="mono" style={{ fontSize: 11 }}>{row.vendor ?? '—'}</span>,
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
      key: 'groundedness',
      label: 'Groundedness',
      render: (row) => {
        const scores = row.success ? parseScores(row.response_payload) : null
        return scores ? scoreBadge(scores.groundedness) : <span style={{ color: 'var(--fg-tertiary)' }}>—</span>
      },
    },
    {
      key: 'relevance',
      label: 'Relevance',
      render: (row) => {
        const scores = row.success ? parseScores(row.response_payload) : null
        return scores ? scoreBadge(scores.relevance) : <span style={{ color: 'var(--fg-tertiary)' }}>—</span>
      },
    },
    {
      key: 'hallucination',
      label: 'Hallucination',
      render: (row) => {
        const scores = row.success ? parseScores(row.response_payload) : null
        return scores ? scoreBadge(scores.hallucination) : <span style={{ color: 'var(--fg-tertiary)' }}>—</span>
      },
    },
    {
      key: 'duration',
      label: 'Duration',
      render: (row) => <span className="mono" style={{ fontSize: 11 }}>{fmtMs(row.duration_ms)}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => row.success ? <Chip kind="ok" dot>OK</Chip> : <Chip kind="err" dot>Err</Chip>,
    },
    {
      key: 'chevron',
      label: '',
      width: 32,
      render: (row) => (
        <span style={{
          color: 'var(--fg-tertiary)', fontSize: 13,
          transform: detailRow?.id === row.id ? 'rotate(90deg)' : undefined,
          display: 'inline-block', transition: 'transform 150ms',
        }}>›</span>
      ),
    },
  ]

  return (
    <div className="page fade-in">
      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 9999,
          padding: '10px 16px', borderRadius: 6,
          background: toast.kind === 'ok' ? 'var(--accent)' : 'var(--danger)',
          color: '#fff', fontSize: 13, fontWeight: 500,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}>{toast.msg}</div>
      )}
      {detailRow && (
        <DetailDrawer
          row={detailRow}
          onClose={() => setDetailRow(null)}
        />
      )}

      <Breadcrumbs pageId="content-quality-log" />
      <PageHeader title="Content Quality Log" subtitle="Groundedness, relevance, and hallucination scores from the Content Quality Agent."
        actions={<button className="btn btn-ghost btn-sm" onClick={() => load(page)} title="Refresh data"><RefreshCw w={14} /></button>} />

      <div className="card" style={{ padding: '12px 16px', marginBottom: 12, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 80 }}>
          <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginBottom: 2 }}>Total Calls</div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>{stats.totalCalls.toLocaleString()}</div>
        </div>
        <div style={{ minWidth: 120 }}>
          <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginBottom: 2 }}>Tokens In</div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>{stats.tokensInTotal.toLocaleString()}</div>
        </div>
        <div style={{ minWidth: 120 }}>
          <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginBottom: 2 }}>Tokens Out</div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>{stats.tokensOutTotal.toLocaleString()}</div>
        </div>
      </div>

      <FilterBar mb={12}>
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
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilterSuccess(''); setFilterSource(''); setFilterFrom(''); setFilterTo('') }}>Clear</button>
        )}
        <div style={{ flex: 1 }} />
        {!loading && <span className="caption">{meta.total.toLocaleString()} logs</span>}
      </FilterBar>

      <DataTable
        columns={columns}
        data={rows}
        rowKey={row => row.id}
        onRowClick={handleSelectAndOpen}
        loading={loading}
        emptyMessage="No content quality logs found."
        emptyState={hasFilters ? (
          <EmptyState
            icon={<DatabaseRi w={28} />}
            title="No content quality logs found."
            subtitle="Try clearing the filters."
          />
        ) : undefined}
        minWidth={960}
        rowClassName={row => detailRow?.id === row.id ? 'selected' : undefined}
      >
        <Pagination page={page} totalPages={meta.totalPages} onPage={p => load(p)} />
      </DataTable>
    </div>
  )
}
