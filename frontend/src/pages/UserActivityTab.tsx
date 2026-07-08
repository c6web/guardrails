import React from 'react'
import { Chip, StatCard, KV, FilterBar, BulkActionBar, EmptyState, Drawer, DataTable } from '../components/ui'
import type { ColumnDef } from '../components/ui'
import { Trash2, User, ChevronR, RefreshCw } from '../components/ui/Icons'
import { getActivityLogs, getActivityStats, deleteActivityLog, bulkDeleteActivityLogs } from '../api/logs'
import type { ActivityRecord, ActivityStats } from '../api/logs'
import { fmtTsStr, fmtAgeFromIso } from '../utils/format'
import { ConfirmModal } from './components/ProviderShared'
import { JsonBlock, Pagination, inputStyle } from './components/AuditShared'

// ── User Activity constants & helpers ─────────────────────────────────────────

const ACTIVITY_LABELS: Record<string, string> = {
  login:          'Logged in',
  logout:         'Logged out',
  login_failed:   'Login failed',
  login_blocked:  'Login blocked',
  profile_update: 'Profile updated',
}

function activityChip(type: string) {
  if (type === 'login')          return <Chip kind="ok"    dot>{ACTIVITY_LABELS[type] ?? type}</Chip>
  if (type === 'logout')         return <Chip kind="muted" dot>{ACTIVITY_LABELS[type] ?? type}</Chip>
  if (type === 'login_failed')   return <Chip kind="err"   dot>{ACTIVITY_LABELS[type] ?? type}</Chip>
  if (type === 'login_blocked')  return <Chip kind="err"   dot>{ACTIVITY_LABELS[type] ?? type}</Chip>
  if (type === 'profile_update') return <Chip kind="info"  dot>{ACTIVITY_LABELS[type] ?? type}</Chip>
  return <Chip kind="muted" dot>{type}</Chip>
}

const ACTIVITY_TYPES = ['login', 'logout', 'login_failed', 'login_blocked', 'profile_update']

// ── Activity drawer ───────────────────────────────────────────────────────────

function ActivityRowDetail({ record, open, onClose, onDelete }: { record: ActivityRecord; onClose: () => void; onDelete?: () => void; open?: boolean }) {
  return (
    <Drawer open={open}
      title={
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <User w={14} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>{record.id}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 2 }}>
            {activityChip(record.activity_type)} · {record.user_email}
          </div>
        </>
      }
      onClose={onClose}
      footer={onDelete ? (
        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={onDelete}>
          <Trash2 w={13} /> Delete this record
        </button>
      ) : undefined}
    >
      <div style={{ padding: '16px 20px' }}>
        <KV
          labelWidth={100} gap={8} style={{ marginBottom: 18 }}
          rows={[
            { label: 'Event', value: activityChip(record.activity_type) },
            { label: 'User', value: record.user_email },
            record.user_id && { label: 'User ID', value: record.user_id, mono: true },
            { label: 'IP', value: record.ip_address, mono: true },
            { label: 'Time', value: fmtTsStr(record.created_at), mono: true },
          ]}
        />

        {record.details && Object.keys(record.details).length > 0 && (
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Details</div>
            <JsonBlock data={record.details} />
          </div>
        )}
      </div>
    </Drawer>
  )
}

// ── User Activity Tab ─────────────────────────────────────────────────────────

