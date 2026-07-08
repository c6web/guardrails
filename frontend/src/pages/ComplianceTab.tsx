import React from 'react'

import { Trash2, Lock, ChevronR, List, RefreshCw } from '../components/ui/Icons'
import { getAuditLogs, getAuditStats, deleteAuditLog, bulkDeleteAuditLogs } from '../api/logs'
import { fmtTsStr, fmtAgeFromIso } from '../utils/format'
import { ConfirmModal } from './components/ProviderShared'
import { JsonBlock, Pagination, inputStyle, AUDIT_ACTION_LABELS, ALL_AUDIT_ACTIONS, AUDIT_RESOURCE_LABELS, ALL_RESOURCE_TYPES, auditActionChip, resourceChip } from './components/AuditShared'
import { StatCard, KV, FilterBar, BulkActionBar, EmptyState, Drawer, DataTable } from '../components/ui'
import type { ColumnDef } from '../components/ui'
import type { AuditRecord, AuditStats } from '../api/logs'

// ── Compliance row detail drawer ──────────────────────────────────────────────

function AuditRowDetail({ record, open, onClose, onDelete }: { record: AuditRecord; onClose: () => void; onDelete?: () => void; open?: boolean }) {
  return (
    <Drawer open={open}
      title={
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Lock w={14} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>{record.id}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 2 }}>
            {auditActionChip(record.action)} · {record.actor_email}
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
      <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
        <KV
          labelWidth={100} gap={8} style={{ marginBottom: 18 }}
          rows={[
            { label: 'Actor', value: record.actor_email },
            record.actor_id && { label: 'Actor ID', value: record.actor_id, mono: true },
            { label: 'Action', value: auditActionChip(record.action) },
            { label: 'Resource', value: <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{resourceChip(record.resource_type)}<span className="mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>{record.resource_id.length > 12 ? record.resource_id.slice(0, 8) + '…' : record.resource_id}</span></div> },
            { label: 'IP', value: record.ip_address, mono: true },
            { label: 'Time', value: fmtTsStr(record.created_at), mono: true },
          ]}
        />

        {record.details && Object.keys(record.details).length > 0 && (
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Details</div>
            <JsonBlock data={JSON.stringify(record.details)} />
          </div>
        )}
      </div>
    </Drawer>
  )
}

