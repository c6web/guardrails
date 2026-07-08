import React from 'react'
import { getResponseCacheConfig, updateResponseCacheConfig, flushResponseCache, type ResponseCacheConfig } from '../api/responseCacheConfig'
import { Check, Settings, Trash2, AlertTri } from '../components/ui/Icons'
import { PageHeader, Breadcrumbs, LoadingState } from '../components/ui'
import { Toast } from './components/ProviderShared'
import type { TweakValues } from '../types'

interface ResponseCacheSettingsPageProps { tweaks: TweakValues }

const ResponseCacheSettingsPage: React.FC<ResponseCacheSettingsPageProps> = () => {
  const [config, setConfig] = React.useState<ResponseCacheConfig | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [flushBusy, setFlushBusy] = React.useState(false)
  const [flushConfirm, setFlushConfirm] = React.useState(false)
  const [toast, setToast] = React.useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)

  const savedRef = React.useRef<ResponseCacheConfig | null>(null)
  const [edit, setEdit] = React.useState<ResponseCacheConfig>({
    enabled: false, exact_match_enabled: false,
    semantic_match_enabled: false, semantic_threshold: 0.7,
  })

  function hasChanges(): boolean {
    const saved = savedRef.current
    if (!saved || !config) return false
    return (
      edit.enabled !== saved.enabled ||
      edit.exact_match_enabled !== saved.exact_match_enabled ||
      edit.semantic_match_enabled !== saved.semantic_match_enabled ||
      edit.semantic_threshold !== saved.semantic_threshold
    )
  }

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const c = await getResponseCacheConfig()
      savedRef.current = c
      setConfig(c)
      setEdit({ ...c })
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to load response cache settings', kind: 'err' })
    } finally { setLoading(false) }
  }, [])

  React.useEffect(() => { load() }, [load])

  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  async function handleSave() {
    if (!config) return
    setBusy(true)
    try {
      await updateResponseCacheConfig(edit)
      const updated = await getResponseCacheConfig()
      savedRef.current = updated
      setConfig(updated)
      setEdit({ ...updated })
      setToast({ msg: 'Response cache settings saved', kind: 'ok' })
    } catch (err) {
      if (savedRef.current && config) {
        setConfig(savedRef.current)
        setEdit({ ...savedRef.current })
      }
      setToast({ msg: `${(err as Error).message || 'Failed to save'} — changes were not saved`, kind: 'err' })
    } finally { setBusy(false) }
  }

  async function handleFlush() {
    setFlushConfirm(false)
    setFlushBusy(true)
    try {
      const result = await flushResponseCache()
      setToast({
        msg: result.gatewaysFailed > 0
          ? `Flushed on ${result.gatewaysFlushed} gateway(s), failed on ${result.gatewaysFailed}`
          : `Cache flushed on ${result.gatewaysFlushed} gateway(s)`,
        kind: result.gatewaysFailed > 0 ? 'err' : 'ok',
      })
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to flush cache', kind: 'err' })
    } finally { setFlushBusy(false) }
  }

  function setBool(k: 'enabled' | 'exact_match_enabled' | 'semantic_match_enabled', v: boolean) {
    setEdit(prev => {
      const next = { ...prev, [k]: v }
      if (k === 'enabled' && !v) {
        next.exact_match_enabled = false
        next.semantic_match_enabled = false
      }
      if (k === 'semantic_match_enabled' && !v) {
        next.semantic_threshold = prev.semantic_threshold
      }
      return next
    })
  }

  const dirty = hasChanges()

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="response-cache" />
      <PageHeader title="Response Cache" subtitle="Cache AI responses to reduce latency and provider costs. Exact matches are served instantly; semantic matching groups similar prompts to the same cached response."
        actions={config && <button className="btn btn-primary" onClick={handleSave} disabled={busy || !dirty}><Check w={13} /> Save</button>} />

      <div style={{
        display: 'flex', gap: 10, alignItems: 'flex-start',
        padding: '10px 14px', borderRadius: 6, marginBottom: 16,
        background: 'var(--warning-bg, rgba(250,180,0,0.1))', border: '1px solid var(--warning, #FAB400)',
      }}>
        <AlertTri w={14} style={{ color: 'var(--warning, #FAB400)', flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: 'var(--fg-primary)', lineHeight: 1.5 }}>
          <strong>Security consideration:</strong> the cache is scoped per app (API key), not per end-user — this gateway sees one API key shared across all of an app's users, not individual user sessions.
          A cached response is served to <em>any</em> caller of the same app whose request matches, regardless of who originally triggered it.
          Only enable this for apps whose traffic is <strong>public or non-personalized and genuinely repeats</strong> (e.g. FAQ/documentation bots, static reference answers).
          Do not enable it for apps that return personalized, private, or per-user sensitive data (account details, personal records, etc.) unless you fully understand and accept this scope.
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : config ? (
        <>
          <div className="card">
            <div style={{ padding: '16px 20px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Settings w={15} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>Cache settings</span>
              </div>

              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <span style={{ fontSize: 14 }}>Enable response cache</span>
                  <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2 }}>Master switch — when off, all caching is disabled</div>
                </div>
                <label className="toggle">
                  <input type="checkbox" checked={edit.enabled} onChange={(e) => setBool('enabled', e.target.checked)} />
                  <span className="slider" />
                </label>
              </div>

              {edit.enabled && (
                <>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                      <span style={{ fontSize: 14 }}>Exact match</span>
                      <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2 }}>Return cached response when an identical prompt is received</div>
                    </div>
                    <label className="toggle">
                      <input type="checkbox" checked={edit.exact_match_enabled} onChange={(e) => setBool('exact_match_enabled', e.target.checked)} />
                      <span className="slider" />
                    </label>
                  </div>

                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                      <span style={{ fontSize: 14 }}>Semantic match</span>
                      <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2 }}>Return cached response for semantically similar prompts</div>
                    </div>
                    <label className="toggle">
                      <input type="checkbox" checked={edit.semantic_match_enabled} onChange={(e) => setBool('semantic_match_enabled', e.target.checked)} />
                      <span className="slider" />
                    </label>
                  </div>

                  {edit.semantic_match_enabled && (
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                      <div>
                        <span style={{ fontSize: 14 }}>Semantic threshold</span>
                        <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2 }}>Similarity score required (0.0 = any, 1.0 = exact only)</div>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        value={edit.semantic_threshold}
                        onChange={(e) => setEdit({ ...edit, semantic_threshold: Math.min(1, Math.max(0, Number(e.target.value) || 0)) })}
                        className="input"
                        style={{ width: 80, textAlign: 'right', background: 'var(--bg-sunken)' }}
                      />
                    </div>
                  )}
                </>
              )}

              {dirty && (
                <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--bg-sunken)', borderRadius: 6, fontSize: 12, color: 'var(--fg-secondary)' }}>
                  Unsaved changes — click Save to apply them.
                </div>
              )}
            </div>
          </div>

          <button className="btn btn-primary" onClick={handleSave} disabled={busy || !dirty} style={{ marginTop: 8 }}>
            <Check w={13} /> Save changes
          </button>

          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ padding: '16px 20px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Trash2 w={15} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>Force cache expiry</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginBottom: 14 }}>
                Immediately deletes every cached response across all apps, on every gateway instance (L1 in-memory + L2 database) — instead of waiting for TTL expiry.
              </div>
              {flushConfirm ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13 }}>Flush the entire response cache now?</span>
                  <button className="btn btn-danger btn-sm" disabled={flushBusy} onClick={handleFlush}>
                    {flushBusy ? 'Flushing…' : 'Yes, flush all'}
                  </button>
                  <button className="btn btn-ghost btn-sm" disabled={flushBusy} onClick={() => setFlushConfirm(false)}>Cancel</button>
                </div>
              ) : (
                <button className="btn btn-secondary btn-sm" onClick={() => setFlushConfirm(true)}>
                  <Trash2 w={13} /> Flush all cached responses
                </button>
              )}
            </div>
          </div>
        </>
      ) : null}

      {toast && <Toast msg={toast.msg} kind={toast.kind} />}
    </div>
  )
}

export default ResponseCacheSettingsPage