function UserActivityTab({ refresh }: { refresh?: () => void }) {
  const [rows, setRows]         = React.useState<ActivityRecord[]>([])
  const [loading, setLoading]   = React.useState(true)
  const [page, setPage]         = React.useState(1)
  const [totalPages, setTotalPages] = React.useState(1)
  const [total, setTotal]       = React.useState(0)
  const [selected, setSelected] = React.useState<ActivityRecord | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [deleting, setDeleting] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null)
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = React.useState(false)
  const [typeFilter,  setTypeFilter]  = React.useState('')
  const [emailFilter, setEmailFilter] = React.useState('')
  const [fromDate,    setFromDate]    = React.useState('')
  const [toDate,      setToDate]      = React.useState('')
  const [stats, setStats] = React.useState<ActivityStats | null>(null)
  const [statsLoading, setStatsLoading] = React.useState(true)

  const loadRef = React.useRef(async (p: number) => {
    setLoading(true)
    try {
      const res = await getActivityLogs({
        page: p, limit: 50,
        activity_type: typeFilter  || undefined,
        user_email:    emailFilter || undefined,
        from: fromDate || undefined,
        to:   toDate   || undefined,
      })
      setRows(res.rows)
      setTotal(res.meta.total)
      setTotalPages(res.meta.totalPages)
      setPage(p)
    } catch { /* silent */ }
    finally { setLoading(false) }
  })

  React.useEffect(() => { loadRef.current(1) }, [typeFilter, emailFilter, fromDate, toDate])

  React.useEffect(() => {
    setStatsLoading(true)
    getActivityStats({
      activity_type: typeFilter  || undefined,
      user_email:    emailFilter || undefined,
      from: fromDate || undefined,
      to:   toDate   || undefined,
    }).then(setStats).catch(() => {}).finally(() => setStatsLoading(false))
  }, [typeFilter, emailFilter, fromDate, toDate])

  const doRefresh = () => loadRef.current(1)
  const refreshCbRef = React.useRef(refresh)
  React.useEffect(() => { refreshCbRef.current = refresh }, [refresh])

  React.useEffect(() => {
    if (refresh) refresh()
  }, [])

  const hasFilters = !!(typeFilter || emailFilter || fromDate || toDate)
  const clearFilters = () => { setTypeFilter(''); setEmailFilter(''); setFromDate(''); setToDate('') }

  const handleSelectRow = React.useCallback((row: ActivityRecord, checked: boolean) => {
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
      await bulkDeleteActivityLogs(Array.from(selectedIds))
      setSelectedIds(new Set())
      await loadRef.current(1)
      setSelected(null)
    } catch (err) {
      console.error('Bulk delete failed', err)
    }
    finally { setDeleting(false); setBulkDeleteConfirm(false) }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteActivityLog(deleteTarget)
      setSelectedIds(prev => { const n = new Set(prev); n.delete(deleteTarget); return n })
      await loadRef.current(page)
      setSelected(null)
    } catch (err) {
      console.error('Delete failed', err)
    }
    finally { setDeleting(false) }
  }

  const handleSelectAndOpen = React.useCallback((row: ActivityRecord) => {
    if (selected?.id === row.id) {
      setSelected(null)
    } else {
      setSelected(row)
    }
  }, [selected])

  const columns: ColumnDef<ActivityRecord>[] = [
    {
      key: 'checkbox',
      label: <input type="checkbox" checked={selectedIds.size === rows.length && rows.length > 0 ? true : selectedIds.size === 0 ? false : undefined} onChange={e => handleSelectAll(e.target.checked)} style={{ cursor: 'pointer' }} />,
      width: 36,
      render: (r) => <input type="checkbox" checked={selectedIds.has(r.id)} onChange={e => handleSelectRow(r, e.target.checked)} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer' }} />,
    },
    {
      key: 'time',
      label: 'Time',
      width: 160,
      render: (r) => (
        <>
          <div className="mono" style={{ fontSize: 11 }}>{fmtAgeFromIso(r.created_at)}</div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>{fmtTsStr(r.created_at)}</div>
        </>
      ),
    },
    {
      key: 'user',
      label: 'User',
      render: (r) => <div style={{ fontSize: 12, fontWeight: 500 }}>{r.user_email}</div>,
    },
    {
      key: 'event',
      label: 'Event',
      render: (r) => activityChip(r.activity_type),
    },
    {
      key: 'ip',
      label: 'IP address',
      render: (r) => <span className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{r.ip_address}</span>,
    },
    {
      key: 'chevron',
      label: '',
      width: 32,
      render: (r) => <ChevronR w={13} style={{ color: 'var(--fg-tertiary)', transform: selected?.id === r.id ? 'rotate(90deg)' : undefined, transition: 'transform 150ms' }} />,
    },
  ]

  return (
    <div>
      <div className="kpi-row">
        <StatCard label="Total events" loading={statsLoading} value={(stats?.total ?? 0).toLocaleString()} />
        <StatCard label="Failed logins" tone="danger" loading={statsLoading} value={(stats?.failed_logins ?? 0).toLocaleString()} />
        <StatCard label="Blocked logins" tone="danger" loading={statsLoading} value={(stats?.blocked_logins ?? 0).toLocaleString()} />
        <StatCard label="Unique users" loading={statsLoading} value={(stats?.unique_users ?? 0).toLocaleString()} />
      </div>

      <FilterBar mb={12}>
        <span className="label">Type</span>
        <select className="select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ width: 150 }}>
          <option value="">All types</option>
          {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{ACTIVITY_LABELS[t] ?? t}</option>)}
        </select>
        <span className="sep" />
        <input style={{ ...inputStyle, width: 180 }} type="email" placeholder="Filter by email…" value={emailFilter} onChange={e => setEmailFilter(e.target.value)} />
        <span className="sep" />
        <span className="label">From</span>
        <input style={{ ...inputStyle, width: 140 }} type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
        <span className="label">To</span>
        <input style={{ ...inputStyle, width: 140 }} type="date" value={toDate}   onChange={e => setToDate(e.target.value)} />
        {hasFilters && <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear</button>}
        <div style={{ flex: 1 }} />
        {!loading && <span className="caption">{total.toLocaleString()} events</span>}
        <button className="btn btn-ghost btn-sm" onClick={doRefresh} title="Refresh data"><RefreshCw w={14} /></button>
      </FilterBar>

      {loading || rows.length === 0 ? (
        <DataTable
          columns={columns}
          data={rows}
          rowKey={r => r.id}
          loading={loading}
          emptyState={<EmptyState title={'No activity records found.' + (hasFilters ? ' Try clearing the filters.' : '')} />}
          card={false}
        />
      ) : (
        <div className="card">
          <BulkActionBar selectedCount={selectedIds.size} onDelete={() => setBulkDeleteConfirm(true)} busy={deleting} />
          <DataTable
            columns={columns}
            data={rows}
            rowKey={r => r.id}
            onRowClick={handleSelectAndOpen}
            rowClassName={r => selected?.id === r.id ? 'selected' : undefined}
            card={false}
          >
            <Pagination page={page} totalPages={totalPages} onPage={p => loadRef.current(p)} />
          </DataTable>
        </div>
      )}

      {selected && <ActivityRowDetail record={selected} onClose={() => setSelected(null)} onDelete={() => { setDeleteTarget(selected.id); setSelected(null) }} />}

      {deleteTarget && !deleting && (
        <ConfirmModal title="Delete activity record"
          message={<><strong>ID:</strong> {deleteTarget}<br />Permanently delete this activity record? This cannot be undone.</>}
          confirmLabel="Delete" danger
          onClose={() => setDeleteTarget(null)} onConfirm={handleConfirmDelete} busy={deleting} />
      )}

      {bulkDeleteConfirm && !deleting && (
        <ConfirmModal title="Delete selected records"
          message={<><strong>{selectedIds.size}</strong> activity records will be permanently deleted. This cannot be undone.</>}
          confirmLabel="Delete all" danger
          onClose={() => setBulkDeleteConfirm(false)} onConfirm={handleConfirmBulkDelete} busy={deleting} />
      )}
    </div>
  )
}

export default UserActivityTab