function ComplianceTab({ refresh }: { refresh?: () => void }) {
  const [rows, setRows]         = React.useState<AuditRecord[]>([])
  const [loading, setLoading]   = React.useState(true)
  const [page, setPage]         = React.useState(1)
  const [totalPages, setTotalPages] = React.useState(1)
  const [total, setTotal]       = React.useState(0)
  const [selected, setSelected] = React.useState<AuditRecord | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [deleting, setDeleting] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null)
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = React.useState(false)
  const [actionFilter,   setActionFilter]   = React.useState('')
  const [resourceFilter, setResourceFilter] = React.useState('')
  const [emailFilter,    setEmailFilter]    = React.useState('')
  const [fromDate,       setFromDate]       = React.useState('')
  const [toDate,         setToDate]         = React.useState('')
  const [stats, setStats] = React.useState<AuditStats | null>(null)
  const [statsLoading, setStatsLoading] = React.useState(true)

  const loadRef = React.useRef(async (p: number) => {
    setLoading(true)
    try {
      const res = await getAuditLogs({
        page: p, limit: 50,
        action:        actionFilter   || undefined,
        resource_type: resourceFilter || undefined,
        actor_email:   emailFilter    || undefined,
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

  React.useEffect(() => { loadRef.current(1) }, [actionFilter, resourceFilter, emailFilter, fromDate, toDate])

  React.useEffect(() => {
    setStatsLoading(true)
    getAuditStats({
      action:        actionFilter   || undefined,
      resource_type: resourceFilter || undefined,
      actor_email:   emailFilter    || undefined,
      from: fromDate || undefined,
      to:   toDate   || undefined,
    }).then(setStats).catch(() => {}).finally(() => setStatsLoading(false))
  }, [actionFilter, resourceFilter, emailFilter, fromDate, toDate])

  const doRefresh = () => loadRef.current(1)
  const refreshCbRef = React.useRef(refresh)
  React.useEffect(() => { refreshCbRef.current = refresh }, [refresh])

  React.useEffect(() => {
    if (refresh) refresh()
  }, [])

  const hasFilters = !!(actionFilter || resourceFilter || emailFilter || fromDate || toDate)
  const clearFilters = () => { setActionFilter(''); setResourceFilter(''); setEmailFilter(''); setFromDate(''); setToDate('') }

  const handleSelectRow = React.useCallback((row: AuditRecord, checked: boolean) => {
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
      await bulkDeleteAuditLogs(Array.from(selectedIds))
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
      await deleteAuditLog(deleteTarget)
      setSelectedIds(prev => { const n = new Set(prev); n.delete(deleteTarget); return n })
      await loadRef.current(page)
      setSelected(null)
    } catch (err) {
      console.error('Delete failed', err)
    }
    finally { setDeleting(false) }
  }

  const handleSelectAndOpen = React.useCallback((row: AuditRecord) => {
    if (selected?.id === row.id) {
      setSelected(null)
    } else {
      setSelected(row)
    }
  }, [selected])

  const columns: ColumnDef<AuditRecord>[] = [
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
      key: 'actor',
      label: 'Actor',
      render: (r) => <div style={{ fontSize: 12, fontWeight: 500 }}>{r.actor_email}</div>,
    },
    {
      key: 'action',
      label: 'Action',
      render: (r) => auditActionChip(r.action),
    },
    {
      key: 'resource',
      label: 'Resource',
      render: (r) => resourceChip(r.resource_type),
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
        <StatCard label="Unique actors" loading={statsLoading} value={(stats?.unique_actors ?? 0).toLocaleString()} />
        <StatCard label="Resource types touched" loading={statsLoading} value={(stats?.unique_resource_types ?? 0).toLocaleString()} />
        <StatCard
          label="Top action"
          loading={statsLoading}
          value={stats?.top_action ? (AUDIT_ACTION_LABELS[stats.top_action.action] ?? stats.top_action.action) : '—'}
          caption={stats?.top_action ? `${stats.top_action.count.toLocaleString()} events` : undefined}
        />
      </div>

      <FilterBar mb={12}>
        <span className="label">Action</span>
        <select className="select" value={actionFilter} onChange={e => setActionFilter(e.target.value)} style={{ width: 190 }}>
          <option value="">All actions</option>
          {ALL_AUDIT_ACTIONS.map(a => <option key={a} value={a}>{AUDIT_ACTION_LABELS[a] ?? a}</option>)}
        </select>
        <span className="label">Resource</span>
        <select className="select" value={resourceFilter} onChange={e => setResourceFilter(e.target.value)} style={{ width: 130 }}>
          <option value="">All</option>
          {ALL_RESOURCE_TYPES.map(t => <option key={t} value={t}>{AUDIT_RESOURCE_LABELS[t] ?? t}</option>)}
        </select>
        <span className="sep" />
        <input style={{ ...inputStyle, width: 190 }} type="email" placeholder="Filter by actor email…" value={emailFilter} onChange={e => setEmailFilter(e.target.value)} />
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
          emptyState={
            <EmptyState
              icon={<List w={28} />}
              title={hasFilters ? 'No events match the current filters.' : 'No audit events recorded yet.'}
              action={hasFilters ? (
                <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear filters</button>
              ) : undefined}
            />
          }
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

      {selected && <AuditRowDetail record={selected} onClose={() => setSelected(null)} onDelete={() => { setDeleteTarget(selected.id); setSelected(null) }} />}

      {deleteTarget && !deleting && (
        <ConfirmModal title="Delete audit record"
          message={<><strong>ID:</strong> {deleteTarget}<br />Permanently delete this audit record? This cannot be undone.</>}
          confirmLabel="Delete" danger
          onClose={() => setDeleteTarget(null)} onConfirm={handleConfirmDelete} busy={deleting} />
      )}

      {bulkDeleteConfirm && !deleting && (
        <ConfirmModal title="Delete selected records"
          message={<><strong>{selectedIds.size}</strong> audit records will be permanently deleted. This cannot be undone.</>}
          confirmLabel="Delete all" danger
          onClose={() => setBulkDeleteConfirm(false)} onConfirm={handleConfirmBulkDelete} busy={deleting} />
      )}
    </div>
  )
}

export default ComplianceTab
