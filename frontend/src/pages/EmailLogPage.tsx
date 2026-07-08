import React from 'react'
import { PageHeader, Breadcrumbs, Chip, KV, FilterBar, BulkActionBar, EmptyState, ErrorState, LoadingState, Drawer, DataTable, Pagination, type ColumnDef } from '../components/ui'
import { getNotificationLogs, deleteNotificationLog, bulkDeleteNotificationLogs, deleteNotificationLogsBefore, deleteAllNotificationLogs, type NotificationLog } from '../api/notifications'
import { RefreshCw, ChevronR, X, Inbox, Trash2, DatabaseRi } from '../components/ui/Icons'
import { DeleteLogsModal } from '../components/DeleteLogsModal'
import { SERVER_TYPES } from './components/NotificationShared'
import { ConfirmModal } from './components/ProviderShared'
import type { TweakValues } from '../types'

interface EmailLogPageProps { tweaks: TweakValues }

type StatusFilter = 'all' | 'sent' | 'failed'


// ── Detail drawer ─────────────────────────────────────────────────────────────

function RowDetail({ log, onClose, onDelete, open }: { log: NotificationLog; onClose: () => void; onDelete?: () => void; open?: boolean }) {
  return (
    <Drawer open={open}
      icon={log.status === 'sent'
        ? <Inbox w={14} style={{ color: 'var(--accent)' }} />
        : <Inbox w={14} style={{ color: 'var(--danger)' }} />
      }
      title={log.id}
      subtitle={`${log.server_name} · ${log.status}`}
      onClose={onClose}
      footer={onDelete ? (
        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={onDelete}>
          <Trash2 w={13} /> Delete this log
        </button>
      ) : undefined}
    >
      <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
        <KV labelWidth={100} gap={8} style={{ marginBottom: 18 }} rows={[
          { label: 'ID', value: log.id, mono: true },
          { label: 'Server', value: log.server_name },
          { label: 'Type', value: <Chip kind="muted" mono>{SERVER_TYPES[log.server_type]?.label ?? log.server_type}</Chip> },
          { label: 'Status', value: log.status === 'sent'
            ? <Chip kind="ok" dot>sent</Chip>
            : <Chip kind="err" dot>failed</Chip>
          },
          { label: 'Recipient', value: log.recipient, mono: true },
          { label: 'Subject', value: log.subject || '—' },
          log.message_id ? { label: 'Message ID', value: log.message_id, mono: true } : null,
          log.triggered_by ? { label: 'Triggered by', value: log.triggered_by, mono: true } : null,
          { label: 'Created', value: fmtTimeStr(log.created_at) },
        ]} />

        {log.error_message && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ padding: '12px 14px', borderRadius: 6, background: 'var(--danger-bg)', border: '1px solid var(--danger)' }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>Error</div>
              <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{log.error_message}</pre>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const EmailLogPage: React.FC<EmailLogPageProps> = () => {
  const [logs, setLogs]           = React.useState<NotificationLog[]>([])
  const [loading, setLoading]     = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [filter, setFilter]       = React.useState<StatusFilter>('all')
  const [search, setSearch]       = React.useState('')
  const [page, setPage]           = React.useState(1)
  const [total, setTotal]         = React.useState(0)
  const [selectedRow, setSelectedRow] = React.useState<NotificationLog | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [deleting, setDeleting]   = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null)
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = React.useState(false)
  const [showDeleteModal, setShowDeleteModal] = React.useState(false)

  async function handleDeleteNotificationLogs(daysBack: number | null): Promise<number> {
    if (daysBack === -1) return await deleteAllNotificationLogs()
    return await deleteNotificationLogsBefore(daysBack ?? 0)
  }

  const LIMIT = 50

  const load = React.useCallback(async (pg: number, status: StatusFilter, q: string) => {
    setLoading(true); setLoadError(null)
    try {
      const params: Record<string, string | number> = { page: pg, limit: LIMIT }
      if (status !== 'all') params['status'] = status
      const res = await getNotificationLogs(params)
      let rows = res.data
      if (q.trim()) {
        const lower = q.toLowerCase()
        rows = rows.filter(r =>
          r.recipient.toLowerCase().includes(lower) ||
          r.server_name.toLowerCase().includes(lower) ||
          r.subject.toLowerCase().includes(lower) ||
          (r.message_id ?? '').toLowerCase().includes(lower)
        )
      }
      setLogs(rows)
      setTotal(res.meta.total)
    } catch (err) {
      setLoadError((err as Error).message || 'Failed to load')
    } finally { setLoading(false) }
  }, [])

  React.useEffect(() => { load(page, filter, search) }, [load, page, filter, search])

  function handleFilter(f: StatusFilter) {
    setFilter(f); setPage(1)
    setSelectedIds(new Set())
  }

  const totalPages = Math.ceil(total / LIMIT)

  const refresh = () => load(page, filter, search)
  const sent   = logs.filter(l => l.status === 'sent').length
  const failed = logs.filter(l => l.status === 'failed').length
  const hasFilters = filter !== 'all' || !!search

  function fmtTime(iso: string | null | undefined) {
    if (!iso) return '—'
    const d = new Date(iso)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  }

  function handleSelectAndOpen(log: NotificationLog) {
    if (selectedRow?.id === log.id) {
      setSelectedRow(null)
    } else {
      setSelectedRow(log)
    }
  }

  const handleSelectRow = React.useCallback((log: NotificationLog, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(log.id)
      else next.delete(log.id)
      return next
    })
  }, [])

  const handleSelectAll = React.useCallback((checked: boolean) => {
    if (checked) setSelectedIds(new Set(logs.map(l => l.id)))
    else setSelectedIds(new Set())
  }, [logs])

  async function handleConfirmBulkDelete() {
    setDeleting(true)
    try {
      await bulkDeleteNotificationLogs(Array.from(selectedIds))
      setSelectedIds(new Set())
      await refresh()
    } catch (err) {
      console.error('Bulk delete failed', err)
    }
    finally { setDeleting(false); setBulkDeleteConfirm(false) }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteNotificationLog(deleteTarget)
      setSelectedIds(prev => { const n = new Set(prev); n.delete(deleteTarget); return n })
      await refresh()
    } catch (err) {
      console.error('Delete failed', err)
    }
    finally { setDeleting(false) }
  }

  const columns: ColumnDef<NotificationLog>[] = [
    {
      key: 'checkbox',
      label: (
        <input type="checkbox" checked={selectedIds.size === logs.length && logs.length > 0 ? true : selectedIds.size === 0 ? false : undefined} onChange={e => handleSelectAll(e.target.checked)} style={{ cursor: 'pointer' }} />
      ),
      width: 36,
      render: (log) => (
        <input type="checkbox" checked={selectedIds.has(log.id)}
          onChange={e => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); handleSelectRow(log, e.target.checked) }}
          onClick={e => e.stopPropagation()}
          style={{ cursor: 'pointer' }} />
      ),
    },
    {
      key: 'time',
      label: 'Time',
      render: (log) => <span className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)', whiteSpace: 'nowrap' }}>{fmtTime(log.created_at)}</span>,
    },
    {
      key: 'server',
      label: 'Server',
      render: (log) => (
        <>
          <div style={{ fontSize: 12, fontWeight: 500 }}>{log.server_name}</div>
          <div style={{ fontSize: 10 }}><Chip kind="muted" mono>{SERVER_TYPES[log.server_type]?.label ?? log.server_type}</Chip></div>
        </>
      ),
    },
    {
      key: 'recipient',
      label: 'Recipient',
      render: (log) => <span className="mono" style={{ fontSize: 12 }}>{log.recipient}</span>,
    },
    {
      key: 'subject',
      label: 'Subject',
      render: (log) => <span style={{ fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.subject}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (log) => log.status === 'sent'
        ? <Chip kind="ok" dot>sent</Chip>
        : <Chip kind="err" dot>failed</Chip>,
    },
    {
      key: 'chevron',
      label: null,
      width: 32,
      render: (log) => <ChevronR w={13} style={{ color: 'var(--fg-tertiary)', transform: selectedRow?.id === log.id ? 'rotate(90deg)' : undefined, transition: 'transform 150ms' }} />,
    },
  ]

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="email-log" />
      <PageHeader title="Email Log" subtitle={<><span>Track delivery history for all system-generated emails — alerts, invites, and reports. Review sent/failed status, inspect delivery errors, and delete old logs.<br /></span><b className="mono">{total}</b> total &middot; <b className="mono" style={{ color: 'var(--ok)' }}>{sent}</b> sent &middot; <b className="mono" style={{ color: 'var(--danger)' }}>{failed}</b> failed (this page)</>}
        actions={<><button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setShowDeleteModal(true)} title="Delete old logs"><Trash2 w={14} /> Delete old logs</button><button className="btn btn-ghost btn-sm" onClick={refresh} title="Refresh data"><RefreshCw w={14} /></button></>} />

      <FilterBar mb={12}>
        <span className="label">Filter</span>
        {(['all', 'sent', 'failed'] as StatusFilter[]).map(f => (
          <button key={f} className={`filter-chip ${filter === f ? 'active' : ''}`} onClick={() => handleFilter(f)}>
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <div style={{ flex: 1, minWidth: 80 }} />
        <input
          className="input"
          type="search"
          placeholder="Search recipient, server…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          style={{ width: 220 }}
        />
      </FilterBar>

      {loading ? (
        <LoadingState />
      ) : loadError ? (
        <ErrorState title="Failed to load logs" message={loadError} onRetry={() => load(page, filter, search)} />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={<DatabaseRi w={28} />}
          title={hasFilters ? 'No logs match this filter.' : 'No email activity yet.'}
          subtitle={hasFilters ? 'Try clearing the filters.' : undefined}
        />
      ) : (
        <div className="card">
          <BulkActionBar selectedCount={selectedIds.size} onDelete={() => setBulkDeleteConfirm(true)} busy={deleting} />
          <DataTable card={false} columns={columns} data={logs} rowKey={l => l.id} onRowClick={handleSelectAndOpen} minWidth={600}
            rowClassName={l => l.id === selectedRow?.id ? 'selected' : undefined} />
          {selectedRow && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-sunken)' }}>
              <div className="row-tight" style={{ marginBottom: 8, justifyContent: 'space-between' }}>
                <span className="label-strong">Email detail</span>
                <button className="icon-btn" onClick={() => setSelectedRow(null)}><X w={13} /></button>
              </div>
              <KV labelWidth={80} gap={8} style={{ fontSize: 12 }} rows={[
                { label: 'ID', value: selectedRow.id, mono: true },
                { label: 'Server', value: selectedRow.server_name },
                { label: 'Type', value: <Chip kind="muted" mono>{SERVER_TYPES[selectedRow.server_type]?.label ?? selectedRow.server_type}</Chip> },
                { label: 'Status', value: selectedRow.status === 'sent'
                  ? <Chip kind="ok" dot>sent</Chip>
                  : <Chip kind="err" dot>failed</Chip>
                },
                { label: 'Recipient', value: selectedRow.recipient, mono: true },
                { label: 'Subject', value: selectedRow.subject || '—' },
                selectedRow.message_id ? { label: 'Message ID', value: selectedRow.message_id, mono: true } : null,
                selectedRow.triggered_by ? { label: 'Triggered by', value: selectedRow.triggered_by, mono: true } : null,
                { label: 'Created', value: fmtTime(selectedRow.created_at) },
              ]} />
              {selectedRow.error_message && (
                <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 6, background: 'var(--danger-bg)', border: '1px solid var(--danger)' }}>
                  <div className="label" style={{ marginBottom: 4 }}>Error</div>
                  <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>{selectedRow.error_message}</pre>
                </div>
              )}
            </div>
          )}
          <Pagination page={page} totalPages={totalPages} onPage={p => setPage(p)} />
        </div>
      )}

      {selectedRow && (
        <RowDetail log={selectedRow} onClose={() => setSelectedRow(null)} onDelete={() => { setDeleteTarget(selectedRow.id); setSelectedRow(null) }} />
      )}

      {deleteTarget && !deleting && (
        <ConfirmModal title="Delete email log"
          message={<><strong>ID:</strong> {deleteTarget}<br />Permanently delete this email log entry? This cannot be undone.</>}
          confirmLabel="Delete" danger
          onClose={() => setDeleteTarget(null)} onConfirm={handleConfirmDelete} busy={deleting} />
      )}

      {bulkDeleteConfirm && !deleting && (
        <ConfirmModal title="Delete selected logs"
          message={<><strong>{selectedIds.size}</strong> email log entries will be permanently deleted. This cannot be undone.</>}
          confirmLabel="Delete all" danger
          onClose={() => setBulkDeleteConfirm(false)} onConfirm={handleConfirmBulkDelete} busy={deleting} />
      )}

      {showDeleteModal && (
        <DeleteLogsModal
          title="Delete email logs older than"
          onClose={() => { setShowDeleteModal(false); refresh() }}
          onDelete={handleDeleteNotificationLogs}
        />
      )}
    </div>
  )
}

function fmtTimeStr(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export default EmailLogPage
