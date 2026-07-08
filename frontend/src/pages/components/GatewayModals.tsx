import React, { useState, useEffect } from 'react'
import { Check, Eye, EyeOff, Copy, Trash, Code } from '../../components/ui/Icons'
import { copyToClipboard } from '../../utils/format'
import { GatewayConnectionGuide } from './GatewayConnectionGuide'
import { getAclLists, type AclList } from '../../api/networkAcl'
import {
  createGateway, updateGateway,
  listGatewayApiKeys, generateGatewayApiKey, revealGatewayApiKeys, revokeGatewayApiKeyVersion, deleteGatewayApiKeyVersion,
  type GatewayInstance, type GatewayAclData,
  type GatewayApiKeyVersion, type GatewayApiKeyRevealed,
} from '../../api/gateways'

// ── Pulse animation ───────────────────────────────────────────────────────────

const PULSE_STYLE = `
@keyframes gw-pulse {
  0%   { transform: scale(1);   opacity: 0.75; }
  100% { transform: scale(2.4); opacity: 0; }
}
.gw-dot-wrap {
  position: relative;
  width: 18px; height: 18px;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.gw-pulse-ring {
  position: absolute;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: var(--ok);
  animation: gw-pulse 1.6s ease-out infinite;
}
.gw-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  position: relative; z-index: 1;
}
@keyframes spin { to { transform: rotate(360deg); } }
`

export function PulseInject() {
  return <style>{PULSE_STYLE}</style>
}

// ── Health badge ─────────────────────────────────────────────────────────────

import type { GatewayHealth } from '../../api/gateways'
import { Chip, Drawer, LoadingState } from '../../components/ui'

export function HealthBadge({ health }: { health: GatewayHealth | 'checking' | null }) {
  if (!health) return <span style={{ color: 'var(--fg-secondary)', fontWeight: 600, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>—</span>
  if (health === 'checking') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--fg-tertiary)' }}>
        <span className="gw-dot-wrap">
          <span className="gw-dot" style={{ background: 'var(--fg-tertiary)', opacity: 0.4 }} />
        </span>
        checking…
      </span>
    )
  }
  const up = health.status === 'up'
  return (
    <span style={{
      color: up ? 'var(--ok)' : 'var(--danger)',
      fontWeight: 600,
      fontSize: 10,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    }}>
      {health.health_status || (up ? 'up' : 'down')}
    </span>
  )
}

// ── Detection banner ──────────────────────────────────────────────────────────

type DetectedCandidate = { url: string; health: 'checking' | 'up' | 'down'; latency: number | null }

function probeHost(hostname: string, setCandidates: React.Dispatch<React.SetStateAction<DetectedCandidate[]>>) {
  const urls = [`http://${hostname}:8082`, `https://${hostname}:8083`]
  setCandidates(urls.map(url => ({ url, health: 'checking', latency: null })))
  urls.forEach((url, i) => {
    const start = performance.now()
    const ctrl = new AbortController()
    setTimeout(() => ctrl.abort(), 5000)
    fetch(`${url}/health`, { signal: ctrl.signal })
      .then(r => {
        const latency = Math.round(performance.now() - start)
        setCandidates(prev => prev.map((c, idx) =>
          idx === i ? { ...c, health: r.ok ? 'up' : 'down', latency: r.ok ? latency : null } : c
        ))
      })
      .catch(() => {
        setCandidates(prev => prev.map((c, idx) =>
          idx === i ? { ...c, health: 'down', latency: null } : c
        ))
      })
  })
}

