import React from 'react'
import { Check, AlertTri } from '../components/ui/Icons'
import { PageHeader, Breadcrumbs, LoadingState } from '../components/ui'
import { getReviewConfig, updateReviewConfig, type ReviewConfig } from '../api/reviewConfig'
import { getAiProviders, type AiProvider } from '../api/aiProviders'

export default function DataReviewProviderPage() {
  const [config, setConfig] = React.useState<ReviewConfig | null>(null)
  const [providers, setProviders] = React.useState<AiProvider[]>([])
  const [selectedId, setSelectedId] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [toast, setToast] = React.useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)

  React.useEffect(() => {
    Promise.all([
      getReviewConfig(),
      getAiProviders(),
    ]).then(([cfg, prov]) => {
      setConfig(cfg)
      setProviders(prov)
      setSelectedId(cfg.provider_id ?? '')
    }).catch(() => {
      setToast({ msg: 'Failed to load', kind: 'err' })
    }).finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  async function handleSave() {
    setSaving(true)
    try {
      const cfg = await updateReviewConfig(selectedId || null)
      setConfig(cfg)
      setToast({ msg: 'Review provider updated', kind: 'ok' })
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to save', kind: 'err' })
    } finally {
      setSaving(false)
    }
  }

  const selectedProvider = providers.find(p => p.id === selectedId)

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="data-review-provider" />
      <PageHeader title="Data Review Provider" subtitle="Choose which AI provider is used for quality reviews of threat knowledge entries, detector rules, tool guardrails, and T2 agent prompts." />

      {loading ? (
        <LoadingState />
      ) : (
        <div className="card" style={{ maxWidth: 600 }}>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Current status */}
            {config?.provider ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 6, background: 'rgba(118,180,0,0.06)', border: '1px solid rgba(118,180,0,0.2)' }}>
                <Check w={16} style={{ color: 'var(--ok)', flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{config.provider.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{config.provider.vendor} · {config.provider.status}</div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 6, background: 'rgba(217,163,46,0.08)', border: '1px solid rgba(217,163,46,0.2)' }}>
                <AlertTri w={16} style={{ color: 'var(--warn)', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: 'var(--warn)' }}>No review provider configured — quality review is unavailable.</span>
              </div>
            )}

            {/* Provider selector */}
            <div>
              <label className="label" style={{ display: 'block', marginBottom: 6 }}>AI Provider</label>
              <select className="input" style={{ width: '100%' }} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
                <option value="">— Disabled —</option>
                {providers.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.vendor})</option>
                ))}
              </select>
              {selectedProvider && (
                <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 4 }}>
                  Model: {selectedProvider.model ?? 'default'} · Endpoint: {selectedProvider.endpoint}
                </div>
              )}
            </div>

            {/* Save */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || selectedId === (config?.provider_id ?? '')}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 300,
          padding: '10px 16px', borderRadius: 8,
          background: toast.kind === 'ok' ? 'rgba(118,180,0,0.12)' : 'var(--danger-bg)',
          color: toast.kind === 'ok' ? 'var(--ok, #76B400)' : 'var(--danger)',
          border: `1px solid ${toast.kind === 'ok' ? 'var(--ok, #76B400)' : 'var(--danger)'}`,
          fontSize: 13, fontWeight: 500, boxShadow: 'var(--shadow-2)',
        }}>{toast.msg}</div>
      )}
    </div>
  )
}
