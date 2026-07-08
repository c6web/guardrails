import React from 'react'
import { Chip, StatCard, KV, FilterBar, BulkActionBar, EmptyState, Drawer, DataTable } from '../components/ui'
import type { ColumnDef } from '../components/ui'
import { Trash2, Shield, ChevronR, RefreshCw } from '../components/ui/Icons'
import { getAdminLogs, getAdminStats, deleteAdminLog, bulkDeleteAdminLogs } from '../api/logs'
import type { AdminRecord, AdminStats } from '../api/logs'
import { fmtTsStr, fmtAgeFromIso } from '../utils/format'
import { ConfirmModal } from './components/ProviderShared'
import { JsonBlock, Pagination, inputStyle } from './components/AuditShared'

// ── Admin Actions constants & helpers ─────────────────────────────────────────

const ADMIN_ACTION_LABELS: Record<string, string> = {
  'user.create':           'User created',
  'user.update':           'User updated',
  'user.delete':           'User deleted',
  'apikey.create':         'API key created',
  'apikey.update':         'API key updated',
  'apikey.rotate':         'API key rotated',
  'apikey.revoke':         'API key revoked',
  'apikey.version.revoke': 'Key version revoked',
  'apikey.delete':         'API key deleted',
  'apikey.transfer':       'API key transferred',
  'detector.create':       'Detector created',
  'detector.update':       'Detector updated',
  'detector.delete':       'Detector deleted',
}

function adminActionChip(action: string) {
  const label = ADMIN_ACTION_LABELS[action] ?? action
  if (action.endsWith('.create'))  return <Chip kind="ok"   dot>{label}</Chip>
  if (action.endsWith('.update'))  return <Chip kind="info"  dot>{label}</Chip>
  if (action.endsWith('.delete') || action.endsWith('.revoke')) return <Chip kind="err" dot>{label}</Chip>
  if (action.endsWith('.rotate'))  return <Chip kind="warn"  dot>{label}</Chip>
  return <Chip kind="muted" dot>{label}</Chip>
}

function adminTargetLabel(type: string) {
  const m: Record<string, string> = { user: 'User', apikey: 'API key', detector: 'Detector' }
  return m[type] ?? type
}

const ADMIN_ACTION_TYPES = Object.keys(ADMIN_ACTION_LABELS)
const ADMIN_TARGET_TYPES = ['user', 'apikey', 'detector']

// ── Admin drawer ──────────────────────────────────────────────────────────────

function AdminRowDetail({ record, open, onClose, onDelete }: { record: AdminRecord; onClose: () => void; onDelete?: () => void; open?: boolean }) {
  return (
    <Drawer open={open}
      title={
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield w={14} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>{record.id}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 2 }}>
            {adminActionChip(record.action)} · {adminTargetLabel(record.target_type)}
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
            { label: 'Action', value: adminActionChip(record.action) },
            { label: 'Admin', value: record.admin_email },
            { label: 'Target', value: <>{adminTargetLabel(record.target_type)} · <span className="mono">{record.target_id ?? '—'}</span></> },
            { label: 'IP', value: record.ip_address, mono: true },
            { label: 'Time', value: fmtTsStr(record.created_at), mono: true },
          ]}
        />

        {record.before_state && Object.keys(record.before_state).length > 0 && (
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Before</div>
            <JsonBlock data={record.before_state} />
          </div>
        )}
        {record.after_state && Object.keys(record.after_state).length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="label" style={{ marginBottom: 6 }}>After</div>
            <JsonBlock data={record.after_state} />
          </div>
        )}
      </div>
    </Drawer>
  )
}

// ── Admin Actions Tab ─────────────────────────────────────────────────────────