export function GatewayDetectionBanner({ instanceCount }: { instanceCount: number }) {
  const [candidates, setCandidates] = useState<DetectedCandidate[]>([])

  useEffect(() => {
    if (instanceCount !== 1) return
    const hostname = window.location.hostname
    if (!hostname || hostname === 'localhost') return
    probeHost(hostname, setCandidates)
  }, [instanceCount])

  if (instanceCount !== 1 || !candidates.length) return null

  const allDone = candidates.every(c => c.health !== 'checking')
  const anyUp   = candidates.some(c => c.health === 'up')

  return (
    <div style={{
      marginBottom: 16, padding: '12px 16px', borderRadius: 8,
      background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.03em', textTransform: 'uppercase' }}>All-in-one</span>
        <span style={{ fontSize: 10, color: 'var(--fg-tertiary)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>for reference only</span>
        <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginLeft: 'auto' }}>Detected on this host</span>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {candidates.map(c => (
          <span key={c.url} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            {c.health === 'checking' ? (
              <>
                <LoadingState size="sm" message="" />
                <code style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{c.url}</code>
              </>
            ) : c.health === 'up' ? (
              <>
                <span style={{ fontSize: 10, color: 'var(--ok)', lineHeight: 1 }}>●</span>
                <code style={{ fontSize: 11 }}>{c.url}</code>
                <span style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>{c.latency}ms</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: 10, color: 'var(--border-subtle)', lineHeight: 1 }}>●</span>
                <code style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{c.url}</code>
              </>
            )}
          </span>
        ))}
      </div>

      {allDone && (
        <div style={{ fontSize: 12, color: 'var(--fg-secondary)', lineHeight: 1.6 }}>
          {anyUp
            ? <>Gateway detected on this host. This assumes the console and gateway run on the <strong>same server</strong>. Use <strong>Edit</strong> to set the correct URL based on your actual infrastructure (separate host, container network, reverse proxy, etc.).</>
            : <>No gateway found on the default ports of this host. Start the gateway-engine, or use <strong>Edit</strong> to set the correct URL for your infrastructure.</>}
        </div>
      )}
    </div>
  )
}

export function GatewayConnectModal({ onClose, instances }: {
  onClose: () => void
  instances: GatewayInstance[]
}) {
  const guideUrl = instances[0]?.url ?? ''

  return (
    <Drawer
      open
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Code w={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Connect your app</div>
            <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2 }}>
              Route your app's LLM traffic through the AI Firewall Gateway
            </div>
          </div>
        </div>
      }
      onClose={onClose}
      width={620}
      footer={
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
      }
    >
      <GatewayConnectionGuide gatewayUrl={guideUrl} />
    </Drawer>
  )
}

// ── Form modal ────────────────────────────────────────────────────────────────

