import React from 'react'
import { Plus, AlertTri } from '../../components/ui/Icons'
import type { App } from '../../types'

import type { AiProvider } from '../../api/providers'
import { createApp, updateApp, flushAppCache } from '../../api/apps'
import { createApiKey } from '../../api/apikeys'
import { getUsers, type UIUser } from '../../api/users'
import { getOrganizations, type UIOrg } from '../../api/organizations'
import { useAuth } from '../../context/AuthContext'
import { Field, Drawer, FormModal } from '../../components/ui'
import { ProviderSelect, ROTATION_POLICIES } from './AppsShared'

// ── Mode help modal ───────────────────────────────────────────────────────────

function ModeHelpModal({ onClose }: { onClose: () => void }) {
  const modes = [
    {
      key: 'guard',
      label: 'Guard',
      icon: '🛡️',
      desc: 'Full protection. Analyses every prompt and response, classifies threats, and blocks requests that exceed the policy thresholds. This is the recommended default for production traffic.',
    },
    {
      key: 'monitor',
      label: 'Monitor',
      icon: '👁️',
      desc: 'Observe-only. Analyses and classifies every request exactly like Guard, but never blocks — all traffic passes through regardless of threat score. Use this to evaluate policies before enforcing them.',
    },
    {
      key: 'bypass',
      label: 'Bypass',
      icon: '⚡',
      desc: 'Logging only. Skips all prompt analysis and policy checks; requests are forwarded immediately. Only basic request metadata is logged. Use for trusted internal tooling where latency is critical.',
    },
    {
      key: 'soft',
      label: 'Soft',
      icon: '🛡️',
      desc: 'Analyses every prompt exactly like Guard, but on a policy hit it returns a polite, AI-written decline instead of a hard error — and never forwards the unsafe prompt.',
    },
  ]
  return (
    <Drawer
      open
      title="Gateway mode"
      onClose={onClose}
      width={480}
      zIndex={220}
      footer={
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {modes.map(m => (
          <div key={m.key} style={{
            padding: '12px 14px', borderRadius: 8,
            background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 16 }}>{m.icon}</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{m.label}</span>
              <code style={{ fontSize: 10, color: 'var(--fg-tertiary)', background: 'var(--bg-page)', padding: '1px 5px', borderRadius: 4, fontFamily: 'monospace' }}>{m.key}</code>
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-secondary)', lineHeight: 1.55 }}>{m.desc}</div>
          </div>
        ))}
      </div>
    </Drawer>
  )
}

export { ConfirmModal } from '../../components/ui'

// ── Generate key modal (app-scoped) ───────────────────────────────────────────

export function KeyGenModal({ appId, appName, onClose, onCreated }: {
  appId: string; appName: string
  onClose: () => void
  onCreated: (fullKey: string, keyName: string) => void
}) {
  const [form, setForm] = React.useState({
    name: '', rotation_policy: 'auto · 90d',
  })
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs['name'] = 'Required'
    if (Object.keys(errs).length) { setErrors(errs); return }
    setBusy(true)
    try {
      const { full_key } = await createApiKey({
        name: form.name.trim(), app_id: appId,
        rotation_policy: form.rotation_policy,
      })
      onCreated(full_key, form.name.trim())
    } catch (err) {
      setErrors({ name: (err as Error).message || 'Failed to create key' })
    } finally { setBusy(false) }
  }

  return (
    <FormModal
      open
      title="Generate API key"
      busy={busy}
      busyLabel="Generating…"
      submitLabel="Generate key"
      onSubmit={handleSubmit}
      onClose={onClose}
      width={500}
      top="6vh"
    >
      <div style={{ padding: '8px 12px', borderRadius: 6, marginBottom: 14, background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', fontSize: 12, color: 'var(--fg-secondary)' }}>
        <span className="label">App: </span>{appName}
      </div>
      <Field label="Key name *" hint="A descriptive label for this key" error={errors['name']}>
        <input className="input" style={{ width: '100%', boxSizing: 'border-box' }} value={form.name}
          onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setErrors(er => ({ ...er, name: '' })) }}
          placeholder="e.g. Production key" autoFocus />
      </Field>
      <Field label="Rotation policy">
        <select className="select" style={{ width: '100%', boxSizing: 'border-box' }} value={form.rotation_policy}
          onChange={e => setForm(f => ({ ...f, rotation_policy: e.target.value }))}>
          {ROTATION_POLICIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </Field>
    </FormModal>
  )
}

