import React from 'react'
import { Refresh } from '../components/ui/Icons'
import { PageHeader, Breadcrumbs, Badge, FilterBar, EmptyState, ErrorState, ConfirmModal, DataTable } from '../components/ui'
import type { ColumnDef } from '../components/ui'
import { getAccessRequests, updateAccessRequest, deleteAccessRequest, type AccessRequest, type UpdateAccessRequestPayload } from '../api/accessRequests'
import { DetailDrawer, EditDrawer } from './components/AccessRequestsModals'
import type { TweakValues } from '../types'

interface AccessRequestsAdminPageProps { tweaks: TweakValues }

type Filter = 'all' | 'pending' | 'approved' | 'rejected'

export default function AccessRequestsAdminPage(_props: AccessRequestsAdminPageProps) {
  const [requests, setRequests] = React.useState<AccessRequest[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [filter, setFilter] = React.useState<Filter>('all')
  const [search, setSearch] = React.useState('')
  const [viewRequest, setViewRequest] = React.useState<AccessRequest | null>(null)
  const [editRequest, setEditRequest] = React.useState<AccessRequest | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<AccessRequest | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [reviewBusy, setReviewBusy] = React.useState(false)
  const [toast, setToast] = React.useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const params: { status?: string; q?: string } = {}
      if (filter !== 'all') params.status = filter
      if (search.trim()) params.q = search.trim()
      const { data } = await getAccessRequests(params)
      setRequests(data)
    } catch (err) {
      setLoadError((err as Error).message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [filter, search])

  React.useEffect(() => { load() }, [load])

  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  async function handleEdit(payload: UpdateAccessRequestPayload) {
    if (!editRequest) return
    setBusy(true)
    try {
      await updateAccessRequest(editRequest.id, payload)
      setEditRequest(null)
      setViewRequest(null)
      setToast({ msg: 'Request updated', kind: 'ok' })
      load()
    } catch (err: any) {
      setToast({ msg: err.message || 'Failed to update', kind: 'err' })
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await deleteAccessRequest(deleteTarget.id)
      setDeleteTarget(null)
      setViewRequest(null)
      setToast({ msg: 'Request deleted', kind: 'ok' })
      load()
    } catch (err: any) {
      setToast({ msg: err.message || 'Failed to delete', kind: 'err' })
    } finally {
      setBusy(false)
    }
  }

  async function handleReview(r: AccessRequest, status: 'approved' | 'rejected', adminNotes: string, sendEmail: boolean) {
    setReviewBusy(true)
    try {
      await updateAccessRequest(r.id, {
        status,
        admin_notes: adminNotes.trim() || undefined,
        send_email: sendEmail,
      })
      setViewRequest(null)
      setToast({ msg: `Request ${status}`, kind: 'ok' })
      load()
    } catch (err: any) {
      setToast({ msg: err.message || `Failed to ${status}`, kind: 'err' })
    } finally {
      setReviewBusy(false)
    }
  }

  const filtered = React.useMemo(() => {
    let list = requests
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        r.full_name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q)
      )
    }
    return list
  }, [requests, search])

  const columns: ColumnDef<AccessRequest>[] = [
    {
      key: 'full_name',
      label: 'Full Name',
      render: (r) => (
        <div className="row-tight">
          <span className="av" style={{ background: 'var(--bg-surface)' }}>
            {r.full_name.charAt(0).toUpperCase()}
          </span>
          <div>
            <div style={{ fontWeight: 500, fontSize: 13 }}>{r.full_name}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'email',
      label: 'Email',
      render: (r) => (
        <span className="mono" style={{ fontSize: 12, color: 'var(--fg-secondary)' }}>{r.email}</span>
      ),
    },
    {
      key: 'company',
      label: 'Company',
      render: (r) => <span className="caption">{r.company || '\u2014'}</span>,
    },
    {
      key: 'reason',
      label: 'Reason',
      render: (r) => (
        <span style={{ fontSize: 12, color: 'var(--fg-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {r.reason || '\u2014'}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (r) => {
        if (r.status === 'pending')  return <Badge kind="warn">pending</Badge>
        if (r.status === 'approved') return <Badge kind="ok">approved</Badge>
        return <Badge kind="err">rejected</Badge>
      },
    },
    {
      key: 'created_at',
      label: 'Submitted',
      render: (r) => (
        <span className="mono" style={{ fontSize: 12, color: 'var(--fg-tertiary)', whiteSpace: 'nowrap' }}>
          {new Date(r.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'updated_at',
      label: 'Updated',
      render: (r) => (
        <span className="mono" style={{ fontSize: 12, color: 'var(--fg-tertiary)', whiteSpace: 'nowrap' }}>
          {r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '\u2014'}
        </span>
      ),
    },
  ]

  const filterChip = (f: Filter) => (
    <button key={f} className={`filter-chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
      {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
      {f === 'pending' && (
        <span className="mono" style={{ marginLeft: 4, fontSize: 10, opacity: 0.6 }}>
          {requests.filter(r => r.status === 'pending').length}
        </span>
      )}
    </button>
  )

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="access-requests" />
      <PageHeader title="Access Requests" subtitle="Review and manage self-service access requests. Approve or reject pending registrations."
        actions={<button className="btn btn-ghost" onClick={load} disabled={loading}><Refresh w={13} /> Refresh</button>} />

      <FilterBar mb={12}>
        <span className="label">Filter</span>
        {(['all', 'pending', 'approved', 'rejected'] as Filter[]).map(filterChip)}
        <span className="sep" />
        <div style={{ flex: 1, minWidth: 80 }} />
        <input
          className="input"
          type="search"
          placeholder={'Search by name or email\u2026'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 200 }}
        />
      </FilterBar>

      {loadError ? (
        <ErrorState title="Failed to load access requests" message={loadError} onRetry={load} />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          rowKey={(r) => r.id}
          onRowClick={(r) => setViewRequest(r)}
          loading={loading}
          emptyState={
            <EmptyState title={search || filter !== 'all' ? 'No requests match this filter.' : 'No access requests yet.'} />
          }
          minWidth={640}
        >
          {filtered.length < requests.length && (
            <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--fg-tertiary)', borderTop: '1px solid var(--border-subtle)' }}>
              Showing {filtered.length} of {requests.length} requests
            </div>
          )}
        </DataTable>
      )}

      {viewRequest && !editRequest && (
        <DetailDrawer
          request={viewRequest}
          onClose={() => setViewRequest(null)}
          onEdit={() => setEditRequest(viewRequest)}
          onDelete={() => setDeleteTarget(viewRequest)}
          onReview={(status, notes, sendEmail) => handleReview(viewRequest, status, notes, sendEmail)}
          reviewBusy={reviewBusy}
        />
      )}

      {editRequest && (
        <EditDrawer
          request={editRequest}
          onClose={() => setEditRequest(null)}
          onSubmit={handleEdit}
          busy={busy}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          open={true}
          title="Delete Access Request"
          message={
            <p style={{ fontSize: 13, marginBottom: 16, color: 'var(--fg-tertiary)' }}>
              Remove the access request from <span className="mono" style={{ fontSize: 12 }}>{deleteTarget.full_name}</span> ({deleteTarget.email})? This cannot be undone.
            </p>
          }
          confirmLabel="Delete"
          danger
          busy={busy}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: toast.kind === 'ok' ? 'var(--ok)' : 'var(--danger)',
          color: '#fff', padding: '10px 18px', borderRadius: 6,
          fontSize: 13, fontWeight: 500, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