export function GatewayFormModal({ initial, open, onClose, onSave, gatewayUrlExample, isOnlyInstance }: {
  initial?: GatewayInstance
  open?: boolean
  onClose: () => void
  onSave: () => void
  gatewayUrlExample: string
  isOnlyInstance?: boolean
}) {
  const isEdit = !!initial
  const [form, setForm] = useState({
    name:                    initial?.name ?? '',
    description:             initial?.description ?? '',
    location:                initial?.location ?? '',
    url:                     initial?.url ?? '',
    acl_list_id:             initial?.aclListId ?? '',
    default_firewall_mode:   initial?.defaultFirewallMode ?? 'allow_all',
  })
  const [errors, setErrors]     = useState<Record<string, string>>({})
  const [busy, setBusy]         = useState(false)
  const [aclLists, setAclLists] = useState<AclList[]>([])
  const [loadingAcl, setLoadingAcl] = useState(true)
  const [selectedAclData, setSelectedAclData] = useState<GatewayAclData | null>(null)
  const [candidates, setCandidates] = useState<DetectedCandidate[]>([])

  function detectAndCheckGateway() {
    const hostname = window.location.hostname
    if (!hostname || hostname === 'localhost') return
    probeHost(hostname, setCandidates)
  }

  function useUrl(url: string) {
    setForm(f => ({ ...f, url }))
    setErrors(e => ({ ...e, url: '' }))
  }

  function setField(k: string, v: string) {
    setForm(f => {
      const updated = { ...f, [k]: v }

      if (k === 'default_firewall_mode' && form.acl_list_id) {
        const selectedAcl = aclLists.find(l => l.id === form.acl_list_id)
        if (selectedAcl) {
          const isCompatible =
            (v === 'allow_all' && selectedAcl.list_type === 'blocklist') ||
            (v === 'block_all' && selectedAcl.list_type === 'allowlist')

          if (!isCompatible) {
            updated.acl_list_id = ''
            setSelectedAclData(null)
          }
        }
      }

      return updated
    })
    setErrors(e => ({ ...e, [k]: '' }))

     if (k === 'acl_list_id' && v) {
       const selectedList = aclLists.find(l => l.id === v)
       if (selectedList) {
         setSelectedAclData({
           list: {
             id: selectedList.id,
             name: selectedList.name,
             list_type: selectedList.list_type as 'allowlist' | 'blocklist',
             entry_count: 0,
           },
           entries: [],
         })
       }
     } else if (k === 'acl_list_id' && !v) {
      setSelectedAclData(null)
    }
  }

  useEffect(() => {
    getAclLists()
      .then(lists => { setAclLists(lists); setLoadingAcl(false) })
      .catch(() => { setLoadingAcl(false) })
  }, [])

  useEffect(() => {
    if (!isEdit || isOnlyInstance) detectAndCheckGateway()
  }, [])

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault()
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs['name'] = 'Required'
    if (!form.url.trim()) errs['url'] = 'Required'
    else if (!/^https?:\/\//i.test(form.url.trim())) errs['url'] = 'Must start with http:// or https://'
    if (Object.keys(errs).length) { setErrors(errs); return }
    setBusy(true)
    try {
      const payload = {
        name:                    form.name.trim(),
        description:             form.description.trim() || null,
        location:                form.location.trim() || null,
        url:                     form.url.trim(),
        acl_list_id:             form.acl_list_id || null,
        default_firewall_mode:   form.default_firewall_mode,
      }
      if (isEdit) await updateGateway(initial!.id, payload)
      else await createGateway(payload)
      onSave()
    } catch (err) {
      setErrors({ name: (err as Error).message || 'Operation failed' })
    } finally { setBusy(false) }
  }

  return (
    <Drawer
      open={open}
      title={
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="crumbs" style={{ marginBottom: 4 }}>
            <span>Gateway</span><span className="sep">/</span>
            <span className="here">{isEdit ? 'Edit' : 'Add'}</span>
          </div>
          <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.2 }}>
            {isEdit ? initial!.name : 'New gateway instance'}
          </div>
          {isEdit && (
            <div className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 4 }}>{initial!.id}</div>
          )}
        </div>
      }
      onClose={onClose}
      zIndex={210}
      footer={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={handleSubmit}>
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Add instance'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
        <div style={{ padding: '16px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {errors['name'] && !errors['url'] && (
            <div style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 12 }}>
              {errors['name']}
            </div>
          )}

          <div>
            <label className="label" style={{ display: 'block', marginBottom: 4 }}>Name <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input className="input" style={{ width: '100%', boxSizing: 'border-box' }}
              value={form.name} onChange={e => setField('name', e.target.value)}
              placeholder="Production Gateway 1" />
            {errors['name'] && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3 }}>{errors['name']}</div>}
          </div>

          {!isEdit && (
            <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '8px 10px' }}>
              The Gateway ID is assigned automatically when you save. Open the instance afterwards
              to copy it into the new engine's <span className="mono">GATEWAY_INSTANCE_ID</span> env var.
            </div>
          )}

          <div>
            <label className="label" style={{ display: 'block', marginBottom: 4 }}>Description</label>
            <input className="input" style={{ width: '100%', boxSizing: 'border-box' }}
              value={form.description} onChange={e => setField('description', e.target.value)}
              placeholder="Primary gateway for production traffic" />
          </div>

          <div>
            <label className="label" style={{ display: 'block', marginBottom: 4 }}>Location</label>
            <input className="input" style={{ width: '100%', boxSizing: 'border-box' }}
              value={form.location} onChange={e => setField('location', e.target.value)}
              placeholder="US East, on-prem…" />
          </div>

          {candidates.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span className="label" style={{ fontSize: 11 }}>All-in-one detection</span>
                <span style={{ fontSize: 10, color: 'var(--fg-tertiary)', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>reference only</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginBottom: 2 }}>
                Probed standard ports on this host. Set the URL to reflect your actual infrastructure.
              </div>
              {candidates.map(c => (
                <div key={c.url} style={{
                  padding: '8px 12px', borderRadius: 6,
                  background: c.health === 'up' ? 'var(--ok-bg)' : 'var(--bg-sunken)',
                  border: `1px solid ${c.health === 'up' ? 'var(--ok)' : 'var(--border-subtle)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                }}>
                  <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    {c.health === 'checking' ? (
                      <>
                        <LoadingState size="sm" message="" />
                        <code style={{ fontSize: 11, color: 'var(--fg-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.url}</code>
                      </>
                    ) : c.health === 'up' ? (
                      <>
                        <span style={{ color: 'var(--ok)', flexShrink: 0 }}>✓</span>
                        <code style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.url}</code>
                        <span style={{ color: 'var(--fg-tertiary)', fontSize: 11, flexShrink: 0 }}>{c.latency}ms</span>
                      </>
                    ) : (
                      <>
                        <span style={{ color: 'var(--fg-tertiary)', flexShrink: 0 }}>—</span>
                        <code style={{ fontSize: 11, color: 'var(--fg-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.url}</code>
                      </>
                    )}
                  </span>
                  {c.health === 'up' && (
                    <button type="button" onClick={() => useUrl(c.url)} style={{
                      padding: '3px 9px', borderRadius: 4, border: 'none',
                      background: 'var(--ok)', color: '#fff', cursor: 'pointer',
                      fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                      Use this URL
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="label" style={{ display: 'block', marginBottom: 4 }}>
              URL <span style={{ color: 'var(--danger)' }}>*</span>
              <span style={{ fontWeight: 400, color: 'var(--fg-tertiary)', fontSize: 11, marginLeft: 6 }}>e.g. {gatewayUrlExample}</span>
            </label>
            <input className="input mono" style={{ width: '100%', boxSizing: 'border-box' }}
              value={form.url} onChange={e => setField('url', e.target.value)}
              placeholder={gatewayUrlExample}
              spellCheck={false} />
            {errors['url'] && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3 }}>{errors['url']}</div>}
          </div>

          <div>
            <label className="label" style={{ display: 'block', marginBottom: 8 }}>
              Default Firewall Mode
              <span style={{ fontWeight: 400, color: 'var(--fg-tertiary)', fontSize: 11, marginLeft: 6 }}>when no ACL is assigned</span>
            </label>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input type="radio" name="default_firewall_mode" value="allow_all"
                  checked={form.default_firewall_mode === 'allow_all'}
                  onChange={e => setField('default_firewall_mode', e.target.value)}
                  style={{ cursor: 'pointer' }} />
                <span>
                  <div style={{ fontWeight: 500 }}>✓ Allow All</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>Default: accept all traffic</div>
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input type="radio" name="default_firewall_mode" value="block_all"
                  checked={form.default_firewall_mode === 'block_all'}
                  onChange={e => setField('default_firewall_mode', e.target.value)}
                  style={{ cursor: 'pointer' }} />
                <span>
                  <div style={{ fontWeight: 500 }}>🚫 Block All</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>Default: reject all traffic</div>
                </span>
              </label>
            </div>
          </div>

          <div>
            <label className="label" style={{ display: 'block', marginBottom: 4 }}>
              Network ACL List
              <span style={{ fontWeight: 400, color: 'var(--fg-tertiary)', fontSize: 11, marginLeft: 6 }}>
                {form.default_firewall_mode === 'allow_all' ? 'blocklists only (deny specific IPs)' : 'allowlists only (allow specific IPs)'}
              </span>
            </label>
            <select className="input" style={{ width: '100%', boxSizing: 'border-box' }}
              value={form.acl_list_id} onChange={e => setField('acl_list_id', e.target.value)}
              disabled={loadingAcl}>
              <option value="">— No ACL —</option>
              {aclLists
                .filter(l => form.default_firewall_mode === 'allow_all' ? l.list_type === 'blocklist' : l.list_type === 'allowlist')
                .map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {aclLists.length > 0 && aclLists.filter(l =>
              form.default_firewall_mode === 'allow_all' ? l.list_type === 'blocklist' : l.list_type === 'allowlist'
            ).length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 6 }}>
                No {form.default_firewall_mode === 'allow_all' ? 'blocklists' : 'allowlists'} available.
                Create one in the <a href="/network-acl" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Network ACL</a> page.
              </div>
            )}
            {selectedAclData && (
              <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 6, background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 12, marginBottom: 6 }}>
                  <div style={{
                    display: 'inline-block', padding: '4px 8px', borderRadius: 4, fontWeight: 500, fontSize: 11,
                    background: selectedAclData.list.list_type === 'allowlist' ? 'var(--danger-bg)' : 'var(--ok-bg)',
                    color: selectedAclData.list.list_type === 'allowlist' ? 'var(--danger)' : 'var(--ok)',
                  }}>
                    {selectedAclData.list.list_type === 'allowlist' ? '🚫 BLOCK ALL' : '✓ ALLOW ALL'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 6 }}>
                    {selectedAclData.list.list_type === 'allowlist'
                      ? 'Only IPs/domains in this list are allowed. All others are blocked.'
                      : 'All IPs are allowed except those in this list.'}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>Entries: <strong>{selectedAclData.list.entry_count}</strong></div>
                <a href="/network-acl" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', display: 'block', marginTop: 6 }}>
                  → Manage entries
                </a>
              </div>
            )}
          </div>

        </div>
      </form>
    </Drawer>
  )
}

// ── API Keys modal ────────────────────────────────────────────────────────────

function graceLabel(expiresAt: string | null): string {
  if (!expiresAt) return ''
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'expired'
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return 'expires <1h'
  if (h < 24) return `expires in ${h}h`
  return `expires in ${Math.floor(h / 24)}d`
}

function StatusChip({ status, graceExpiresAt }: { status: GatewayApiKeyVersion['status']; graceExpiresAt: string | null }) {
  if (status === 'active')
    return <Chip kind="ok">Active</Chip>
  if (status === 'superseded')
    return <Chip kind="warn">Grace — {graceLabel(graceExpiresAt)}</Chip>
  return <Chip kind="muted">Revoked</Chip>
}

export function GatewayApiKeysModal({ instance, open, onClose }: {
  instance: GatewayInstance
  open?: boolean
  onClose: () => void
}) {
  const [keys, setKeys]                 = useState<GatewayApiKeyVersion[]>([])
  const [revealed, setRevealed]         = useState<GatewayApiKeyRevealed[]>([])
  const [loading, setLoading]           = useState(true)
  const [busy, setBusy]                 = useState(false)
  const [showReveal, setShowReveal]     = useState(false)
  const [confirmRotate, setConfirmRotate] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [newKey, setNewKey]             = useState<string | null>(null)
  const [copied, setCopied]             = useState<string | null>(null)
  const [error, setError]               = useState<string | null>(null)

  const hasActive = keys.some(k => k.status === 'active')

  async function reload() {
    try {
      const list = await listGatewayApiKeys(instance.id)
      setKeys(list)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  async function handleGenerate() {
    setBusy(true); setError(null)
    try {
      const result = await generateGatewayApiKey(instance.id)
      setNewKey(result.full_key)
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false); setConfirmRotate(false)
    }
  }

  async function handleToggleReveal() {
    if (showReveal) {
      setShowReveal(false)
      return
    }
    setBusy(true); setError(null)
    try {
      const list = await revealGatewayApiKeys(instance.id)
      setRevealed(list)
      setShowReveal(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleRevoke(versionId: string) {
    setBusy(true); setError(null)
    try {
      await revokeGatewayApiKeyVersion(instance.id, versionId)
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false); setConfirmRevoke(null)
    }
  }

  async function handleDelete(versionId: string) {
    setBusy(true); setError(null)
    try {
      await deleteGatewayApiKeyVersion(instance.id, versionId)
      setShowReveal(false); setRevealed([])
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false); setConfirmDelete(null)
    }
  }

  async function copy(text: string, id: string) {
    try {
      await copyToClipboard(text)
      setCopied(id)
      setTimeout(() => setCopied(null), 1800)
    } catch (_e) {
      setError('Copy failed — select and copy the key manually')
    }
  }

  return (
    <Drawer
      open={open}
      title={
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="crumbs" style={{ marginBottom: 4 }}>
            <span>Gateway</span><span className="sep">/</span><span className="here">API Keys</span>
          </div>
          <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.2 }}>{instance.name}</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 4 }}>{instance.id}</div>
        </div>
      }
      onClose={onClose}
      zIndex={210}
      footer={
        <>
          {hasActive && (
            <>
              {!confirmRotate ? (
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirmRotate(true)}>
                  Rotate key
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ color: 'var(--warn)' }}>Grace period applies. Confirm?</span>
                  <button className="btn btn-danger btn-sm" disabled={busy} onClick={handleGenerate}>Rotate</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmRotate(false)}>Cancel</button>
                </div>
              )}
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={handleToggleReveal}>
                {showReveal ? <EyeOff w={13} /> : <Eye w={13} />}
                {showReveal ? 'Hide keys' : 'Reveal keys'}
              </button>
            </>
          )}
          <div style={{ flex: 1 }} />
          {!hasActive && (
            <button className="btn btn-primary btn-sm" disabled={busy || loading} onClick={handleGenerate}>
              {busy ? 'Generating…' : 'Generate key'}
            </button>
          )}
        </>
      }
    >
      <div style={{ padding: '16px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Info banner */}
        <div style={{ padding: '10px 12px', borderRadius: 6, background: 'var(--bg-sunken)', fontSize: 12, color: 'var(--fg-secondary)', lineHeight: 1.5 }}>
          Control keys authenticate the backend→gateway management channel (<code>/reload</code>, etc.).
          Rotating a key keeps the old key valid for the grace period. The new key is pushed to the gateway
          automatically and becomes active within ~30s — no restart needed.
        </div>

        {error && (
          <div style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 12 }}>{error}</div>
        )}

        {/* New key banner after generate/rotate */}
        {newKey && (
          <div style={{ padding: '12px 14px', borderRadius: 6, background: 'var(--ok-bg)', border: '1px solid var(--ok)', fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: 'var(--ok)', marginBottom: 6 }}>New key generated — copy it now</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code className="mono" style={{ flex: 1, wordBreak: 'break-all', fontSize: 11, background: 'var(--bg-surface)', padding: '4px 8px', borderRadius: 4 }}>{newKey}</code>
              <button className="icon-btn" title="Copy" onClick={() => copy(newKey, 'new')}>
                {copied === 'new' ? <Check w={14} /> : <Copy w={14} />}
              </button>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--fg-tertiary)' }}>
              You can also reveal this key any time via the Reveal button below.
            </div>
          </div>
        )}

        {/* Reveal panel */}
        {showReveal && revealed.length > 0 && (
          <div style={{ padding: '12px 14px', borderRadius: 6, background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--fg-secondary)' }}>Valid keys</span>
            {revealed.map(k => (
              <div key={k.id} style={{ fontSize: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <StatusChip status={k.status} graceExpiresAt={k.grace_expires_at} />
                  <span className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>v{k.version} · {k.key_prefix}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code className="mono" style={{ flex: 1, wordBreak: 'break-all', fontSize: 11, background: 'var(--bg-surface)', padding: '4px 8px', borderRadius: 4 }}>{k.full_key}</code>
                  <button className="icon-btn" title="Copy" onClick={() => copy(k.full_key, k.id)}>
                    {copied === k.id ? <Check w={13} /> : <Copy w={13} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Key version history table */}
        {loading ? (
          <LoadingState size="sm" />
        ) : keys.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--fg-tertiary)', padding: '20px 0', fontSize: 13 }}>No keys yet — generate one using the button below.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--fg-tertiary)', fontWeight: 500 }}>Version</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--fg-tertiary)', fontWeight: 500 }}>Prefix</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--fg-tertiary)', fontWeight: 500 }}>Status</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--fg-tertiary)', fontWeight: 500 }}>Created</th>
                <th style={{ padding: '6px 8px' }} />
              </tr>
            </thead>
            <tbody>
              {keys.map(k => (
                <tr key={k.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '8px 8px' }} className="mono">v{k.version}</td>
                  <td style={{ padding: '8px 8px' }} className="mono">{k.key_prefix}</td>
                  <td style={{ padding: '8px 8px' }}><StatusChip status={k.status} graceExpiresAt={k.grace_expires_at} /></td>
                  <td style={{ padding: '8px 8px', color: 'var(--fg-tertiary)' }}>
                    {k.created_at ? new Date(k.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                    {confirmRevoke === k.id ? (
                      <span style={{ display: 'inline-flex', gap: 6 }}>
                        <button className="btn btn-danger" style={{ fontSize: 11, padding: '2px 8px' }} disabled={busy} onClick={() => handleRevoke(k.id)}>Revoke</button>
                        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => setConfirmRevoke(null)}>Cancel</button>
                      </span>
                    ) : confirmDelete === k.id ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, color: 'var(--warn)' }}>Delete permanently?</span>
                        <button className="btn btn-danger" style={{ fontSize: 11, padding: '2px 8px' }} disabled={busy} onClick={() => handleDelete(k.id)}>Delete</button>
                        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => setConfirmDelete(null)}>Cancel</button>
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {k.status !== 'revoked' && (
                          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--danger)' }}
                            disabled={busy} onClick={() => { setConfirmDelete(null); setConfirmRevoke(k.id) }}>
                            Revoke
                          </button>
                        )}
                        <button className="icon-btn" title="Delete permanently" disabled={busy}
                          style={{ color: 'var(--danger)' }}
                          onClick={() => { setConfirmRevoke(null); setConfirmDelete(k.id) }}>
                          <Trash w={13} />
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Drawer>
  )
}
