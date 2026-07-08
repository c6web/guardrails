import React from 'react'
import { Network, Play } from '../components/ui/Icons'
import { Chip, DataTable } from '../components/ui'
import type { ColumnDef } from '../components/ui/DataTable'
import { getAiProviders, type AiProvider } from '../api/aiProviders'
import { getClassifierConfig, updateClassifierConfig, type ClassifierConfig } from '../api/classifiers'
import { getEmbeddingSettings, updateEmbeddingSettings } from '../api/embeddingSettings'
import { PageHeader, Breadcrumbs, StatCard, StatRow, EmptyState, ErrorState } from '../components/ui'
import { Toast, ClassifierDetailDrawer, ProviderTestModal } from './components/ProviderShared'
import type { TweakValues } from '../types'

// ── Fallback chain card ───────────────────────────────────────────────────────

function FallbackChain({ providers, config, onSave, busy }: {
  providers: AiProvider[]
  config: ClassifierConfig
  onSave: (c: ClassifierConfig) => Promise<void>
  busy: boolean
}) {
  const [draft, setDraft] = React.useState<ClassifierConfig>(config)

  React.useEffect(() => { setDraft(config) }, [config])

  function set(slot: keyof ClassifierConfig, value: string | null) {
    setDraft(prev => {
      const next = { ...prev, [slot]: value || null }
      if (!next.primary_id) { next.backup1_id = null; next.backup2_id = null }
      if (!next.backup1_id) { next.backup2_id = null }
      return next
    })
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(config)
  const chainDepth = [draft.primary_id, draft.backup1_id, draft.backup2_id].filter(Boolean).length

  function available(current: string | null, exclude: (string | null)[]) {
    const excl = new Set(exclude.filter(Boolean) as string[])
    if (current) excl.delete(current)
    return providers.filter(p => !excl.has(p.id))
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-hdr">
        <h3>Fallback Chain</h3>
        <div className="right" style={{ gap: 8, display: 'flex', alignItems: 'center' }}>
          {chainDepth > 0 && (
            <span className="caption" style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>
              {chainDepth === 1 ? 'Primary only' : `${chainDepth}-deep`}
            </span>
          )}
          <button className="btn btn-primary btn-sm" disabled={!dirty || busy} onClick={() => onSave(draft)}>
            {busy ? 'Saving…' : 'Save chain'}
          </button>
        </div>
      </div>
      <div style={{ padding: '16px 20px 20px' }}>
        <p style={{ fontSize: 12, color: 'var(--fg-secondary)', marginBottom: 16, marginTop: 0 }}>
          Classification requests route through the chain in order. If a provider fails and no backup is configured, the request fails immediately.
        </p>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, flexWrap: 'wrap' }}>
          <SlotCard slotLabel="Primary" required value={draft.primary_id}
            options={available(draft.primary_id, [draft.backup1_id, draft.backup2_id])}
            onChange={v => set('primary_id', v)} providers={providers} />
          <ChainArrow />
          <SlotCard slotLabel="Backup 1" value={draft.backup1_id} disabled={!draft.primary_id}
            options={available(draft.backup1_id, [draft.primary_id, draft.backup2_id])}
            onChange={v => set('backup1_id', v)} providers={providers} />
          <ChainArrow />
          <SlotCard slotLabel="Backup 2" value={draft.backup2_id} disabled={!draft.backup1_id}
            options={available(draft.backup2_id, [draft.primary_id, draft.backup1_id])}
            onChange={v => set('backup2_id', v)} providers={providers} />
          <ChainArrow />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 80, padding: '0 8px' }}>
            <div style={{ padding: '6px 14px', borderRadius: 6, background: 'var(--danger-bg, rgba(232,79,54,0.12))', border: '1px solid var(--danger)', color: 'var(--danger)', fontSize: 12, fontWeight: 600 }}>
              ✗ fail
            </div>
            <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', marginTop: 4 }}>no fallback</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ChainArrow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', minHeight: 80 }}>
      <span style={{ fontSize: 18, color: 'var(--fg-tertiary)', userSelect: 'none' }}>→</span>
    </div>
  )
}

