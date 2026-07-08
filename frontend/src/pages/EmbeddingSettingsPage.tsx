import React from 'react'
import { getEmbeddingSettings, updateEmbeddingSettings, type EmbeddingSettingsData } from '../api/embeddingSettings'
import { Pencil, SettingsRi } from '../components/ui/Icons'
import { PageHeader, Breadcrumbs, LoadingState } from '../components/ui'
import { Toast } from './components/ProviderShared'
import type { TweakValues } from '../types'

interface EmbeddingSettingsPageProps { tweaks: TweakValues }

const EmbeddingSettingsPage: React.FC<EmbeddingSettingsPageProps> = () => {
  const [settings, setSettings] = React.useState<EmbeddingSettingsData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [toast, setToast] = React.useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)
  const [dimension, setDimension] = React.useState<number | null>(1024)
  const [reembedding, setReembedding] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await getEmbeddingSettings()
      setSettings(data)
      if (data.dimensions !== null && data.dimensions !== undefined) {
        setDimension(data.dimensions)
      } else {
        setDimension(1024)
      }
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to load embedding settings', kind: 'err' })
    } finally { setLoading(false) }
  }, [])

  React.useEffect(() => { load() }, [load])

  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  async function handleSave() {
    if (dimension === null || dimension <= 0) {
      setToast({ msg: 'Dimension must be a positive integer', kind: 'err' })
      return
    }
    setBusy(true)
    try {
      await updateEmbeddingSettings({ dimensions: dimension })
      const updated = await getEmbeddingSettings()
      setSettings(updated)
      if (updated.dimensions !== null && updated.dimensions !== undefined) {
        setDimension(updated.dimensions)
      } else {
        setDimension(1024)
      }
      setToast({ msg: 'Embedding settings saved', kind: 'ok' })
    } catch (err) {
      setToast({ msg: `${(err as Error).message || 'Failed to save'} — changes were not saved`, kind: 'err' })
    } finally { setBusy(false) }
  }

  async function handleReembed() {
    try {
      setReembedding(true)
      const res = await fetch('/api/threat-knowledge/embed-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      })
      const result = await res.json()
      if (result.data) {
        setToast({ msg: `Re-embed complete: ${result.data.succeeded} succeeded, ${result.data.failed || 0} failed`, kind: 'ok' })
        await load()
      } else {
        setToast({ msg: 'Failed to re-embed', kind: 'err' })
      }
    } catch (err) {
      setToast({ msg: `${(err as Error).message || 'Failed to re-embed'}`, kind: 'err' })
    } finally { setReembedding(false) }
  }

  const mismatch = settings?.threat_knowledge.mismatch ?? 0
  const hasMismatch = mismatch > 0

 return (
    <div className="page fade-in">

      <Breadcrumbs pageId="embedding-settings" />
      <PageHeader title="Embedding Settings" subtitle="Set the vector dimension for threat knowledge embeddings. Changing this requires re-embedding all existing entries." />

      {/* Loading state */}
      {loading ? (
        <LoadingState />
      ) : settings ? (
        <>
          {/* Dimension mismatch warning */}
          {hasMismatch && (
            <div className="card" style={{ background: 'var(--bg-warning)', borderColor: 'var(--border-warning)', marginBottom: 16 }}>
              <div style={{ padding: '16px 20px' }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, color: 'var(--text-warning)' }}>
                  Dimension changed — re-embed required
                </div>
                <div style={{ fontSize: 13, marginBottom: 12, color: 'var(--fg-secondary)' }}>
                  {settings.threat_knowledge.total} threat knowledge entries exist.{' '}
                  {mismatch} entries have vectors with a different dimension ({settings.active_dim}).{' '}
                  Click Re-embed all to regenerate vectors at the new dimension.
                </div>
                <button className="btn btn-warning" onClick={handleReembed} disabled={reembedding}>
                  <Pencil w={13} /> {reembedding ? 'Re-embedding…' : 'Re-embed all'}
                </button>
              </div>
            </div>
          )}

          {/* Active dimension */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ padding: '16px 20px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <SettingsRi w={15} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>Active dimension</span>
              </div>

              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 14 }}>Embedding dimension</span>
                <input
                  type="number"
                  min={1}
                  max={32768}
                  value={dimension ?? ''}
                  onChange={(e) => setDimension(Number(e.target.value) || null)}
                  className="input"
                  style={{ width: 100, textAlign: 'right', background: 'var(--bg-sunken)' }}
                />
              </div>

              <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--bg-sunken)', borderRadius: 6, fontSize: 12, color: 'var(--fg-secondary)' }}>
                Changing the dimension will sync it to all configured embedding providers and trigger a gateway reload.
              </div>
            </div>
          </div>

          {/* Active provider */}
          {settings.primary_provider && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ padding: '16px 20px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <SettingsRi w={15} />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Active provider</span>
                </div>

                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 14 }}>Name</span>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{settings.primary_provider.name}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 14 }}>Model</span>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{settings.primary_provider.model !== null ? settings.primary_provider.model : 'not set'}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 14 }}>Provider dimensions</span>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{settings.primary_provider.dimensions !== null ? settings.primary_provider.dimensions : 'auto'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Threat knowledge coverage */}
          <div className="card">
            <div style={{ padding: '16px 20px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <SettingsRi w={15} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>Threat knowledge coverage</span>
              </div>

              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 14 }}>Total entries</span>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{settings.threat_knowledge.total}</span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 14 }}>Embedded</span>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{settings.threat_knowledge.embedded}</span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 14 }}>Dimension mismatch</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: hasMismatch ? 'var(--text-warning)' : undefined }}>
                  {settings.threat_knowledge.mismatch}
                </span>
              </div>
            </div>
          </div>

          {/* Save button */}
          <button className="btn btn-primary" onClick={handleSave} disabled={busy} style={{ marginTop: 16 }}>
            <Pencil w={13} /> Save changes
          </button>
        </>
      ) : null}

      {toast && <Toast msg={toast.msg} kind={toast.kind} />}
    </div>
  )
}

export default EmbeddingSettingsPage
