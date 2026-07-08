import React from 'react'
import { Trash2, Plus } from './ui/Icons'
import { LoadingState, Drawer } from './ui'
import { updateUser, getUsers, type UIUser } from '../api/users'

interface GroupMembersModalProps {
  groupId: string
  groupName: string
  open?: boolean
  onClose: () => void
  onMembersUpdated?: () => void
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function avClass(groupId: string | null) {
  if (groupId === '00000000-0000-0000-0000-000000000001') return 'av-jade'
  if (groupId === '00000000-0000-0000-0000-000000000002') return 'av-amber'
  if (groupId === '00000000-0000-0000-0000-000000000003') return 'av-cobalt'
  if (groupId === '00000000-0000-0000-0000-000000000004') return 'av-violet'
  return 'av-muted'
}

export function GroupMembersModal({ groupId, groupName, open, onClose, onMembersUpdated }: GroupMembersModalProps) {
  const [loading, setLoading] = React.useState(true)
  const [members, setMembers] = React.useState<UIUser[]>([])
  const [nonMembers, setNonMembers] = React.useState<UIUser[]>([])
  const [removing, setRemoving] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState<string | null>(null)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    const load = async () => {
      try {
        const users = await getUsers()
        setMembers(users.filter(u => u.groupId === groupId))
        setNonMembers(users.filter(u => u.groupId !== groupId))
      } catch (_e) {
        setError('Failed to load users')
      }
      setLoading(false)
    }
    load()
  }, [groupId])

  const handleRemove = async (userId: string) => {
    if (!confirm('Remove this user from the group?')) return
    setRemoving(userId)
    setError('')
    try {
      await updateUser(userId, { group_id: undefined })
      setMembers(m => m.filter(u => u.id !== userId))
      const user = members.find(u => u.id === userId)
      if (user) {
        setNonMembers(nm => [...nm, { ...user, groupId: null, groupName: 'Unassigned' }])
      }
      onMembersUpdated?.()
    } catch (_e) {
      setError('Failed to remove user')
    }
    setRemoving(null)
  }

  const handleAdd = async (userId: string) => {
    setAdding(userId)
    setError('')
    try {
      await updateUser(userId, { group_id: groupId })
      setNonMembers(nm => nm.filter(u => u.id !== userId))
      const user = nonMembers.find(u => u.id === userId)
      if (user) {
        setMembers(m => [...m, { ...user, groupId, groupName }])
      }
      onMembersUpdated?.()
    } catch (_e) {
      setError('Failed to add user')
    }
    setAdding(null)
  }

  return (
    <Drawer
      open={open}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{groupName}</span>
          <span className="mono" style={{
            fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
            background: 'var(--accent-subtle, #e8f0fe)', color: 'var(--accent)',
            border: '1px solid var(--accent)', lineHeight: '16px',
          }}>{members.length}</span>
        </div>
      }
      subtitle="Manage members"
      onClose={onClose}
      footer={
        <>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </>
      }
    >
      <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
        {error && (
          <div style={{ padding: '10px 12px', borderRadius: 6, background: 'var(--danger-bg)', border: '1px solid var(--danger)', color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {loading ? (
          <LoadingState size="sm" />
        ) : (
          <>
            {/* Current members */}
            <div style={{ marginBottom: 20 }}>
              <div className="label-strong" style={{ marginBottom: 10 }}>Current members ({members.length})</div>
              {members.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', textAlign: 'center', padding: 16 }}>No members in this group</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {members.map(u => (
                    <div key={u.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      borderRadius: 6, background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)'
                    }}>
                      <span className={`av ${avClass(u.groupId)}`} style={{ width: 32, height: 32, fontSize: 12 }}>{initials(u.displayName)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{u.displayName}</div>
                        <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{u.username}</div>
                      </div>
                      <button
                        className="icon-btn"
                        onClick={() => handleRemove(u.id)}
                        disabled={removing === u.id}
                        style={{ color: 'var(--danger)' }}
                        title="Remove from group"
                      >
                        <Trash2 w={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Available members */}
            {nonMembers.length > 0 && (
              <div>
                <div className="label-strong" style={{ marginBottom: 10 }}>Add members ({nonMembers.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {nonMembers.map(u => (
                    <div key={u.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      borderRadius: 6, background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)'
                    }}>
                      <span className={`av ${avClass(u.groupId)}`} style={{ width: 32, height: 32, fontSize: 12 }}>{initials(u.displayName)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{u.displayName}</div>
                        <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{u.username}</div>
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleAdd(u.id)}
                        disabled={adding === u.id}
                      >
                        <Plus w={12} /> Add
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Drawer>
  )
}