function SlotCard({ slotLabel, value, options, onChange, disabled, required, providers }: {
  slotLabel: string; value: string | null; options: AiProvider[]
  onChange: (v: string | null) => void
  disabled?: boolean; required?: boolean; providers: AiProvider[]
}) {
  const provider = providers.find(p => p.id === value)
  const statusColor = provider?.status === 'healthy' ? 'var(--ok)' : provider?.status === 'degraded' ? 'var(--warning)' : provider ? 'var(--danger)' : undefined
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160, maxWidth: 200, opacity: disabled ? 0.45 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="label" style={{ fontSize: 10 }}>{slotLabel}</span>
        {required
          ? <span style={{ color: 'var(--danger)', fontSize: 10 }}>required</span>
          : <span style={{ color: 'var(--fg-tertiary)', fontSize: 10 }}>optional</span>}
      </div>
      <select className="select" style={{ width: '100%' }} value={value ?? ''} disabled={disabled}
        onChange={e => onChange(e.target.value || null)}>
        <option value="">— none —</option>
        {options.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {value && provider && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'var(--fg-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {provider.vendor}
          </span>
        </div>
      )}
      {!required && !value && !disabled && (
        <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>Not set — chain ends at previous</span>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const ClassificationProvidersPage: React.FC<{ tweaks: TweakValues }> = () => {
  const [providers, setProviders]   = React.useState<AiProvider[]>([])
  const [config, setConfig]         = React.useState<ClassifierConfig>({ primary_id: null, backup1_id: null, backup2_id: null, confidence_threshold: 0.65 })
  const [loading, setLoading]       = React.useState(true)
  const [loadError, setLoadError]   = React.useState<string | null>(null)
  const [chainBusy, setChainBusy]   = React.useState(false)
  const [thrDraft, setThrDraft]     = React.useState(0.65)
  const [thrBusy, setThrBusy]       = React.useState(false)

  const [semThr, setSemThr]         = React.useState(0.75)
  const [semThrDraft, setSemThrDraft] = React.useState(0.75)
  const [semThrBusy, setSemThrBusy] = React.useState(false)

  const [search, setSearch]         = React.useState('')
  const [detailProv, setDetailProv] = React.useState<AiProvider | null>(null)
  const [testTarget, setTestTarget] = React.useState<AiProvider | null>(null)
  const [toast, setToast]           = React.useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true); setLoadError(null)
    try {
      const [provs, cfg, emb] = await Promise.all([getAiProviders(), getClassifierConfig(), getEmbeddingSettings()])
      setProviders(provs)
      setConfig(cfg)
      setThrDraft(cfg.confidence_threshold)
      setSemThr(emb.semantic_threshold)
      setSemThrDraft(emb.semantic_threshold)
    } catch (err) {
      setLoadError((err as Error).message || 'Failed to load')
    } finally { setLoading(false) }
  }, [])

  React.useEffect(() => { load() }, [load])
  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const filtered = React.useMemo(() => {
    if (!search.trim()) return providers
    const q = search.toLowerCase()
    return providers.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.endpoint.toLowerCase().includes(q) ||
      p.vendor.toLowerCase().includes(q)
    )
  }, [providers, search])

  async function handleSaveChain(draft: ClassifierConfig) {
    setChainBusy(true)
    try {
      const updated = await updateClassifierConfig(draft)
      setConfig(updated)
      setToast({ msg: 'Fallback chain saved', kind: 'ok' })
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to save chain', kind: 'err' })
    } finally { setChainBusy(false) }
  }

  const healthyCount = providers.filter(p => p.status === 'healthy').length
  const chainDepth = [config.primary_id, config.backup1_id, config.backup2_id].filter(Boolean).length

  const columns: ColumnDef<AiProvider>[] = [
    {
      key: 'name',
      label: 'Name',
      render: (p) => <span style={{ fontWeight: 500, fontSize: 13 }}>{p.name}</span>,
    },
    {
      key: 'id',
      label: 'ID',
      render: (p) => <span className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{p.id}</span>,
    },
    {
      key: 'vendor',
      label: 'Vendor',
      render: (p) => <Chip kind="ok" mono>{p.vendor}</Chip>,
    },
    {
      key: 'endpoint',
      label: 'Endpoint',
      render: (p) => (
        <span className="mono" style={{ fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{p.endpoint}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (p) => (
        <>
          {p.status === 'healthy'   && <Chip kind="ok"     dot>healthy</Chip>}
          {p.status === 'degraded'  && <Chip kind="warn"   dot>degraded</Chip>}
          {p.status === 'unhealthy' && <Chip kind="danger" dot>unhealthy</Chip>}
        </>
      ),
    },
    {
      key: 'chain_slot',
      label: 'Chain slot',
      render: (p) => {
        const slot = p.id === config.primary_id ? 'primary'
          : p.id === config.backup1_id ? 'backup 1'
          : p.id === config.backup2_id ? 'backup 2'
          : null
        return slot
          ? <Chip kind={slot === 'primary' ? 'ok' : 'info'} mono>{slot}</Chip>
          : <span style={{ color: 'var(--fg-tertiary)', fontSize: 11 }}>—</span>
      },
    },
    {
      key: 'timeout',
      label: 'Timeout',
      render: (p) => <span className="mono" style={{ fontSize: 11 }}>{p.timeout_ms}ms</span>,
    },
    {
      key: 'requests_24h',
      label: 'Requests (24h)',
      render: (p) => <span className="mono" style={{ fontSize: 11 }}>{p.requests_24h.toLocaleString()}</span>,
    },
    {
      key: 'errors_24h',
      label: 'Errors (24h)',
      render: (p) => <span className="mono" style={{ fontSize: 11, color: p.errors_24h > 0 ? 'var(--danger)' : 'inherit' }}>{p.errors_24h}</span>,
    },
    {
      key: 'action',
      label: 'Action',
      render: (p) => (
        <button className="icon-btn" title="Test provider" onClick={(e) => { e.stopPropagation(); setTestTarget(p) }}><Play w={13} /></button>
      ),
    },
  ]

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="classifiers" />
      <PageHeader title="Classification providers" subtitle={<>Select AI providers from the pool for the classifier fallback chain — register new providers on the <strong>AI Providers</strong> page</>} />

      {/* Stats */}
      <StatRow mb={20}>
        <StatCard variant="compact" label="Available" value={providers.length} accent="var(--accent)" />
        <StatCard variant="compact" label="Healthy" value={healthyCount} />
        <StatCard variant="compact" label="Chain depth" value={chainDepth} />
      </StatRow>

      {/* Fallback chain */}
      {!loading && (
        <FallbackChain providers={providers} config={config} onSave={handleSaveChain} busy={chainBusy} />
      )}

      {/* Confidence threshold */}
      {!loading && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-hdr">
            <h3>Confidence Threshold</h3>
            <div className="right" style={{ gap: 8, display: 'flex', alignItems: 'center' }}>
              <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>
                {thrDraft.toFixed(2)}
              </span>
              <button className="btn btn-primary btn-sm" disabled={thrDraft === config.confidence_threshold || thrBusy}
                onClick={async () => {
                  setThrBusy(true)
                  try {
                    const updated = await updateClassifierConfig({ confidence_threshold: thrDraft })
                    setConfig(prev => ({ ...prev, confidence_threshold: updated.confidence_threshold }))
                    setToast({ msg: 'Confidence threshold saved', kind: 'ok' })
                  } catch (err) {
                    setToast({ msg: (err as Error).message || 'Failed to save threshold', kind: 'err' })
                  } finally { setThrBusy(false) }
                }}>
                {thrBusy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          <div style={{ padding: '16px 20px 20px' }}>
            <p style={{ fontSize: 12, color: 'var(--fg-secondary)', marginBottom: 12, marginTop: 0 }}>
              Minimum confidence required for the LLM classifier to treat a detection as an attack. Lower values catch more threats but may increase false positives.
            </p>
            <input type="range" min="0" max="1" step="0.05" value={thrDraft}
              onChange={e => setThrDraft(parseFloat(e.target.value))}
              style={{ width: '100%', maxWidth: 400 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 400, fontSize: 10, color: 'var(--fg-tertiary)', marginTop: 2 }}>
              <span>0 (all flagged)</span>
              <span>0.5</span>
              <span>1 (exact only)</span>
            </div>
          </div>
        </div>
      )}

      {/* Semantic match threshold */}
      {!loading && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-hdr">
            <h3>Semantic Match Threshold</h3>
            <div className="right" style={{ gap: 8, display: 'flex', alignItems: 'center' }}>
              <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>
                {semThrDraft.toFixed(2)}
              </span>
              <button className="btn btn-primary btn-sm" disabled={semThrDraft === semThr || semThrBusy}
                onClick={async () => {
                  setSemThrBusy(true)
                  try {
                    const updated = await updateEmbeddingSettings({ semantic_threshold: semThrDraft })
                    setSemThr(updated.semantic_threshold)
                    setSemThrDraft(updated.semantic_threshold)
                    setToast({ msg: 'Semantic threshold saved', kind: 'ok' })
                  } catch (err) {
                    setToast({ msg: (err as Error).message || 'Failed to save threshold', kind: 'err' })
                  } finally { setSemThrBusy(false) }
                }}>
                {semThrBusy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          <div style={{ padding: '16px 20px 20px' }}>
            <p style={{ fontSize: 12, color: 'var(--fg-secondary)', marginBottom: 12, marginTop: 0 }}>
              Minimum cosine similarity for a prompt to match a threat-knowledge vector and advance to the LLM classifier. Lower values match more broadly (higher recall, more classifier calls); higher values are stricter.
            </p>
            <input type="range" min="0" max="1" step="0.01" value={semThrDraft}
              onChange={e => setSemThrDraft(parseFloat(e.target.value))}
              style={{ width: '100%', maxWidth: 400 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 400, fontSize: 10, color: 'var(--fg-tertiary)', marginTop: 2 }}>
              <span>0 (match all)</span>
              <span>0.5</span>
              <span>1 (exact only)</span>
            </div>
          </div>
        </div>
      )}

      {/* Provider pool table */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="label-strong" style={{ fontSize: 12 }}>AI provider pool</span>
        <input className="input" type="search" placeholder="Search name, vendor, endpoint…"
          value={search} onChange={e => setSearch(e.target.value)} style={{ width: 260 }} />
      </div>

      {loadError ? (
        <ErrorState title="Failed to load providers" message={loadError} onRetry={load} />
      ) : (
        <DataTable<AiProvider>
          columns={columns}
          data={filtered}
          rowKey={p => p.id}
          onRowClick={p => setDetailProv(p)}
          loading={loading}
          minWidth={880}
          rowStyle={p => p.status === 'unhealthy' ? { opacity: 0.55 } : undefined}
          emptyState={
            <EmptyState
              icon={<Network w={28} />}
              title={search ? 'No providers match this filter.' : 'No AI providers registered yet.'}
            />
          }
        >
          {filtered.length < providers.length && (
            <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--fg-tertiary)', borderTop: '1px solid var(--border-subtle)' }}>
              Showing {filtered.length} of {providers.length} providers
            </div>
          )}
        </DataTable>
      )}

      {detailProv && (
        <ClassifierDetailDrawer provider={detailProv} onClose={() => setDetailProv(null)} />
      )}
      {testTarget && (
        <ProviderTestModal provider={testTarget} apiBase="/api/ai-providers" onClose={() => setTestTarget(null)} />
      )}
      {toast && <Toast {...toast} />}
    </div>
  )
}

export default ClassificationProvidersPage
