import React from 'react'
import { PageHeader, Breadcrumbs, Chip, EmptyState, ErrorState, LoadingState } from '../components/ui'
import { Plus, Pencil, Trash2, Bell, Check, Eye, Bolt } from '../components/ui/Icons'
import {
  getNotificationServers, createNotificationServer, updateNotificationServer,
  deleteNotificationServer, setDefaultNotificationServer, testNotificationServer,
  type NotificationServer,
} from '../api/notifications'
import {
  ServerFormModal, TestSendModal, ServerDetailDrawer, ConfirmModal, Toast, SERVER_TYPES,
} from './components/NotificationShared'
import type { TweakValues } from '../types'

interface NotificationsPageProps { tweaks: TweakValues }

// ── Server card ────────────────────────────────────────────────────────────────

interface ServerCardProps {
  server: NotificationServer
  onView: () => void
  onTest: () => void
  onEdit: () => void
  onSetDefault: () => void
  onDelete: () => void
  settingDefault: boolean
}

function ServerCard({ server, onView, onTest, onEdit, onSetDefault, onDelete, settingDefault }: ServerCardProps) {
  const spec = SERVER_TYPES[server.type]
  const cfg = server.config as Record<string, unknown>
  const summary = server.type === 'smtp'
    ? `${cfg['host'] ?? '—'}:${cfg['port'] ?? '—'}`
    : spec?.label ?? server.type

  return (
    <div className="card" style={{ padding: '14px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{server.name}</span>
            <Chip kind="info" mono>{spec?.label ?? server.type}</Chip>
            {server.is_default && (
              <Chip kind="ok" dot>default</Chip>
            )}
          </div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{summary}</div>
        </div>
        <div className="row-tight" style={{ gap: 6 }}>
          <button className="icon-btn" title="Send test email" onClick={onTest}>
            <Bolt w={14} />
          </button>
          <button className="icon-btn" title="View details" onClick={onView}>
            <Eye w={14} />
          </button>
          <button className="icon-btn" title="Edit" onClick={onEdit}>
            <Pencil w={13} />
          </button>
          {!server.is_default && (
            <button
              className="icon-btn"
              title="Set as default"
              onClick={onSetDefault}
              disabled={settingDefault}
              style={{ color: 'var(--ok)' }}
            >
              <Check w={14} />
            </button>
          )}
          <button className="icon-btn" title="Delete" onClick={onDelete} style={{ color: 'var(--danger)' }}>
            <Trash2 w={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

const NotificationsPage: React.FC<NotificationsPageProps> = () => {
  const [servers, setServers] = React.useState<NotificationServer[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [busy, setBusy]           = React.useState(false)
  const [settingDefault, setSettingDefault] = React.useState(false)
  const [toast, setToast] = React.useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)

  const [showCreate, setShowCreate]     = React.useState(false)
  const [viewTarget, setViewTarget]     = React.useState<NotificationServer | null>(null)
  const [editTarget, setEditTarget]     = React.useState<NotificationServer | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<NotificationServer | null>(null)
  const [testTarget, setTestTarget]     = React.useState<NotificationServer | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true); setLoadError(null)
    try { setServers(await getNotificationServers()) }
    catch (err) { setLoadError((err as Error).message || 'Failed to load') }
    finally { setLoading(false) }
  }, [])

  React.useEffect(() => { load() }, [load])

  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  async function handleCreate(data: { name: string; description?: string; type: string; config: Record<string, unknown> }) {
    setBusy(true)
    try {
      await createNotificationServer(data)
      setShowCreate(false)
      setToast({ msg: 'Server added', kind: 'ok' })
      await load()
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to create', kind: 'err' })
    } finally { setBusy(false) }
  }

  async function handleUpdate(id: string, data: { name: string; description?: string; config: Record<string, unknown> }) {
    setBusy(true)
    try {
      await updateNotificationServer(id, data)
      setEditTarget(null)
      setToast({ msg: 'Server updated', kind: 'ok' })
      await load()
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to update', kind: 'err' })
    } finally { setBusy(false) }
  }

  async function handleDelete(server: NotificationServer) {
    setBusy(true)
    try {
      await deleteNotificationServer(server.id)
      setDeleteTarget(null)
      setToast({ msg: `${server.name} removed`, kind: 'ok' })
      await load()
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to delete', kind: 'err' })
    } finally { setBusy(false) }
  }

  async function handleSetDefault(server: NotificationServer) {
    setSettingDefault(true)
    try {
      await setDefaultNotificationServer(server.id)
      setToast({ msg: `${server.name} set as default`, kind: 'ok' })
      await load()
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed', kind: 'err' })
    } finally { setSettingDefault(false) }
  }

  async function handleTest(server: NotificationServer, recipient: string) {
    return testNotificationServer(server.id, recipient)
  }

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="notifications" />
      <PageHeader title="Notification Providers" subtitle={<><span>Configure SMTP email servers and notification channels. Add server connections, test connectivity, set sender identities, and choose which events trigger alerts.<br /></span><b className="mono">{servers.length}</b> email server{servers.length !== 1 ? 's' : ''} configured</>}
        actions={<button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus w={13} /> Add server</button>} />

      {loading ? (
        <LoadingState />
      ) : loadError ? (
        <ErrorState title="Failed to load servers" message={loadError} onRetry={load} />
      ) : servers.length === 0 ? (
        <EmptyState
          icon={<Bell w={28} />}
          title="No email servers configured"
          subtitle="Add an SMTP server to enable email notifications"
          action={
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
              <Plus w={12} /> Add first server
            </button>
          }
        />
      ) : (
        <div className="stack">
          {servers.map(s => (
            <ServerCard
              key={s.id}
              server={s}
              onView={() => setViewTarget(s)}
              onTest={() => setTestTarget(s)}
              onEdit={() => setEditTarget(s)}
              onSetDefault={() => handleSetDefault(s)}
              onDelete={() => setDeleteTarget(s)}
              settingDefault={settingDefault}
            />
          ))}
        </div>
      )}

      {viewTarget && !editTarget && (
        <ServerDetailDrawer
          server={viewTarget}
          onClose={() => setViewTarget(null)}
          onEdit={() => { setEditTarget(viewTarget); setViewTarget(null) }}
          onTest={() => { setTestTarget(viewTarget); setViewTarget(null) }}
        />
      )}
      {showCreate && (
        <ServerFormModal
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
          busy={busy}
        />
      )}
      {editTarget && (
        <ServerFormModal
          server={editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={d => handleUpdate(editTarget.id, d)}
          busy={busy}
        />
      )}
      {testTarget && (
        <TestSendModal
          server={testTarget}
          onClose={() => setTestTarget(null)}
          onTest={recipient => handleTest(testTarget, recipient)}
        />
      )}
      {deleteTarget && (
        <ConfirmModal
          title="Remove server"
          message={<>Remove <strong>{deleteTarget.name}</strong>? This cannot be undone.{deleteTarget.is_default && servers.length > 1 && <><br /><span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>The next oldest server will become the default.</span></>}</>}
          confirmLabel="Remove server"
          danger
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget)}
          busy={busy}
        />
      )}
      {toast && <Toast {...toast} />}
    </div>
  )
}

export default NotificationsPage
