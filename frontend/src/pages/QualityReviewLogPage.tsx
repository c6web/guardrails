import React from 'react'
import { PageHeader, Breadcrumbs, KV, Drawer, DataTable, type ColumnDef } from '../components/ui'
import { getAllReviewLogs, type ReviewLogEntry } from '../api/qualityReview'
import { Pagination } from './components/AIActivitiesShared'

const RESOURCE_LABELS: Record<string, string> = {
  'threat-knowledge':    'Threat Knowledge',
  'detectors':           'Detector Rules',
  'tools':               'Tool Guardrails',
  't2-agent-prompts':    'T2 Agent Prompts',
  'content-quality-judge-prompts': 'Content Quality Agent',
}

const QUALITY_COLORS: Record<string, string> = {
  good: 'var(--ok)',
  poison: 'var(--danger)',
  poor_quality: 'var(--warn)',
}

const RESOURCE_TYPES = ['threat-knowledge', 'detectors', 'tools', 't2-agent-prompts', 'content-quality-judge-prompts'] as const

export default function QualityReviewLogPage() {
  const [filterType, setFilterType] = React.useState<string>('')
  const [entries, setEntries] = React.useState<ReviewLogEntry[]>([])
  const [loading, setLoading] = React.useState(false)
  const [page, setPage] = React.useState(1)
  const [totalPages, setTotalPages] = React.useState(1)
  const [selectedRow, setSelectedRow] = React.useState<ReviewLogEntry | null>(null)
  const limit = 30

  React.useEffect(() => {
    loadLogs(page)
  }, [filterType, page])

  async function loadLogs(p: number) {
    setLoading(true)
    try {
      const res = await getAllReviewLogs(filterType || undefined, p, limit)
      setEntries(res.data)
      setTotalPages(res.meta.totalPages)
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }

  const columns: ColumnDef<ReviewLogEntry>[] = [
    {
      key: 'createdAt',
      label: 'Date',
      width: 140,
      render: (e) => (
        <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>
          {e.createdAt ? new Date(e.createdAt).toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'target_type',
      label: 'Type',
      width: 120,
      render: (e) => (
        <span style={{ fontSize: 12 }}>{RESOURCE_LABELS[e.target_type] ?? e.target_type}</span>
      ),
    },
    {
      key: 'target_name',
      label: 'Target',
      render: (e) => (
        <span style={{ fontSize: 13, fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {e.target_name}
        </span>
      ),
    },
    {
      key: 'new_result',
      label: 'Result',
      width: 100,
      render: (e) => (
        <span style={{ color: QUALITY_COLORS[e.new_result] || 'var(--fg-secondary)', fontWeight: 600, fontSize: 12, textTransform: 'capitalize' }}>
          {e.new_result === 'poor_quality' ? 'poor' : e.new_result}
        </span>
      ),
    },
    {
      key: 'review_provider_name',
      label: 'Provider',
      width: 140,
      render: (e) => (
        <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {e.review_provider_name ? `${e.review_provider_name}${e.review_model ? ` · ${e.review_model}` : ''}` : '—'}
        </span>
      ),
    },
    {
      key: 'reason',
      label: 'Reason',
      render: (e) => (
        <span style={{ fontSize: 12, color: 'var(--fg-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {e.reason}
        </span>
      ),
    },
    {
      key: 'reviewed_by_email',
      label: 'Reviewed By',
      width: 150,
      render: (e) => (
        <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>{e.reviewed_by_email}</span>
      ),
    },
  ]

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="quality-review-log" />
      <PageHeader title="Quality Review Log" subtitle="Audit trail of all AI-powered quality reviews performed on threat knowledge, detector rules, and tool guardrails." />

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['', ...RESOURCE_TYPES].map(t => (
          <button key={t || 'all'} className={`btn btn-ghost btn-sm${filterType === t ? ' active' : ''}`}
            style={{ fontSize: 11 }}
            onClick={() => { setFilterType(t); setPage(1) }}>
            {t ? RESOURCE_LABELS[t] ?? t : 'All'}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={entries}
        rowKey={e => e.id}
        onRowClick={e => setSelectedRow(prev => prev?.id === e.id ? null : e)}
        loading={loading}
        emptyMessage="No review logs found."
        minWidth={700}
        rowClassName={e => selectedRow?.id === e.id ? 'selected' : undefined}
      >
        <Pagination page={page} totalPages={totalPages} onPage={p => setPage(p)} />
      </DataTable>

      {/* Detail drawer */}
      <Drawer
        open={!!selectedRow}
        title={selectedRow ? (
            <>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{selectedRow.target_name}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2 }}>
                {RESOURCE_LABELS[selectedRow.target_type] ?? selectedRow.target_type} · Quality Review
              </div>
            </>
          ) : <></>}
          onClose={() => setSelectedRow(null)}
          footer={
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedRow(null)}>Back</button>
          }
        >
          {selectedRow && (
          <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
            <KV labelWidth={140} gap={8} rows={[
              { label: 'Date', value: <span style={{ fontSize: 12 }}>{selectedRow.createdAt ? new Date(selectedRow.createdAt).toLocaleString() : '—'}</span>, mono: true },
              { label: 'Type', value: <span style={{ fontSize: 12 }}>{RESOURCE_LABELS[selectedRow.target_type] ?? selectedRow.target_type}</span> },
              { label: 'Target', value: <span style={{ fontSize: 12, fontWeight: 500 }}>{selectedRow.target_name}</span> },
              { label: 'Result', value: (
                <span style={{ color: QUALITY_COLORS[selectedRow.new_result] || 'var(--fg-secondary)', fontWeight: 600, fontSize: 12, textTransform: 'capitalize' }}>
                  {selectedRow.new_result === 'poor_quality' ? 'poor' : selectedRow.new_result}
                </span>
              ) },
              { label: 'Previous Result', value: (
                <span style={{ fontSize: 12 }}>
                  {selectedRow.previous_result ? (
                    <span style={{ color: QUALITY_COLORS[selectedRow.previous_result] || 'var(--fg-secondary)', fontWeight: 600, textTransform: 'capitalize' }}>
                      {selectedRow.previous_result === 'poor_quality' ? 'poor' : selectedRow.previous_result}
                    </span>
                  ) : (
                    <span className="caption">—</span>
                  )}
                </span>
              ) },
              { label: 'Review Provider', value: <span style={{ fontSize: 12 }}>{selectedRow.review_provider_name || '—'}{selectedRow.review_model ? ` · ${selectedRow.review_model}` : ''}</span> },
              { label: 'Reason', value: <span style={{ fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{selectedRow.reason}</span> },
              { label: 'Reviewed By', value: <span style={{ fontSize: 12 }}>{selectedRow.reviewed_by_email}</span> },
            ]} />
          </div>
          )}
        </Drawer>
    </div>
  )
}
