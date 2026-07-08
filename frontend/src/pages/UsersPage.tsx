import React from 'react'
import { PageHeader, Breadcrumbs, Chip, Badge, FilterBar, EmptyState, ErrorState, DataTable, ConfirmModal, type ColumnDef } from '../components/ui'
import ActionCell from '../components/ui/ActionCell'
import { Download, GitBranch, Plus, Eye, Pencil, Pause, Play, Trash2, Lock, Key } from '../components/ui/Icons'
import { GroupMembersModal } from '../components/GroupMembersModal'
import {
  getUsers, createUser, updateUser, deleteUser,
  GROUP_LABELS,
  type UIUser, type CreateUserPayload, type UpdateUserPayload,
} from '../api/users'
import { getGroups, type ApiGroup } from '../api/groups'
import { getOrganizations } from '../api/organizations'
import { apiFetch } from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { TweakValues } from '../types'
import { Toast, avClass, initials, GROUP_COLORS } from './components/UsersShared'
import { InviteModal, PasswordResetModal } from './components/UsersModals'
import { EditDrawer, UserDetailDrawer } from './components/UsersDrawers'

interface UsersPageProps { tweaks: TweakValues }

type Filter = 'all' | 'admin' | 'viewer' | 'user' | 'knowledge_admin' | 'dormant'

const GROUP_IDS = {
  admin:            '00000000-0000-0000-0000-000000000001',
  viewer:           '00000000-0000-0000-0000-000000000002',
  user:             '00000000-0000-0000-0000-000000000003',
  knowledge_admin:  '00000000-0000-0000-0000-000000000004',
}