// ── App form drawer (create / edit) ───────────────────────────────────────────

export function AppFormDrawer({ initialApp, open, upstreamProviders, defaultProviderId, onClose, onSave }: {
  initialApp?: App
  open?: boolean
  upstreamProviders: AiProvider[]
  defaultProviderId: string | null
  onClose: () => void
  onSave?: () => void
}) {
  const isEdit = !!initialApp
  const { user: currentUser, isAdmin } = useAuth()
  const [users, setUsers] = React.useState<UIUser[]>([])
  const [orgs, setOrgs] = React.useState<UIOrg[]>([])

  React.useEffect(() => { getUsers().then(setUsers).catch(() => {}) }, [])
  React.useEffect(() => { if (isAdmin) getOrganizations().then(setOrgs).catch(() => {}) }, [isAdmin])

  const [form, setForm] = React.useState({
    id: initialApp?.id ?? '',
    name: '', team: '', env: 'production' as 'production' | 'development' | 'qa',
    status: 'enable' as 'enable' | 'disable',
    mode: 'guard' as 'soft' | 'monitor' | 'guard' | 'bypass',
    ownerId: (initialApp?.ownerId ?? currentUser?.id ?? null) as string | null,
    orgId: initialApp?.orgId ?? null,
    maxTokens: initialApp?.maxTokens ?? null,
    maxPayloadSize: initialApp?.maxPayloadSize ?? null,
    primaryProviderId: initialApp?.primaryProviderId ?? defaultProviderId,
    backup1ProviderId: initialApp?.backup1ProviderId ?? null,
    backup2ProviderId: initialApp?.backup2ProviderId ?? null,
    enableT2: initialApp?.enableT2 ?? true,
    enableKnowledgeDev: initialApp?.enableKnowledgeDev ?? true,
    enableContentQualityScan: initialApp?.enableContentQualityScan ?? false,
    contentQualityScanMode: (initialApp?.contentQualityScanMode ?? 'flag') as 'block' | 'redact' | 'flag' | 'monitor',
    contentQualityScanThreshold: initialApp?.contentQualityScanThreshold ?? null,
    enableResponseCache: initialApp?.enableResponseCache ?? false,
    cacheTtlSeconds: initialApp?.cacheTtlSeconds ?? null,
    multiTurnSemanticEnabled: initialApp?.multiTurnSemanticEnabled ?? false,
    quotaMode: (initialApp?.quotaMode ?? 'unlimited') as 'unlimited' | 'fixed' | 'monthly',
    quotaLimit: (initialApp?.quotaLimit ?? null) as number | null,
    quotaWarningLimit: (initialApp?.quotaWarningLimit ?? null) as number | null,
    quotaEnforcement: (initialApp?.quotaEnforcement ?? 'hard') as 'hard' | 'soft',
    quotaResetDay: (initialApp?.quotaResetDay ?? 1) as number,
  })
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState(false)
  const [cacheFlushBusy, setCacheFlushBusy] = React.useState(false)
  const [cacheFlushMsg, setCacheFlushMsg] = React.useState<string | null>(null)

  async function handleFlushCache() {
    setCacheFlushBusy(true)
    setCacheFlushMsg(null)
    try {
      const result = await flushAppCache(form.id)
      setCacheFlushMsg(
        result.gatewaysFailed > 0
          ? `Flushed on ${result.gatewaysFlushed} gateway(s), failed on ${result.gatewaysFailed}`
          : `Cache flushed on ${result.gatewaysFlushed} gateway(s)`
      )
    } catch (err) {
      setCacheFlushMsg((err as Error).message || 'Failed to flush cache')
    } finally {
      setCacheFlushBusy(false)
    }
  }
  const [showModeHelp, setShowModeHelp] = React.useState(false)

  React.useEffect(() => {
    if (initialApp) {
      setForm(f => ({
        ...f,
        id: initialApp.id,
        name: initialApp.name,
        team: initialApp.team ?? '',
        env: initialApp.env as 'production' | 'development' | 'qa',
        status: (initialApp.status ?? 'enable') as 'enable' | 'disable',
        mode: (initialApp.mode ?? 'guard') as 'soft' | 'monitor' | 'guard' | 'bypass',
        ownerId: initialApp.ownerId ?? null,
        orgId: initialApp.orgId ?? null,
        maxTokens: initialApp.maxTokens ?? null,
        maxPayloadSize: initialApp.maxPayloadSize ?? null,
        primaryProviderId: initialApp.primaryProviderId ?? defaultProviderId,
        backup1ProviderId: (initialApp.backup1ProviderId as string | null) ?? null,
        backup2ProviderId: (initialApp.backup2ProviderId as string | null) ?? null,
        enableT2: initialApp.enableT2 ?? false,
        enableKnowledgeDev: initialApp.enableKnowledgeDev ?? false,
        enableContentQualityScan: initialApp.enableContentQualityScan ?? false,
        contentQualityScanMode: (initialApp.contentQualityScanMode ?? 'flag') as 'block' | 'redact' | 'flag' | 'monitor',
        contentQualityScanThreshold: initialApp.contentQualityScanThreshold ?? null,
        enableResponseCache: initialApp.enableResponseCache ?? false,
        cacheTtlSeconds: initialApp.cacheTtlSeconds ?? null,
        multiTurnSemanticEnabled: initialApp.multiTurnSemanticEnabled ?? false,
        quotaMode: (initialApp.quotaMode ?? 'unlimited') as 'unlimited' | 'fixed' | 'monthly',
        quotaLimit: initialApp.quotaLimit ?? null,
        quotaWarningLimit: initialApp.quotaWarningLimit ?? null,
        quotaEnforcement: (initialApp.quotaEnforcement ?? 'hard') as 'hard' | 'soft',
        quotaResetDay: initialApp.quotaResetDay ?? 1,
      }))
    }
  }, [initialApp, defaultProviderId])

  function setField(k: string, v: string | null) {
    setForm(f => {
      const next = { ...f, [k]: v }
      if (k === 'primaryProviderId' && !v) { next.backup1ProviderId = null; next.backup2ProviderId = null }
      if (k === 'backup1ProviderId' && !v) { next.backup2ProviderId = null }
      return next
    })
    setErrors(e => ({ ...e, [k]: '' }))
  }

  function available(current: string | null, exclude: (string | null)[]) {
    const excl = new Set(exclude.filter(Boolean) as string[])
    if (current) excl.delete(current)
    return upstreamProviders.filter(p => !excl.has(p.id))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs['name'] = 'Required'
    if (!form.env)         errs['env']  = 'Required'
    if (form.quotaMode !== 'unlimited') {
      if (form.quotaLimit === null || !Number.isFinite(form.quotaLimit) || form.quotaLimit <= 0) {
        errs['quotaLimit'] = 'Enter a positive limit'
      }
      if (form.quotaWarningLimit !== null && form.quotaLimit !== null && form.quotaWarningLimit >= form.quotaLimit) {
        errs['quotaWarningLimit'] = 'Must be below the limit'
      }
    }
    if (Object.keys(errs).length) { setErrors(errs); return }
    setBusy(true)
    try {
      const providerPayload = {
        primary_provider_id: form.primaryProviderId,
        backup1_provider_id: form.backup1ProviderId,
        backup2_provider_id: form.backup2ProviderId,
      }
      const quotaPayload = form.quotaMode === 'unlimited'
        ? { quota_mode: 'unlimited' as const }
        : {
            quota_mode: form.quotaMode,
            quota_limit: form.quotaLimit,
            quota_warning_limit: form.quotaWarningLimit,
            quota_enforcement: form.quotaEnforcement,
            quota_reset_day: form.quotaMode === 'monthly' ? form.quotaResetDay : null,
          }
      if (isEdit) {
        await updateApp(form.id, {
          name: form.name.trim(), team: form.team.trim() || undefined,
          env: form.env, status: form.status, mode: form.mode,
          owner_id: form.ownerId,
          org_id: form.orgId,
          max_tokens: form.maxTokens,
          max_payload_size: form.maxPayloadSize,
          enable_t2: form.enableT2,
          enable_knowledge_dev: form.enableKnowledgeDev,
          enable_content_quality_scan: form.enableContentQualityScan,
          content_quality_scan_mode: form.enableContentQualityScan ? form.contentQualityScanMode : null,
          content_quality_scan_threshold: form.enableContentQualityScan ? form.contentQualityScanThreshold : null,
          enable_response_cache: form.enableResponseCache,
          cache_ttl_seconds: form.cacheTtlSeconds,
          multi_turn_semantic_enabled: form.multiTurnSemanticEnabled,
          ...providerPayload,
          ...quotaPayload,
        })
      } else {
        await createApp({
          name: form.name.trim(),
          team: form.team.trim() || undefined, env: form.env, status: form.status, mode: form.mode,
          owner_id: form.ownerId,
          org_id: form.orgId,
          max_tokens: form.maxTokens,
          max_payload_size: form.maxPayloadSize,
          enable_t2: form.enableT2,
          enable_knowledge_dev: form.enableKnowledgeDev,
          enable_content_quality_scan: form.enableContentQualityScan,
          content_quality_scan_mode: form.enableContentQualityScan ? form.contentQualityScanMode : null,
          content_quality_scan_threshold: form.enableContentQualityScan ? form.contentQualityScanThreshold : null,
          enable_response_cache: form.enableResponseCache,
          cache_ttl_seconds: form.cacheTtlSeconds,
          multi_turn_semantic_enabled: form.multiTurnSemanticEnabled,
          ...providerPayload,
          ...quotaPayload,
        })
      }
    } catch (err) {
      setErrors({ name: (err as Error).message || 'Operation failed' })
    } finally { setBusy(false); onSave?.(); onClose() }
  }

  return (
    <Drawer
      open={open}
      title={
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plus w={14} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>{isEdit ? initialApp!.name : 'New AI app'}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 2 }}>
            {isEdit ? 'Edit application' : 'Create a new AI app'}
          </div>
        </>
      }
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <div style={{ flex: 1 }} />
          <button type="submit" form="app-form" className="btn btn-primary" disabled={busy}>
            {busy ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save changes' : 'Create app'}
          </button>
        </>
      }
    >
      <form id="app-form" onSubmit={handleSubmit} style={{ padding: '16px 20px' }}>
        <Field label="App name *" error={errors['name']}>
          <input className="input" style={{ width: '100%', boxSizing: 'border-box' }} value={form.name}
            onChange={e => setField('name', e.target.value)}
            placeholder="e.g. Customer Support Bot" autoFocus={!isEdit} />
        </Field>

        <Field label="Team" error={errors['team']}>
          <input className="input" style={{ width: '100%', boxSizing: 'border-box' }} value={form.team}
            onChange={e => setField('team', e.target.value)}
            placeholder="e.g. Platform, AI/ML, Support" />
        </Field>

        <Field label="Owner" hint="The owner can manage who else has access to this app from its Permissions tab.">
          <select className="select" style={{ width: '100%', boxSizing: 'border-box' }} value={form.ownerId ?? ''}
            onChange={e => setField('ownerId', e.target.value || null)}>
            <option value="">— unassigned —</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.displayName} ({u.email})</option>
            ))}
          </select>
        </Field>

        {isAdmin && (
          <Field label="Organization">
            <select className="select" style={{ width: '100%', boxSizing: 'border-box' }} value={form.orgId ?? ''}
              onChange={e => setField('orgId', e.target.value || null)}>
              <option value="">— none —</option>
              {orgs.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Environment *" error={errors['env']}>
          <select className="select" style={{ width: '100%', boxSizing: 'border-box' }} value={form.env}
            onChange={e => setField('env', e.target.value)}>
            <option value="production">Production</option>
            <option value="development">Development</option>
            <option value="qa">QA</option>
          </select>
        </Field>

        <Field label="Status">
          <select className="select" style={{ width: '100%', boxSizing: 'border-box' }} value={form.status}
            onChange={e => setField('status', e.target.value)}>
            <option value="enable">Enable</option>
            <option value="disable">Disable</option>
          </select>
        </Field>

        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <label className="label">Mode</label>
            <button type="button" className="icon-btn" title="What do these modes do?" onClick={() => setShowModeHelp(true)}
              style={{ width: 16, height: 16, borderRadius: '50%', fontSize: 0, fontWeight: 700, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', cursor: 'pointer', color: 'var(--fg-secondary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0, flexShrink: 0 }}>
              ?
            </button>
          </div>
          <select className="select" style={{ width: '100%', boxSizing: 'border-box' }} value={form.mode}
            onChange={e => setField('mode', e.target.value)}>
            <option value="guard">Guard — analyse and block threats</option>
            <option value="soft">Soft — polite AI decline instead of hard block</option>
            <option value="monitor">Monitor — analyse only, never block</option>
            <option value="bypass">Bypass — log only, skip analysis</option>
          </select>
        </div>

        <Field
          label="T2 Intent Analysis"
          hint="Runs a second LLM pass to detect manipulation and jailbreak intent when T1 finds nothing. Adds ~1–3 s latency per allowed request. Has no effect when mode is Bypass."
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.enableT2}
              onChange={e => setForm(f => ({ ...f, enableT2: e.target.checked }))}
              disabled={form.mode === 'bypass'}
            />
            <span style={{ fontSize: 13, color: form.mode === 'bypass' ? 'var(--fg-tertiary)' : undefined }}>
              Enable Tier-2 intent scanning for this app
            </span>
          </label>
        </Field>

        <Field
          label="Knowledge Developer"
          hint="When T2 detects a novel attack, automatically generates a new threat knowledge entry (pending admin review). Requires T2 to be enabled."
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.enableKnowledgeDev}
              onChange={e => setForm(f => ({ ...f, enableKnowledgeDev: e.target.checked }))}
              disabled={!form.enableT2 || form.mode === 'bypass'}
            />
            <span style={{ fontSize: 13, color: (!form.enableT2 || form.mode === 'bypass') ? 'var(--fg-tertiary)' : undefined }}>
              Enable automatic threat knowledge creation
            </span>
          </label>
        </Field>

        <Field
          label="Content Quality Scan"
          hint="Scores the AI's response for groundedness/relevance against the prompt via the configured Content Quality Provider (TruLens by default), after security scanning has already cleared. Requires a Content Quality Provider to be configured under Providers → Content Quality Provider."
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: form.enableContentQualityScan && form.mode !== 'bypass' ? 10 : 0 }}>
            <input
              type="checkbox"
              checked={form.enableContentQualityScan}
              onChange={e => setForm(f => ({ ...f, enableContentQualityScan: e.target.checked }))}
              disabled={form.mode === 'bypass'}
            />
            <span style={{ fontSize: 13, color: form.mode === 'bypass' ? 'var(--fg-tertiary)' : undefined }}>
              Enable content quality scanning for this app
            </span>
          </label>
          {form.enableContentQualityScan && form.mode !== 'bypass' && (<>
            <div style={{ fontSize: 11, color: 'var(--fg-warning, #b8860b)', marginBottom: 8, lineHeight: 1.4 }}>
              Content quality (TruLens) is designed for RAG / QA fact-verification use cases.
              It may produce inaccurate scores for translation, creative writing, or other
              generative tasks.
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="label" style={{ display: 'block', marginBottom: 4, fontSize: 11 }}>Mode</label>
                <select className="select" style={{ width: '100%', boxSizing: 'border-box' }}
                  value={form.contentQualityScanMode}
                  onChange={e => setForm(f => ({ ...f, contentQualityScanMode: e.target.value as typeof f.contentQualityScanMode }))}>
                  <option value="flag">Flag — scans in background, no added latency</option>
                  <option value="monitor">Monitor — scans in background, no added latency</option>
                  <option value="redact">Redact — holds response until scan completes</option>
                  <option value="block">Block — holds response until scan completes</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="label" style={{ display: 'block', marginBottom: 4, fontSize: 11 }}>Threshold (blank = global default)</label>
                <input className="input" type="number" step="0.01" min={0} max={1}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={form.contentQualityScanThreshold ?? ''}
                  onChange={e => setForm(f => ({ ...f, contentQualityScanThreshold: e.target.value === '' ? null : Number(e.target.value) }))}
                  placeholder="e.g. 0.7" />
              </div>
            </div>
          </>)}
        </Field>

        <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 4, marginBottom: 8, paddingTop: 14 }}>
          <div className="label-strong" style={{ fontSize: 12, marginBottom: 12 }}>Response caching</div>

          <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-start',
            padding: '9px 12px', borderRadius: 6, marginBottom: 12,
            background: 'var(--warning-bg, rgba(250,180,0,0.1))', border: '1px solid var(--warning, #FAB400)',
          }}>
            <AlertTri w={13} style={{ color: 'var(--warning, #FAB400)', flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 11, color: 'var(--fg-primary)', lineHeight: 1.5 }}>
              <strong>Security note:</strong> caching is scoped to this app's API key, not per end-user — any caller using this app's key can receive another caller's cached response if their request matches.
              Only enable for <strong>public or non-personalized, repeated-question</strong> traffic (FAQ/docs bots). Avoid for apps returning personalized or sensitive per-user data.
            </div>
          </div>

          <Field
            label="Enable Response Caching"
            hint="Cache responses for repeated prompts to reduce latency and cost."
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.enableResponseCache}
                onChange={e => setForm(f => ({ ...f, enableResponseCache: e.target.checked, multiTurnSemanticEnabled: !e.target.checked ? false : f.multiTurnSemanticEnabled }))}
              />
              <span style={{ fontSize: 13 }}>
                Enable response caching
              </span>
            </label>
          </Field>

          {form.enableResponseCache && (
            <>
              <Field label="Cache TTL (seconds)" error={errors['cacheTtlSeconds']}
                hint="Override default TTL. Leave empty to use system default (300s). Max 900s.">
                <input className="input" type="number" min="1" max="900" style={{ width: '100%', boxSizing: 'border-box' }}
                  value={form.cacheTtlSeconds ?? ''}
                  onChange={e => { setForm(f => ({ ...f, cacheTtlSeconds: e.target.value === '' ? null : Math.floor(Number(e.target.value)) })); setErrors(er => ({ ...er, cacheTtlSeconds: '' })) }}
                  placeholder="Leave empty for default (300s)" />
              </Field>

              <Field
                label="Multi-Turn Semantic Caching"
                hint="Enable semantic matching on latest user message for multi-turn conversations. Requires a unique user ID field on every request — without it, this cannot safely tell your end-users apart, and a mismatched or missing ID means the match is skipped for safety, not served incorrectly."
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.multiTurnSemanticEnabled}
                    onChange={e => setForm(f => ({ ...f, multiTurnSemanticEnabled: e.target.checked }))}
                  />
                  <span style={{ fontSize: 13 }}>
                    Enable multi-turn semantic caching
                  </span>
                </label>
              </Field>

              {isEdit && (
                <Field label="Force cache expiry" hint="Immediately clears this app's cached responses on every gateway instance (L1 + L2).">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={cacheFlushBusy} onClick={handleFlushCache}>
                      {cacheFlushBusy ? 'Flushing…' : 'Clear cache now'}
                    </button>
                    {cacheFlushMsg && <span style={{ fontSize: 12, color: 'var(--fg-secondary)' }}>{cacheFlushMsg}</span>}
                  </div>
                </Field>
              )}
            </>
          )}
        </div>

        <Field label="Max input tokens" error={errors['maxTokens']}>
          <input className="input" type="number" min="0" style={{ width: '100%', boxSizing: 'border-box' }} value={form.maxTokens ?? ''}
