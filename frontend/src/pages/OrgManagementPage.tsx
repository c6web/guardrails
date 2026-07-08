import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader, Breadcrumbs, EmptyState, ErrorState, ConfirmModal, DataTable, Toast, useToast, StatCard, StatRow } from '../components/ui'
import type { ColumnDef } from '../components/ui'
import ActionCell from '../components/ui/ActionCell'
import { Plus, Pencil, Trash2, Network } from '../components/ui/Icons'
import { getOrganizations, getOrganization, createOrganization, updateOrganization, deleteOrganization } from '../api/organizations'
import type { UIOrg } from '../api/organizations'
import { CreateOrgModal, EditOrgModal, OrgDetailDrawer } from './components/OrgModals'

export default function OrgManagementPage() {
  const [orgs, setOrgs] = useState<UIOrg[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const { toast, show: showToast } = useToast()
  const [busy, setBusy] = useState(false)

  const [detailTarget, setDetailTarget] = useState<UIOrg | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<UIOrg | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UIOrg | null>(null)

  const openDetail = useCallback(async (org: UIOrg) => {
    try {
      const full = await getOrganization(org.id)
      setDetailTarget(full)
    } catch {
      setDetailTarget(org)
    }
  }, [])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setLoadError(null)
      const data = await getOrganizations()
      setOrgs(data)
    } catch {
      setLoadError('Failed to load organizations')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const totalMembers = useMemo(() => orgs.reduce((s, o) => s + (o.memberCount ?? 0), 0), [orgs])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return orgs
    return orgs.filter(o => o.name.toLowerCase().includes(q))
  }, [orgs, search])

  const columns = useMemo((): ColumnDef<UIOrg>[] => [
    {
      key: 'name',
      label: 'Name',
      render: (org) => <span style={{ fontWeight: 500, fontSize: 13 }}>{org.name}</span>,
    },
    {
      key: 'description',
      label: 'Description',
      render: (org) => (
        <span style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--fg-secondary)' }}>
          {org.description || <span style={{ color: 'var(--fg-tertiary)' }}>—</span>}
        </span>
      ),
    },
    {
      key: 'orgId',
      label: 'Org ID',
      render: (org) => (
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {org.id}
        </span>
      ),
    },
    {
      key: 'ownerId',
      label: 'Owner ID',
      render: (org) => (
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>
          {org.ownerUserId ?? '—'}
        </span>
      ),
    },
    {
      key: 'members',
      label: 'Members',
      render: (org) => <span style={{ fontSize: 13 }}>{org.memberCount}</span>,
    },
    {
      key: 'created',
      label: 'Created',
      render: (org) => <span className="mono" style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>{org.createdAt}</span>,
    },
    {
      key: 'actions',
      label: '',
      width: 80,
      render: (org) => (
        <ActionCell
          actions={[
            { icon: <Pencil w={13} />, label: 'Edit', onClick: () => setEditTarget(org) },
            { icon: <Trash2 w={13} />, label: 'Delete', danger: true, onClick: () => setDeleteTarget(org) },
          ]}
        />
      ),
    },
  ], [])

  async function handleCreate(payload: { name: string; description?: string | null; owner_user_id?: string | null }) {
    setBusy(true)
    try {
      await createOrganization(payload)
      showToast('Organization created', 'ok')
      setShowCreate(false)
      await load()
    } catch (err: any) {
      showToast(err?.message ?? 'Failed to create organization', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function handleEdit(id: string, payload: { name: string; description?: string | null }) {
    setBusy(true)
    try {
      await updateOrganization(id, payload)
      showToast('Organization updated', 'ok')
      setEditTarget(null)
      await load()
    } catch (err: any) {
      showToast(err?.message ?? 'Failed to update organization', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string) {
    setBusy(true)
    try {
      await deleteOrganization(id)
      showToast('Organization deleted', 'ok')
      setDeleteTarget(null)
      await load()
    } catch (err: any) {
      showToast(err?.message ?? 'Failed to delete organization', 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="organizations" />
      <PageHeader title="Org Management" subtitle="Organizations group users. Each user belongs to one organization."
        actions={<button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus w={13} /> New org</button>} />

      {!loading && orgs.length > 0 && (
        <StatRow>
          <StatCard variant="compact" label="Organizations" value={orgs.length} />
          <StatCard variant="compact" label="Total members" value={totalMembers} />
          <StatCard variant="compact" label="Avg members/org" value={orgs.length > 0 ? Math.round(totalMembers / orgs.length) : 0} />
        </StatRow>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <input className="input" type="search" placeholder="Search organizations…"
          value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
      </div>

      {loadError ? (
        <ErrorState title="Failed to load organizations" message={loadError} onRetry={load} />
      ) : (
        <DataTable<UIOrg>
          columns={columns}
          data={filtered}
          rowKey={(org) => org.id}
          onRowClick={openDetail}
          loading={loading}
          emptyState={
            <EmptyState
              icon={<Network w={28} />}
              title={search ? 'No organizations match your search' : 'No organizations yet'}
              action={!search ? (
                <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
                  <Plus w={12} /> New org
                </button>
              ) : undefined}
            />
          }
          minWidth={600}
        >
          {filtered.length < orgs.length && (
            <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--fg-tertiary)', borderTop: '1px solid var(--border-subtle)' }}>
              Showing {filtered.length} of {orgs.length} organizations
            </div>
          )}
        </DataTable>
      )}

      {detailTarget && !editTarget && !deleteTarget && (
        <OrgDetailDrawer
          org={detailTarget}
          onClose={() => setDetailTarget(null)}
          onEdit={() => { setEditTarget(detailTarget); setDetailTarget(null) }}
          onDelete={() => { setDeleteTarget(detailTarget); setDetailTarget(null) }}
        />
      )}
      {showCreate && (
        <CreateOrgModal
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
          busy={busy}
        />
      )}
      {editTarget && (
        <EditOrgModal
          org={editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={handleEdit}
          busy={busy}
        />
      )}
      {deleteTarget && (
        <ConfirmModal
          open={true}
          title="Delete organization"
          message={
            deleteTarget.memberCount > 0
              ? <p style={{ fontSize: 13, marginBottom: 16, color: 'var(--warning)' }}>
                  <strong>{deleteTarget.name}</strong> has {deleteTarget.memberCount} member{deleteTarget.memberCount !== 1 ? 's' : ''}. Reassign all members before deleting.
                </p>
              : <p style={{ fontSize: 13, marginBottom: 16 }}>
                  Delete <strong>{deleteTarget.name}</strong>? This cannot be undone.
                </p>
          }
          confirmLabel="Delete"
          danger
          busy={busy}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget.id)}
        />
      )}

      {toast && <Toast msg={toast.msg} kind={toast.kind} />}
    </div>
  )
}