const UsersPage: React.FC<UsersPageProps> = () => {
  const { user: me, isAdmin } = useAuth()

  const [tab, setTab]               = React.useState('members')
  const [users, setUsers]           = React.useState<UIUser[]>([])
  const [groups, setGroups]         = React.useState<ApiGroup[]>([])
  const [orgs, setOrgs]             = React.useState<{ id: string; name: string }[]>([])
  const [loading, setLoading]       = React.useState(true)
  const [filter, setFilter]         = React.useState<Filter>('all')
  const [search, setSearch]         = React.useState('')
  const [showInvite, setShowInvite] = React.useState(false)
  const [viewUser, setViewUser]     = React.useState<UIUser | null>(null)
  const [editUser, setEditUser]     = React.useState<UIUser | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<UIUser | null>(null)
  const [resetUser, setResetUser]       = React.useState<UIUser | null>(null)
  const [busy, setBusy]             = React.useState(false)
  const [selectedGroup, setSelectedGroup] = React.useState<{ id: string; name: string } | null>(null)
  const [loadError, setLoadError]   = React.useState<string | null>(null)
  const [toast, setToast]           = React.useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [usersData, groupsData, orgsData] = await Promise.all([
        getUsers(),
        getGroups().catch(() => []),
        getOrganizations().catch(() => []),
      ])
      setUsers(usersData)
      setGroups(groupsData)
      setOrgs(orgsData)
    }
    catch (err) { setLoadError((err as Error).message || 'Failed to load') }
    finally { setLoading(false) }
 }, [])

  React.useEffect(() => { load() }, [load])

  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const filtered = React.useMemo(() => {
    let list = users
    if      (filter === 'admin')            list = list.filter(u => u.groupId === GROUP_IDS.admin)
    else if (filter === 'viewer')           list = list.filter(u => u.groupId === GROUP_IDS.viewer)
    else if (filter === 'user')             list = list.filter(u => u.groupId === GROUP_IDS.user)
    else if (filter === 'knowledge_admin')  list = list.filter(u => u.groupId === GROUP_IDS.knowledge_admin)
    else if (filter === 'dormant')           list = list.filter(u => u.rawStatus !== 'active')
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(u =>
        u.displayName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q)
      )
    }
    return list
  }, [users, filter, search])

  const groupLabels = React.useMemo(() => {
    const map: Record<string, string> = {}
    for (const g of groups) { map[g.id] = g.name }
    return { ...GROUP_LABELS, ...map }
  }, [groups])

  const orgNameMap = React.useMemo(() => {
    const map: Record<string, string> = {}
    for (const o of orgs) { map[o.id] = o.name }
    return map
  }, [orgs])

  async function handleCreate(form: CreateUserPayload) {
    setBusy(true)
    try {
      await createUser({
        ...form,
        display_name: form.display_name?.trim() || form.username,
        team:      form.team?.trim()      || undefined,
      })
      setShowInvite(false)
      setToast({ msg: `User ${form.username} created`, kind: 'ok' })
      await load()
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to create user', kind: 'err' })
    } finally { setBusy(false) }
  }

  async function handleUpdate(id: string, payload: UpdateUserPayload) {
    setBusy(true)
    try {
      const cleanPayload = { ...payload }
      if (cleanPayload.display_name) cleanPayload.display_name = cleanPayload.display_name.trim()
      if (cleanPayload.team) cleanPayload.team = cleanPayload.team.trim()
      await updateUser(id, cleanPayload)
      setEditUser(null)
      setToast({ msg: 'User updated', kind: 'ok' })
      await load()
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to update user', kind: 'err' })
    } finally { setBusy(false) }
  }

  async function handleDelete(u: UIUser) {
    setBusy(true)
    try {
      await deleteUser(u.id)
      setDeleteTarget(null)
      setToast({ msg: `${u.displayName} removed`, kind: 'ok' })
      await load()
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to remove user', kind: 'err' })
    } finally { setBusy(false) }
  }

  async function handleResetPassword(u: UIUser, password: string) {
    setBusy(true)
    try {
      await apiFetch(`/api/users/${u.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      })
      setToast({ msg: `Password reset for ${u.displayName}`, kind: 'ok' })
      setResetUser(null)
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to reset password', kind: 'err' })
    } finally { setBusy(false) }
  }

  async function handleRequirePasswordChange(u: UIUser) {
    setBusy(true)
    try {
      if (u.mustChangePassword) {
        await updateUser(u.id, { must_change_password: false })
        setToast({ msg: `Password change requirement cleared for ${u.displayName}`, kind: 'ok' })
      } else {
        await apiFetch(`/api/users/${u.id}/require-password-change`, { method: 'POST' })
        setToast({ msg: `Password change required for ${u.displayName}`, kind: 'ok' })
      }
      setViewUser(null)
      await load()
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to update password requirement', kind: 'err' })
    } finally { setBusy(false) }
  }

  async function handleToggleStatus(u: UIUser) {
    const newStatus = u.rawStatus === 'active' ? 'suspended' : 'active'
    try {
      await updateUser(u.id, { status: newStatus })
      setToast({ msg: `${u.displayName} ${newStatus}`, kind: 'ok' })
      await load()
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed', kind: 'err' })
    }
  }

  async function handleToggleOtp(u: UIUser) {
    setBusy(true)
    try {
      await apiFetch(`/api/users/${u.id}/otp`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !u.otpEnabled }),
      })
      setToast({ msg: `OTP ${!u.otpEnabled ? 'enabled' : 'disabled'} for ${u.displayName}`, kind: 'ok' })
      await load()
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to toggle OTP', kind: 'err' })
    } finally { setBusy(false) }
  }

  const statusChip = (u: UIUser) => {
    if (u.rawStatus === 'active')    return <Badge kind="ok">active</Badge>
    if (u.rawStatus === 'suspended') return <Badge kind="err">suspended</Badge>
    return <Badge kind="muted">dormant</Badge>
  }

  const columns: ColumnDef<UIUser>[] = [
    {
      key: 'member',
      label: 'Member',
      render: (u) => {
        const isSelf = u.id === me?.id
        return (
          <div className="row-tight">
            <span className={`av ${avClass(u.groupId)}`}>{initials(u.displayName)}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: 13 }}>
                {u.displayName}
                {isSelf && <span className="mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)', marginLeft: 6 }}>you</span>}
              </div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>{u.displayName}</div>
            </div>
          </div>
        )
      },
    },
    {
      key: 'group',
      label: 'Group',
      render: (u) => <Chip kind={GROUP_COLORS[u.groupId ?? ''] ?? 'muted'} dot>{u.groupName}</Chip>,
    },
    {
      key: 'otp',
      label: 'OTP',
      render: (u) => u.otpEnabled ? <Chip kind="ok" dot>enabled</Chip> : <Chip kind="muted" dot>disabled</Chip>,
    },
    {
      key: 'team',
      label: 'Team',
      render: (u) => <span className="caption">{u.team}</span>,
    },
    {
      key: 'organization',
      label: 'Organization',
      render: (u) => (
        <span style={{ fontSize: 12 }}>
          {u.organizationId ? (
            <><span style={{ fontWeight: 500 }}>{orgNameMap[u.organizationId] ?? 'Unknown'}</span><span className="mono" style={{ color: 'var(--fg-tertiary)', marginLeft: 4, fontSize: 10 }}>{u.organizationId.slice(0, 8)}…</span></>
          ) : <span style={{ color: 'var(--fg-tertiary)' }}>—</span>}
        </span>
      ),
    },
    {
      key: 'lastSeen',
      label: 'Last seen',
      render: (u) => <span className="mono" style={{ color: 'var(--fg-tertiary)', fontSize: 12 }}>{u.lastSeen}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (u) => statusChip(u),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (u) => {
        const isSelf = u.id === me?.id
        return (
          <div onClick={e => e.stopPropagation()} className="row-tight" style={{ gap: 2 }}>
            <ActionCell actions={[
              { icon: <Eye w={14} />, label: 'View details', onClick: () => setViewUser(u) },
              { icon: <Pencil w={13} />, label: 'Edit profile', onClick: () => setEditUser(u) },
              ...(isAdmin && !isSelf ? [{ icon: <Trash2 w={13} />, label: 'Remove user', danger: true, onClick: () => setDeleteTarget(u) }] : []),
            ]} />
            {isAdmin && (
              <button
                className="icon-btn"
                title="Force password reset"
                onClick={() => setResetUser(u)}
                style={{ color: 'var(--warning)' }}
              >
                <Key w={13} />
              </button>
            )}
            <button
              className="icon-btn"
              title={u.otpEnabled ? 'Disable OTP' : 'Enable OTP'}
              onClick={() => handleToggleOtp(u)}
              style={{ color: u.otpEnabled ? 'var(--warning)' : 'var(--ok)' }}
            >
              <Lock w={13} />
            </button>
            {isAdmin && !isSelf && (
              <button
                className="icon-btn"
                title={u.rawStatus === 'active' ? 'Suspend' : 'Activate'}
                onClick={() => handleToggleStatus(u)}
                style={{ color: u.rawStatus === 'active' ? 'var(--warning)' : 'var(--ok)' }}
              >
                {u.rawStatus === 'active' ? <Pause w={13} /> : <Play w={13} />}
              </button>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="users" />
      <PageHeader title="Users &amp; groups" subtitle={<><span>Manage all console users and their access roles. Invite new members, edit permissions, remove users, and audit login activity and membership changes.<br /></span><b className="mono">{users.length}</b> members</>}
        actions={<><button className="btn btn-ghost"><Download w={13} /> Export</button><button className="btn btn-secondary"><GitBranch w={13} /> Audit changes</button>{isAdmin && (<button className="btn btn-primary" onClick={() => setShowInvite(true)}><Plus w={13} /> Invite member</button>)}</>} />

      <div className="tabs" style={{ marginBottom: 16 }}>
        <div className={`tab ${tab === 'members' ? 'active' : ''}`} onClick={() => setTab('members')}>Members</div>
        <div className={`tab ${tab === 'groups'   ? 'active' : ''}`} onClick={() => setTab('groups')}>Groups</div>
      </div>

      {tab === 'members' && (
        <>
          <FilterBar mb={12}>
            <span className="label">Filter</span>
            {(['all', 'admin', 'viewer', 'user', 'knowledge_admin'] as Filter[]).map(f => (
              <button key={f} className={`filter-chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'admin' ? 'Admins' : f === 'viewer' ? 'Viewers' : f === 'user' ? 'Users' : 'Knowledge Admins'}
              </button>
            ))}
            <span className="sep" />
            <button className={`filter-chip ${filter === 'dormant' ? 'active' : ''}`} onClick={() => setFilter('dormant')}>Dormant / suspended</button>
            <div style={{ flex: 1, minWidth: 80 }} />
            <input
              className="input"
              type="search"
              placeholder="Search by name or username…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 200 }}
            />
          </FilterBar>

          {loadError ? (
            <ErrorState title="Failed to load users" message={loadError} onRetry={load} />
          ) : (
            <DataTable
              columns={columns}
              data={filtered}
              rowKey={(u) => u.id}
              onRowClick={(u) => setViewUser(u)}
              loading={loading}
              emptyState={
                <EmptyState
                  title={search || filter !== 'all' ? 'No users match this filter.' : 'No users yet.'}
                  action={isAdmin && filter === 'all' && !search ? (
                    <button className="btn btn-primary btn-sm" onClick={() => setShowInvite(true)}><Plus w={12} /> Invite first member</button>
                  ) : undefined}
                />
              }
              minWidth={640}
            >
              {filtered.length < users.length && (
                <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--fg-tertiary)', borderTop: '1px solid var(--border-subtle)' }}>
                  Showing {filtered.length} of {users.length} members
                </div>
              )}
            </DataTable>
          )}
        </>
      )}

      {tab === 'groups' && (
        <div className="stack">
          {Object.entries(groupLabels).map(([id, name]) => (
            <div className="card" key={id}>
              <div style={{ padding: 14, display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
                <div>
                  <div className="row-tight" style={{ marginBottom: 4 }}>
                    <Chip kind={GROUP_COLORS[id]} dot>{name}</Chip>
                    <span className="caption">·&nbsp;<b className="mono">{users.filter(u => u.groupId === id).length}</b> members</span>
                  </div>
                </div>
                <div className="row-tight">
                  {isAdmin ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => setSelectedGroup({ id, name })}>
                      Manage →
                    </button>
                  ) : (
                    <button className="btn btn-ghost btn-sm" onClick={() => { setFilter(id as Filter); setTab('members') }}>
                      Members →
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}


      {showInvite && (
        <InviteModal onClose={() => setShowInvite(false)} onSubmit={handleCreate} busy={busy} />
      )}
      {viewUser && !editUser && (
        <UserDetailDrawer
          user={viewUser}
          currentUserId={me?.id}
          isAdmin={isAdmin}
          orgNameMap={orgNameMap}
          onClose={() => setViewUser(null)}
          onEdit={() => { setEditUser(viewUser); setViewUser(null) }}
          onDelete={() => { setDeleteTarget(viewUser); setViewUser(null) }}
          onToggleStatus={() => { handleToggleStatus(viewUser); setViewUser(null) }}
          onToggleOtp={() => { handleToggleOtp(viewUser); setViewUser(null) }}
          onResetPassword={() => setResetUser(viewUser)}
          onRequirePasswordChange={() => handleRequirePasswordChange(viewUser)}
        />
      )}
      {editUser && (
        <EditDrawer
          user={editUser}
          currentUserId={me?.id}
          isAdmin={isAdmin}
          organizations={orgs}
          onClose={() => setEditUser(null)}
          onSubmit={p => handleUpdate(editUser.id, p)}
          onToggleOtp={() => { handleToggleOtp(editUser); setEditUser(null) }}
          busy={busy}
        />
      )}
      {resetUser && (
        <PasswordResetModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onConfirm={(password) => handleResetPassword(resetUser, password)}
          busy={busy}
        />
      )}
      {deleteTarget && (
        <ConfirmModal
          open={true}
          title="Remove user"
          message={<>
            Remove <strong>{deleteTarget.displayName}</strong> (<span className="mono" style={{ fontSize: 12 }}>{deleteTarget.username}</span>) from the system? This cannot be undone.
          </>}
          confirmLabel="Remove user"
          danger
          busy={busy}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget)}
        />
      )}
      {selectedGroup && (
        <GroupMembersModal
          groupId={selectedGroup.id}
          groupName={selectedGroup.name}
          onClose={() => setSelectedGroup(null)}
          onMembersUpdated={() => load()}
        />
      )}
      {toast && <Toast {...toast} />}
    </div>
  )
}

export default UsersPage