onChange={e => setField('maxTokens', e.target.valueAsNumber !== null ? String(e.target.valueAsNumber) : null)}
            placeholder="Leave blank for no limit" />
          <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 4 }}>
            Leave blank for no limit. Set a value to reject oversized prompts before scanning.
          </div>
        </Field>

        <Field label="Max payload size (bytes)" error={errors['maxPayloadSize']}>
          <input className="input" type="number" min="0" style={{ width: '100%', boxSizing: 'border-box' }} value={form.maxPayloadSize ?? ''}
            onChange={e => setField('maxPayloadSize', e.target.valueAsNumber !== null ? String(e.target.valueAsNumber) : null)}
            placeholder="Leave blank for no limit" />
          <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 4 }}>
            Leave blank for no limit. Set a value to reject oversized payloads before forwarding (in bytes).
          </div>
        </Field>

        <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 4, marginBottom: 8, paddingTop: 14 }}>
          <div className="label-strong" style={{ fontSize: 12, marginBottom: 12 }}>Usage quota</div>
          <Field
            label="Quota mode"
            hint="Cap successful upstream requests per app. Counts only requests forwarded to the provider that returned 2xx."
          >
            <select className="select" style={{ width: '100%', boxSizing: 'border-box' }} value={form.quotaMode}
              onChange={e => setForm(f => ({ ...f, quotaMode: e.target.value as 'unlimited' | 'fixed' | 'monthly' }))}>
              <option value="unlimited">Unlimited — no quota</option>
              <option value="fixed">Fixed total — lifetime cap</option>
              <option value="monthly">Monthly — resets each month</option>
            </select>
          </Field>

          {form.quotaMode !== 'unlimited' && (
            <>
              <Field label="Limit (successful requests)" error={errors['quotaLimit']}>
                <input className="input" type="number" min="1" style={{ width: '100%', boxSizing: 'border-box' }}
                  value={form.quotaLimit ?? ''}
                  onChange={e => { setForm(f => ({ ...f, quotaLimit: e.target.value === '' ? null : Math.floor(Number(e.target.value)) })); setErrors(er => ({ ...er, quotaLimit: '' })) }}
                  placeholder="e.g. 10000" />
              </Field>

              <Field label="Warn at (optional)" error={errors['quotaWarningLimit']}
                hint="Show a warning badge once usage reaches this count. Does not block.">
                <input className="input" type="number" min="1" style={{ width: '100%', boxSizing: 'border-box' }}
                  value={form.quotaWarningLimit ?? ''}
                  onChange={e => { setForm(f => ({ ...f, quotaWarningLimit: e.target.value === '' ? null : Math.floor(Number(e.target.value)) })); setErrors(er => ({ ...er, quotaWarningLimit: '' })) }}
                  placeholder="e.g. 8000" />
              </Field>

              <Field label="Enforcement"
                hint="Hard blocks with HTTP 429 at the limit. Allow-over keeps forwarding and only flags the app.">
                <select className="select" style={{ width: '100%', boxSizing: 'border-box' }} value={form.quotaEnforcement}
                  onChange={e => setForm(f => ({ ...f, quotaEnforcement: e.target.value as 'hard' | 'soft' }))}>
                  <option value="hard">Hard — block at the limit (429)</option>
                  <option value="soft">Allow over — forward, just flag</option>
                </select>
              </Field>

              {form.quotaMode === 'monthly' && (
                <Field label="Reset day (day of month)" hint="Day 1–28 the monthly counter resets at 00:00 UTC.">
                  <select className="select" style={{ width: '100%', boxSizing: 'border-box' }} value={form.quotaResetDay}
                    onChange={e => setForm(f => ({ ...f, quotaResetDay: Number(e.target.value) }))}>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </Field>
              )}
            </>
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 4, marginBottom: 8, paddingTop: 14 }}>
          <div className="label-strong" style={{ fontSize: 12, marginBottom: 12 }}>Upstream provider routing</div>
          {upstreamProviders.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', padding: '10px 0' }}>
              No upstream providers assigned yet. Configure them on the <strong>Upstream Providers</strong> page.
            </div>
          ) : (
            <>
              <ProviderSelect
                label="Primary provider"
                hint="Main LLM endpoint for this app. Pre-filled from the upstream default."
                value={form.primaryProviderId}
                options={available(form.primaryProviderId, [form.backup1ProviderId, form.backup2ProviderId])}
                onChange={v => setField('primaryProviderId', v)}
              />
              <ProviderSelect
                label="Backup 1 (optional)"
                hint="Failover if primary is unavailable"
                value={form.backup1ProviderId}
                options={available(form.backup1ProviderId, [form.primaryProviderId, form.backup2ProviderId])}
                onChange={v => setField('backup1ProviderId', v)}
                disabled={!form.primaryProviderId}
              />
              <ProviderSelect
                label="Backup 2 (optional)"
                hint="Second failover"
                value={form.backup2ProviderId}
                options={available(form.backup2ProviderId, [form.primaryProviderId, form.backup1ProviderId])}
                onChange={v => setField('backup2ProviderId', v)}
                disabled={!form.backup1ProviderId}
              />
            </>
          )}
        </div>

        {showModeHelp && <ModeHelpModal onClose={() => setShowModeHelp(false)} />}
      </form>
    </Drawer>
  )
}
