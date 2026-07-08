import React from 'react'
import { Chip, KV, LoadingState, Drawer, Tabs } from '../../components/ui'
import { Plus, Cpu, Network, Key, Refresh, Trash2, Shield } from '../../components/ui/Icons'
import type { UIKey } from '../../api/apikeys'
import type { App as UIApp } from '../../types'
import type { AiProvider } from '../../api/providers'

import { getAppApiKeys, rotateApiKey, revokeApiKey } from '../../api/apikeys'
import { getUsers, type UIUser } from '../../api/users'
import { getAppPermissions, addAppPermission, removeAppPermission, getAppUsageQuota, resetAppQuota, type AppPermission, type AppQuotaUsage } from '../../api/apps'
import { KeyValueDisplay } from './AppsShared'
import { ConfirmModal, KeyGenModal } from './AppsModals'
import { useAuth } from '../../context/AuthContext'

// ── Detail drawer ─────────────────────────────────────────────────────────────

type DrawerTab = 'info' | 'keys' | 'history' | 'permissions'

export function DetailDrawer({ app: a, open, providerMap, orgNameMap, onClose, onEdit, onDelete, onRevealKey }: {
  app: UIApp; open?: boolean; providerMap: Map<string, AiProvider>; orgNameMap: Record<string, string>
  onClose: () => void; onEdit: () => void; onDelete: () => void
  onRevealKey: (fullKey: string, title: string, graceHours?: number) => void
}) {
  const primary  = a.primaryProviderId  ? providerMap.get(a.primaryProviderId)  : null
  const backup1  = a.backup1ProviderId  ? providerMap.get(a.backup1ProviderId)  : null
  const backup2  = a.backup2ProviderId  ? providerMap.get(a.backup2ProviderId)  : null

  const { isAdmin, user } = useAuth()
  const isOwner = !!user?.id && user.id === a.ownerId
  const canManagePermissions = isAdmin || isOwner
  const [tab, setTab] = React.useState<DrawerTab>('info')
  const [quota, setQuota] = React.useState<AppQuotaUsage | null>(null)
  const [quotaResetting, setQuotaResetting] = React.useState(false)
  const [keys, setKeys] = React.useState<UIKey[]>([])
  const [keysLoading, setKeysLoading] = React.useState(false)
  const [keysLoaded, setKeysLoaded] = React.useState(false)
  const [showKeyGen, setShowKeyGen] = React.useState(false)
  const [rotateKey, setRotateKey] = React.useState<UIKey | null>(null)
  const [revokeKey, setRevokeKey] = React.useState<UIKey | null>(null)
  const [keyBusy, setKeyBusy] = React.useState(false)

  const [permissions, setPermissions] = React.useState<AppPermission[]>([])
  const [allUsers, setAllUsers] = React.useState<UIUser[]>([])
  const [permissionsLoading, setPermissionsLoading] = React.useState(false)
  const [permissionsLoaded, setPermissionsLoaded] = React.useState(false)
  const [addingPermission, setAddingPermission] = React.useState<string | null>(null)
  const [removingPermission, setRemovingPermission] = React.useState<string | null>(null)

   function loadKeys() {
    getAppApiKeys(a.id).then(ks => { setKeys(ks); setKeysLoaded(true) }).catch(() => {}).finally(() => setKeysLoading(false))
  }

  function loadPermissions() {
    setPermissionsLoading(true)
    Promise.all([getAppPermissions(a.id), getUsers()])
      .then(([perms, users]) => {
        setPermissions(perms)
        setAllUsers(users.filter(u => {
          if (!a.orgId) return false
          if (u.groupId !== '00000000-0000-0000-0000-000000000003' && u.groupId !== '00000000-0000-0000-0000-000000000004') return false
          return u.organizationId === a.orgId
        }))
        setPermissionsLoaded(true)
      })
      .catch(() => {})
      .finally(() => setPermissionsLoading(false))
  }

  React.useEffect(() => {
    if ((tab === 'keys' || tab === 'history') && !keysLoaded) loadKeys()
    if (tab === 'permissions' && !permissionsLoaded) loadPermissions()
  }, [tab])

  const loadQuota = React.useCallback(() => {
    if (a.quotaMode && a.quotaMode !== 'unlimited') {
      getAppUsageQuota(a.id).then(setQuota).catch(() => {})
    } else {
      setQuota(null)
    }
  }, [a.id, a.quotaMode])

  React.useEffect(() => { loadQuota() }, [loadQuota])

  async function handleResetQuota() {
    if (!confirm('Reset this app\'s usage counter to zero?')) return
    setQuotaResetting(true)
    try { await resetAppQuota(a.id); loadQuota() }
    catch (e) { console.error('Failed to reset quota:', e) }
    finally { setQuotaResetting(false) }
  }

  const activeKeys  = keys.filter(k => k.status !== 'revoked')
  const revokedKeys = keys.filter(k => k.status === 'revoked')
    .sort((a, b) => b.created.localeCompare(a.created))

  async function handleRotateKey(k: UIKey) {
    setRotateKey(null); setKeyBusy(true)
    try {
      const { full_key, graceHours } = await rotateApiKey(k.id)
      onRevealKey(full_key, `Key rotated — ${k.name}`, graceHours)
      loadKeys()
    } finally { setKeyBusy(false) }
  }
  async function handleRevokeKey(k: UIKey) {
    setRevokeKey(null); setKeyBusy(true)
    try { await revokeApiKey(k.id); loadKeys() }
    finally { setKeyBusy(false) }
  }
  function handleKeyCreated(fullKey: string, keyName: string) {
    setShowKeyGen(false)
    onRevealKey(fullKey, `Key generated — ${keyName}`)
    loadKeys()
  }

  async function handleAddPermission(userId: string) {
    setAddingPermission(userId)
    try {
      await addAppPermission(a.id, userId)
      loadPermissions()
    } catch (e) {
      console.error('Failed to add permission:', e)
    }
    setAddingPermission(null)
  }

  async function handleRemovePermission(permissionId: string) {
    if (!confirm('Remove this user\'s access to the app?')) return
    setRemovingPermission(permissionId)
    try {
      await removeAppPermission(a.id, permissionId)
      loadPermissions()
    } catch (e) {
      console.error('Failed to remove permission:', e)
    }
    setRemovingPermission(null)
  }

  function ProviderChip({ p }: { p: AiProvider | null | undefined }) {
    if (!p) return <span style={{ color: 'var(--fg-tertiary)', fontSize: 11 }}>—</span>
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: p.status === 'healthy' ? 'var(--ok)' : p.status === 'degraded' ? 'var(--warning)' : 'var(--danger)',
          flexShrink: 0,
        }} />
        {p.name}
        <span style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>· {p.vendor}</span>
      </span>
    )
  }

  return (
    <>
      <Drawer
        open={open}
        icon={<Cpu w={14} style={{ color: 'var(--accent)' }} />}
        title={a.name}
        subtitle={a.id}
        onClose={onClose}
        footer={
          <>
            {tab === 'info' && (
              <>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={onDelete}>Delete</button>
                <div style={{ flex: 1 }} />
                <button className="btn btn-primary" onClick={onEdit}>Edit</button>
              </>
            )}
            {tab === 'keys' && activeKeys.length > 0 && (
              <>
                <div style={{ flex: 1 }} />
                <button className="btn btn-primary" onClick={() => setShowKeyGen(true)}>
                  <Plus w={12} /> Generate key
                </button>
              </>
            )}
          </>
        }
      >
        <Tabs tabs={[
          { key: 'info', label: 'Info' },
          { key: 'permissions', label: `Permissions${permissions.length > 0 ? ` (${permissions.length})` : ''}` },
          { key: 'keys', label: `API Keys${activeKeys.length > 0 ? ` (${activeKeys.length})` : ''}` },
          { key: 'history', label: `History${revokedKeys.length > 0 ? ` (${revokedKeys.length})` : ''}` },
        ]} activeKey={tab} onChange={setTab} />

        <div style={{ padding: '16px 20px' }}>
        {tab === 'info' && (
          <>
            <KV labelWidth={130} gap={8} style={{ marginBottom: 18 }} rows={[
              { label: 'Team', value: <span style={{ fontSize: 12 }}>{a.team || <span className="caption">—</span>}</span> },
              { label: 'Organization', value: <span style={{ fontSize: 12 }}>
                {a.orgId ? (
                  <span>{orgNameMap[a.orgId] || <span className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{a.orgId.slice(0, 8)}…</span>}</span>
                ) : (
                  <Chip kind="warn" mono>missing</Chip>
                )}
              </span> },
              { label: 'Owner', value: <span style={{ fontSize: 12 }}>{a.owner || <span className="caption">—</span>}</span> },
              { label: 'Owner email', value: <span style={{ fontSize: 12 }}>{a.ownerEmail || <span className="caption">—</span>}</span>, mono: true },
              { label: 'Environment', value: <Chip kind={a.env === 'production' ? 'ok' : a.env === 'development' ? 'warn' : 'muted'} dot>{a.env}</Chip> },
              { label: 'Status', value: <>
                {a.status === 'enable'  && <Chip kind="ok"    dot>enabled</Chip>}
                {a.status === 'disable' && <Chip kind="muted" dot>disabled</Chip>}
              </> },
              { label: 'Mode', value: <>
                 {a.mode === 'guard'   && <Chip kind="ok"   >🛡️ guard</Chip>}
                 {a.mode === 'soft'    && <Chip kind="ok"   >🛡️ soft</Chip>}
                 {a.mode === 'monitor' && <Chip kind="warn" >👁️ monitor</Chip>}
                 {a.mode === 'bypass'  && <Chip kind="muted">⚡ bypass</Chip>}
              </> },
              { label: 'T2 intent analysis', value: <>
                {a.enableT2
                  ? <Chip kind="ok"    dot>enabled</Chip>
                  : <Chip kind="muted" dot>disabled</Chip>}
              </> },
              { label: 'Knowledge developer', value: <>
                {a.enableKnowledgeDev
                  ? <Chip kind="info"  dot>enabled</Chip>
                  : <Chip kind="muted" dot>disabled</Chip>}
              </> },
              { label: 'Response caching', value: <>
                {a.enableResponseCache
                  ? <Chip kind="info" dot>enabled{a.multiTurnSemanticEnabled ? ' · multi-turn semantic' : ''}</Chip>
                  : <Chip kind="muted" dot>disabled</Chip>}
              </> },
              a.enableResponseCache && { label: 'Cache TTL', value: <span style={{ fontSize: 12 }}>{a.cacheTtlSeconds != null ? `${a.cacheTtlSeconds}s` : <span className="caption">— (system default, 300s)</span>}</span>, mono: true },
              { label: 'Max input tokens', value: <span style={{ fontSize: 12 }}>{a.maxTokens != null ? a.maxTokens.toLocaleString() : <span className="caption">— (no limit)</span>}</span>, mono: true },
              { label: 'Max payload size', value: <span style={{ fontSize: 12 }}>{a.maxPayloadSize != null ? `${(a.maxPayloadSize / 1024).toFixed(1)} KB` : <span className="caption">— (no limit)</span>}</span>, mono: true },
              { label: 'Requests (24h)', value: <span style={{ fontSize: 12 }}>{a.total.toLocaleString()}</span>, mono: true },
              { label: 'Blocked', value: <span style={{ fontSize: 12 }}>{a.blocked.toLocaleString()}</span>, mono: true },
            ]} />

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14, marginBottom: 14 }}>
              <div className="label-strong" style={{ fontSize: 12, marginBottom: 10 }}>Usage quota</div>
              {(!a.quotaMode || a.quotaMode === 'unlimited') ? (
                <div style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>No quota — unlimited requests.</div>
              ) : (
                <KV labelWidth={130} gap={8} rows={[
                  { label: 'Mode', value: <Chip kind="info">{a.quotaMode === 'monthly' ? `monthly · day ${a.quotaResetDay ?? 1}` : 'fixed total'}</Chip> },
                  { label: 'Usage', value: quota ? (
                    <Chip kind={quota.usage.state === 'exceeded' ? 'err' : quota.usage.state === 'warning' ? 'warn' : 'ok'} mono>
                      {quota.usage.used.toLocaleString()} / {(a.quotaLimit ?? 0).toLocaleString()}
                    </Chip>
                  ) : <span className="caption">…</span> },
                  { label: 'Enforcement', value: <Chip kind={a.quotaEnforcement === 'soft' ? 'warn' : 'muted'}>{a.quotaEnforcement === 'soft' ? 'allow over' : 'hard block (429)'}</Chip> },
                  a.quotaWarningLimit != null && { label: 'Warn at', value: <span style={{ fontSize: 12 }}>{a.quotaWarningLimit.toLocaleString()}</span>, mono: true },
                  quota?.usage.period_end && { label: 'Resets', value: <span style={{ fontSize: 12 }}>{new Date(quota.usage.period_end).toLocaleString()}</span>, mono: true },
                  isAdmin && { label: '', value: <button className="btn btn-ghost btn-sm" onClick={handleResetQuota} disabled={quotaResetting}>{quotaResetting ? 'Resetting…' : 'Reset quota'}</button> },
                ]} />
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14, marginBottom: 6 }}>
              <div className="label-strong" style={{ fontSize: 12, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Network w={13} /> Upstream provider routing
              </div>
              <KV labelWidth={90} gap={8} rows={[
                { label: 'Primary', value: <ProviderChip p={primary} /> },
                { label: 'Backup 1', value: <ProviderChip p={backup1} /> },
                { label: 'Backup 2', value: <ProviderChip p={backup2} /> },
              ]} />
            </div>
          </>
        )}

        {tab === 'keys' && (
          <>
            {keysLoading ? (
              <LoadingState message="Loading keys…" size="sm" />
            ) : activeKeys.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--fg-tertiary)' }}>
                <Key w={24} style={{ opacity: 0.3, marginBottom: 10 }} />
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>No active API keys</div>
                <div style={{ fontSize: 12, marginBottom: 14 }}>Generate a key to allow this app to send requests through the gateway.</div>
                <button className="btn btn-primary btn-sm" onClick={() => setShowKeyGen(true)}>
                  <Plus w={12} /> Generate first key
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeKeys.map(k => (
                  <div key={k.id} style={{
                    padding: '10px 12px', borderRadius: 8,
                    background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Key w={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      <span style={{ fontWeight: 500, fontSize: 13, flex: 1 }}>{k.name}</span>
                      {k.status === 'active'     && <Chip kind="ok"   dot>active</Chip>}
                      {k.status === 'rotate-due' && <Chip kind="warn" dot>rotation due</Chip>}
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <KeyValueDisplay keyId={k.id} prefix={k.prefix} />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', marginBottom: 4 }}>Last used: {k.lastUsed}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1 }} />
                      <button className="btn btn-ghost btn-sm" onClick={() => setRotateKey(k)} disabled={keyBusy}>
                        <Refresh w={11} /> Rotate
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setRevokeKey(k)} disabled={keyBusy}>
                        Revoke
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'permissions' && (
          <>
            {permissionsLoading ? (
              <LoadingState size="sm" />
            ) : (
              <>
                {/* Current permissions */}
                <div style={{ marginBottom: 20 }}>
                  <div className="label-strong" style={{ marginBottom: 10 }}>Authorized users ({permissions.length})</div>
                  {permissions.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', textAlign: 'center', padding: 16, background: 'var(--bg-sunken)', borderRadius: 6 }}>
                      No users have access to this app yet
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {permissions.map(p => (
                        <div key={p.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                          background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 6
                        }}>
                          <Shield w={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 500 }}>{p.user_name}</div>
                            <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{p.user_email}</div>
                          </div>
                          {canManagePermissions && (
                            <button
                              className="icon-btn"
                              onClick={() => handleRemovePermission(p.id)}
                              disabled={removingPermission === p.id}
                              style={{ color: 'var(--danger)' }}
                              title="Remove access"
                            >
                              <Trash2 w={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add permissions */}
                {canManagePermissions && allUsers.length > permissions.length && (
                  <div>
                    <div className="label-strong" style={{ marginBottom: 10 }}>Add users ({allUsers.length - permissions.length} available)</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {allUsers.filter(u => !permissions.find(p => p.user_id === u.id)).map(u => (
                        <div key={u.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                          background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 6
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 500 }}>{u.displayName}</div>
                            <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{u.email}</div>
                          </div>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleAddPermission(u.id)}
                            disabled={addingPermission === u.id}
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
          </>
        )}

        {tab === 'history' && (
          <>
            {keysLoading ? (
              <LoadingState size="sm" />
            ) : revokedKeys.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--fg-tertiary)' }}>
                <Key w={24} style={{ opacity: 0.3, marginBottom: 10 }} />
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>No key history yet</div>
                <div style={{ fontSize: 12 }}>Revoked or expired keys will appear here.</div>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                {/* Timeline spine */}
                <div style={{
                  position: 'absolute', left: 11, top: 8, bottom: 8,
                  width: 1, background: 'var(--border-subtle)',
                }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {revokedKeys.map((k, i) => (
                    <div key={k.id} style={{ display: 'flex', gap: 14, paddingBottom: i < revokedKeys.length - 1 ? 16 : 0 }}>
                      {/* Timeline dot */}
                      <div style={{ flexShrink: 0, marginTop: 10 }}>
                        <div style={{
                          width: 9, height: 9, borderRadius: '50%',
                          background: 'var(--fg-tertiary)', border: '2px solid var(--bg-page)',
                          position: 'relative', zIndex: 1,
                        }} />
                      </div>
                      {/* Key card */}
                      <div style={{
                        flex: 1, padding: '10px 12px', borderRadius: 8,
                        background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
                        opacity: 0.8,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{ fontWeight: 500, fontSize: 13, flex: 1 }}>{k.name}</span>
                          <Chip kind="muted">revoked</Chip>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-secondary)', flex: 1 }}>{k.prefix}_***</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', fontSize: 10, color: 'var(--fg-tertiary)', marginBottom: 6 }}>
                          <span>Created: {k.created}</span>
                          <span>Last used: {k.lastUsed}</span>
                          <span>Owner: {k.owner}</span>
                          <span>Rotation: {k.rotates}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        </div>
      </Drawer>

      {showKeyGen && (
        <KeyGenModal appId={a.id} appName={a.name} onClose={() => setShowKeyGen(false)} onCreated={handleKeyCreated} />
      )}
      {rotateKey && (
        <ConfirmModal title="Rotate key"
          message={<>Rotate <strong>{rotateKey.name}</strong>? A new key will be generated; the old one enters a grace period.</>}
          confirmLabel="Rotate" busy={keyBusy}
          onClose={() => setRotateKey(null)} onConfirm={() => handleRotateKey(rotateKey)} />
      )}
      {revokeKey && (
        <ConfirmModal title="Revoke key" danger
          message={<>Permanently revoke <strong>{revokeKey.name}</strong>? This app will stop working if it only has this key.</>}
          confirmLabel="Revoke" busy={keyBusy}
          onClose={() => setRevokeKey(null)} onConfirm={() => handleRevokeKey(revokeKey)} />
      )}
    </>
  )
}