function AdminActionsTab({ refresh }: { refresh?: () => void }) {
  const [rows, setRows]         = React.useState<AdminRecord[]>([])
  const [loading, setLoading]   = React.useState(true)
  const [page, setPage]         = React.useState(1)
  const [totalPages, setTotalPages] = React.useState(1)
  const [total, setTotal]       = React.useState(0)
  const [selected, setSelected] = React.useState<AdminRecord | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [deleting, setDeleting] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null)
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = React.useState(false)
  const [actionFilter, setActionFilter] = React.useState('')
  const [targetFilter, setTargetFilter] = React.useState('')
  const [emailFilter,  setEmailFilter]  = React.useState('')
  const [fromDate,     setFromDate]     = React.useState('')
  const [toDate,       setToDate]       = React.useState('')
  const [stats, setStats] = React.useState<AdminStats | null>(null)
  const [statsLoading, setStatsLoading] = React.useState(true)

  const loadRef = React.useRef(async (p: number) => {
    setLoading(true)
    try {
      const res = await getAdminLogs({
        page: p, limit: 50,
        action:      actionFilter || undefined,
        target_type: targetFilter || undefined,
        admin_email: emailFilter  || undefined,
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

  React.useEffect(() => { loadRef.current(1) }, [actionFilter, targetFilter, emailFilter, fromDate, toDate])

  React.useEffect(() => {
    setStatsLoading(true)
    getAdminStats({
      action:      actionFilter || undefined,
      target_type: targetFilter || undefined,
      admin_email: emailFilter  || undefined,
      from: fromDate || undefined,
      to:   toDate   || undefined,
    }).then(setStats).catch(() => {}).finally(() => setStatsLoading(false))
  }, [actionFilter, targetFilter, emailFilter, fromDate, toDate])

  const doRefresh = () => loadRef.current(1)
  const refreshCbRef = React.useRef(refresh)
  React.useEffect(() => { refreshCbRef.current = refresh }, [refresh])

  React.useEffect(() => {
    if (refresh) refresh()
  }, [])

  const hasFilters = !!(actionFilter || targetFilter || emailFilter || fromDate || toDate)
  const clearFilters = () => { setActionFilter(''); setTargetFilter(''); setEmailFilter(''); setFromDate(''); setToDate('') }

  const handleSelectRow = React.useCallback((row: AdminRecord, checked: boolean) => {
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
      await bulkDeleteAdminLogs(Array.from(selectedIds))
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
      await deleteAdminLog(deleteTarget)
      setSelectedIds(prev => { const n = new Set(prev); n.delete(deleteTarget); return n })
      await loadRef.current(page)
      setSelected(null)
    } catch (err) {
      console.error('Delete failed', err)
    }
    finally { setDeleting(false) }
  }

  const handleSelectAndOpen = React.useCallback((row: AdminRecord) => {
    if (selected?.id === row.id) {
      setSelected(null)
    } else {
      setSelected(row)
    }
  }, [selected])

  const columns: ColumnDef<AdminRecord>[] = [
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
      key: 'admin',
      label: 'Admin',
      render: (r) => <div style={{ fontSize: 12, fontWeight: 500 }}>{r.admin_email}</div>,
    },
    {
      key: 'action',
      label: 'Action',
      render: (r) => adminActionChip(r.action),
    },
    {
      key: 'target',
      label: 'Target',
      render: (r) => r.target_id ? (
        <>
          <span className="caption">{adminTargetLabel(r.target_type)}</span>
          <span className="mono" style={{ fontSize: 11, marginLeft: 6 }}>{r.target_id.slice(0, 8)}…</span>
        </>
      ) : <span className="caption">—</span>,
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
        <StatCard label="Total records" loading={statsLoading} value={(stats?.total ?? 0).toLocaleString()} />
        <StatCard label="Destructive actions" tone="danger" loading={statsLoading} value={(stats?.destructive ?? 0).toLocaleString()} />
        <StatCard label="Unique admins" loading={statsLoading} value={(stats?.unique_admins ?? 0).toLocaleString()} />
        <StatCard
          label="Top target type"
          loading={statsLoading}
          value={stats?.top_target_type ? adminTargetLabel(stats.top_target_type.target_type) : '—'}
          caption={stats?.top_target_type ? `${stats.top_target_type.count.toLocaleString()} actions` : undefined}
        />
      </div>

      <FilterBar mb={12}>
        <span className="label">Action</span>
        <select className="select" value={actionFilter} onChange={e => setActionFilter(e.target.value)} style={{ width: 160 }}>
          <option value="">All actions</option>
          {ADMIN_ACTION_TYPES.map(a => <option key={a} value={a}>{ADMIN_ACTION_LABELS[a] ?? a}</option>)}
        </select>
        <span className="label">Target</span>
        <select className="select" value={targetFilter} onChange={e => setTargetFilter(e.target.value)} style={{ width: 110 }}>
          <option value="">All</option>
          {ADMIN_TARGET_TYPES.map(t => <option key={t} value={t}>{adminTargetLabel(t)}</option>)}
        </select>
        <span className="sep" />
        <input style={{ ...inputStyle, width: 180 }} type="email" placeholder="Filter by admin…" value={emailFilter} onChange={e => setEmailFilter(e.target.value)} />
        <span className="sep" />
        <span className="label">From</span>
        <input style={{ ...inputStyle, width: 140 }} type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
        <span className="label">To</span>
        <input style={{ ...inputStyle, width: 140 }} type="date" value={toDate}   onChange={e => setToDate(e.target.value)} />
        {hasFilters && <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear</button>}
        <div style={{ flex: 1 }} />
        {!loading && <span className="caption">{total.toLocaleString()} records</span>}
        <button className="btn btn-ghost btn-sm" onClick={doRefresh} title="Refresh data"><RefreshCw w={14} /></button>
      </FilterBar>

      {loading || rows.length === 0 ? (
        <DataTable
          columns={columns}
          data={rows}
          rowKey={r => r.id}
          loading={loading}
          emptyState={<EmptyState title="No admin actions recorded yet." />}
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

      {selected && <AdminRowDetail record={selected} onClose={() => setSelected(null)} onDelete={() => { setDeleteTarget(selected.id); setSelected(null) }} />}

      {deleteTarget && !deleting && (
        <ConfirmModal title="Delete admin action record"
          message={<><strong>ID:</strong> {deleteTarget}<br />Permanently delete this admin action record? This cannot be undone.</>}
          confirmLabel="Delete" danger
          onClose={() => setDeleteTarget(null)} onConfirm={handleConfirmDelete} busy={deleting} />
      )}

      {bulkDeleteConfirm && !deleting && (
        <ConfirmModal title="Delete selected records"
          message={<><strong>{selectedIds.size}</strong> admin activity records will be permanently deleted. This cannot be undone.</>}
          confirmLabel="Delete all" danger
          onClose={() => setBulkDeleteConfirm(false)} onConfirm={handleConfirmBulkDelete} busy={deleting} />
      )}
    </div>
  )
}

export default AdminActionsTab
