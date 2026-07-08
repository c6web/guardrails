import React from 'react'
import { Plus, Pencil, Trash2, Play, Network } from '../components/ui/Icons'
import { Chip, DataTable, type ColumnDef, PageHeader, Breadcrumbs, StatCard, StatRow, EmptyState, ErrorState, LoadingState } from '../components/ui'
import {
  getEmbeddingProviders,
  getEmbeddingProvider,
  createEmbeddingProvider,
  updateEmbeddingProvider,
  deleteEmbeddingProvider,
  getEmbeddingProviderConfig,
  updateEmbeddingProviderConfig,
  type EmbeddingProvider,
  type EmbeddingProviderConfig,
} from '../api/embeddingProviders'
import ActionCell from '../components/ui/ActionCell'
import { Toast, ConfirmModal, ProviderFormModal, ProviderDetailDrawer, EmbeddingTestModal, type ProviderFormData } from './components/ProviderShared'

const LOCAL_VENDORS = new Set(['ollama', 'llamacpp', 'lmstudio', 'vllm'])

function getGroup(vendor: string): string {
  const v = vendor.toLowerCase()
  if (['openai', 'google', 'azure', 'aws', 'voyage', 'cohere'].includes(v)) return 'Cloud Provider'
  if (LOCAL_VENDORS.has(v)) return 'Local LLM'
  return 'Others (OpenAI Compatible)'
}

// ── Fallback chain card ───────────────────────────────────────────────────────

function FallbackChain({ providers, config, onSave, busy }: {
  providers: EmbeddingProvider[]
  config: EmbeddingProviderConfig
  onSave: (c: EmbeddingProviderConfig) => Promise<void>
  busy: boolean
}) {
  const [draft, setDraft] = React.useState<EmbeddingProviderConfig>(config)

  React.useEffect(() => { setDraft(config) }, [config])

  function set(slot: keyof EmbeddingProviderConfig, value: string | null) {
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
          Embedding requests route through the chain in order. If a provider fails and no backup is configured, the request fails immediately.
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
  slotLabel: string; value: string | null; options: EmbeddingProvider[]
  onChange: (v: string | null) => void
  disabled?: boolean; required?: boolean; providers: EmbeddingProvider[]
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

const FORM_LABELS = {
  createTitle: 'Register embedding provider',
  editTitle: 'Edit embedding provider',
  idPrefix: 'emb',
  submitCreate: 'Register provider',
}

const EmbeddingProvidersPage: React.FC<{}> = () => {
  const [providers, setProviders] = React.useState<EmbeddingProvider[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const [search, setSearch] = React.useState('')

  const [showCreate, setShowCreate] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<EmbeddingProvider | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<EmbeddingProvider | null>(null)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)
  const [detailProv, setDetailProv] = React.useState<EmbeddingProvider | null>(null)
  const [testTarget, setTestTarget] = React.useState<EmbeddingProvider | null>(null)
  const [toast, setToast] = React.useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)
  const [config, setConfig] = React.useState<EmbeddingProviderConfig | null>(null)
  const [chainBusy, setChainBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [data, cfg] = await Promise.all([getEmbeddingProviders(), getEmbeddingProviderConfig()])
      setProviders(data)
      setConfig(cfg)
    } catch (err) {
      setLoadError((err as Error).message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

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

  const grouped = React.useMemo(() => {
    const groups: Record<string, EmbeddingProvider[]> = {}
    providers.forEach(p => {
      const g = getGroup(p.vendor)
      if (!groups[g]) groups[g] = []
      groups[g].push(p)
    })
    return groups
  }, [providers])

  const groupKeys = React.useMemo(() => {
    const order = ['Cloud Provider', 'Local LLM', 'Others (OpenAI Compatible)']
    return order.filter(g => grouped[g]?.some(p => filtered.includes(p)))
  }, [grouped, filtered])

  const handleCreate = async (data: ProviderFormData) => {
    await createEmbeddingProvider({
      id: data.id, name: data.name, vendor: data.vendor, endpoint: data.endpoint,
      api_key: data.api_key || null, notes: data.notes || null,
      model: data.model || null,
      dimensions: data.dimensions ? parseInt(data.dimensions as string, 10) : null,
      timeout_ms: data.timeout_ms,
      provider: data.provider || null,
      allow_fallbacks: data.allow_fallbacks ?? null,
      data_collection: data.data_collection ?? null,
    })
    setShowCreate(false)
    await load()
    setToast({ msg: `${data.name} registered`, kind: 'ok' })
  }

  const handleUpdate = async (data: ProviderFormData) => {
    setEditTarget(null)
    setDetailProv(null)
    await updateEmbeddingProvider(data.id, {
      name: data.name, vendor: data.vendor, endpoint: data.endpoint,
      api_key: data.api_key || null, notes: data.notes || null,
      model: data.model || null,
      dimensions: data.dimensions ? parseInt(data.dimensions as string, 10) : null,
      timeout_ms: data.timeout_ms,
      provider: data.provider || null,
      allow_fallbacks: data.allow_fallbacks ?? null,
      data_collection: data.data_collection ?? null,
    })
    await load()
    setToast({ msg: `${data.name} updated`, kind: 'ok' })
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setBusy(true)
    setDeleteError(null)
    try {
      await deleteEmbeddingProvider(deleteTarget.id)
      setDeleteTarget(null)
      await load()
      setToast({ msg: `${deleteTarget.name} deleted`, kind: 'ok' })
    } catch (err) {
      setDeleteError((err as Error).message || 'Delete failed')
    } finally { setBusy(false) }
  }

  async function openDetail(p: EmbeddingProvider) {
    try { setDetailProv(await getEmbeddingProvider(p.id)) } catch { setDetailProv(p) }
  }

  async function openEdit(p: EmbeddingProvider) {
    try { setEditTarget(await getEmbeddingProvider(p.id)) } catch { setEditTarget(p) }
  }

  function openDelete(provider: EmbeddingProvider) {
    setDeleteTarget(provider)
    setDeleteError(null)
  }

  const handleSaveChain = async (draft: EmbeddingProviderConfig) => {
    setChainBusy(true)
    try {
      const updated = await updateEmbeddingProviderConfig(draft)
      setConfig(updated)
      setToast({ msg: 'Fallback chain saved', kind: 'ok' })
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to save chain', kind: 'err' })
    } finally { setChainBusy(false) }
  }

  const healthyCount = providers.filter(p => p.status === 'healthy').length
  const chainDepth = config ? [config.primary_id, config.backup1_id, config.backup2_id].filter(Boolean).length : 0

  const columns: ColumnDef<EmbeddingProvider>[] = [
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
      key: 'model',
      label: 'Model',
      render: (p) => <span className="mono" style={{ fontSize: 11 }}>{p.model || '—'}</span>,
    },
    {
      key: 'dimensions',
      label: 'Dimensions',
      render: (p) => <span className="mono" style={{ fontSize: 11 }}>{p.dimensions || '—'}</span>,
    },
    {
      key: 'timeout',
      label: 'Timeout',
      render: (p) => <span className="mono" style={{ fontSize: 11 }}>{p.timeout_ms}ms</span>,
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
      key: 'api_key',
      label: 'API Key',
      render: (p) => {
        const isLocal = LOCAL_VENDORS.has(p.vendor.toLowerCase())
        if (isLocal) return <Chip kind="info" mono>N/A</Chip>
        return p.has_api_key
          ? <Chip kind="ok">✅ set</Chip>
          : <Chip kind="warn">❓ missing</Chip>
      },
    },
    {
      key: 'chain_slot',
      label: 'Chain slot',
      render: (p) => {
        const slot = p.id === config?.primary_id ? 'primary'
          : p.id === config?.backup1_id ? 'backup 1'
          : p.id === config?.backup2_id ? 'backup 2'
          : null
        return slot
          ? <Chip kind={slot === 'primary' ? 'ok' : 'info'} mono>{slot}</Chip>
          : <span style={{ color: 'var(--fg-tertiary)', fontSize: 11 }}>—</span>
      },
    },
    {
      key: 'requests',
      label: 'Requests (24h)',
      render: (p) => <span className="mono" style={{ fontSize: 11 }}>{p.requests_24h?.toLocaleString() ?? '—'}</span>,
    },
    {
      key: 'errors',
      label: 'Errors (24h)',
      render: (p) => <span className="mono" style={{ fontSize: 11, color: (p.errors_24h || 0) > 0 ? 'var(--danger)' : 'inherit' }}>{p.errors_24h ?? '—'}</span>,
    },
    {
      key: 'action',
      label: '',
      render: (p) => (
        <div onClick={e => e.stopPropagation()}>
          <ActionCell actions={[
            { icon: <Play w={13} />, label: 'Test', onClick: () => setTestTarget(p) },
            { icon: <Pencil w={13} />, label: 'Edit', onClick: () => openEdit(p) },
            { icon: <Trash2 w={14} />, label: 'Delete', danger: true, onClick: () => openDelete(p) },
          ]} />
        </div>
      ),
    },
  ]

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="embedding-providers" />
      <PageHeader title="Embedding providers" subtitle="Central registry of text embedding API endpoints — register vendors and manage connections"
        actions={<button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus w={13} /> Register provider</button>} />

      {/* Stats */}
      <StatRow mb={20}>
        <StatCard variant="compact" label="Registered" value={providers.length} accent="var(--accent)" />
        <StatCard variant="compact" label="Healthy" value={healthyCount} />
        <StatCard variant="compact" label="Chain depth" value={chainDepth} />
      </StatRow>

      {/* Model/dimension consistency warning */}
      {!loading && (
        <div className="card" style={{ padding: '14px 20px', marginBottom: 20, borderColor: 'var(--warning)', background: 'var(--warning-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>⚠</span>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--warning)' }}>Important: Use consistent model and dimensions</div>
              <div style={{ fontSize: 12, color: 'var(--fg-secondary)', lineHeight: 1.5 }}>
                All embedding providers must use the same dimension size for semantic search to work correctly. Configure the active dimension in{' '}
                <a href="/embedding-settings" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Settings → Embedding</a>. When you change dimensions there, all providers are automatically synced.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fallback chain */}
      {!loading && config && (
        <FallbackChain providers={providers} config={config} onSave={handleSaveChain} busy={chainBusy} />
      )}

      {/* Provider pool table */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="label-strong" style={{ fontSize: 12 }}>Embedding provider pool</span>
        <input className="input" type="search" placeholder="Search name, vendor, endpoint…"
          value={search} onChange={e => setSearch(e.target.value)} style={{ width: 260 }} />
      </div>

      {loading ? (
        <LoadingState />
      ) : loadError ? (
        <ErrorState title="Failed to load providers" message={loadError} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Network w={28} />}
          title={search ? 'No providers match this filter.' : 'No embedding providers registered yet.'}
        />
      ) : (
        <div className="card">
          {groupKeys.map(group => {
            const rows = grouped[group]?.filter(p => filtered.includes(p)) ?? []
            if (!rows.length) return null
            return (
              <React.Fragment key={group}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '2px solid var(--border-subtle)' }}>
                  <h3 style={{ margin: 0, fontSize: 15 }}>{group}</h3>
                  <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>({rows.length} providers)</span>
                </div>
                <DataTable
                  columns={columns}
                  data={rows}
                  rowKey={(p) => p.id}
                  onRowClick={(p) => openDetail(p)}
                  card={false}
                  minWidth={880}
                  rowStyle={(p) => ({ opacity: p.status === 'unhealthy' ? 0.55 : 1 })}
                />
              </React.Fragment>
            )
          })}
          {filtered.length < providers.length && (
            <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--fg-tertiary)', borderTop: '1px solid var(--border-subtle)' }}>
              Showing {filtered.length} of {providers.length} providers
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <ProviderFormModal labels={FORM_LABELS} extraFields={[{ name: 'dimensions', label: 'Embedding dimensions', type: 'number', placeholder: 'e.g. 1536' }]} config={{ requiredFields: ['model'] }} onClose={() => setShowCreate(false)} onSave={handleCreate} asDrawer isEmbedding />
      )}
      {editTarget && (
        <ProviderFormModal labels={FORM_LABELS} extraFields={[{ name: 'dimensions', label: 'Embedding dimensions', type: 'number', placeholder: 'e.g. 1536' }]} config={{ requiredFields: ['model'] }} initialProvider={editTarget as any} onClose={() => setEditTarget(null)} onSave={handleUpdate} asDrawer isEmbedding />
      )}
      {deleteTarget && (
        <ConfirmModal
          title="Delete embedding provider"
          message={
            <>
              {deleteError
                ? <div style={{ color: 'var(--danger)', marginBottom: 10, fontSize: 13 }}>{deleteError}</div>
                : <>Permanently delete <strong>{deleteTarget.name}</strong>? This cannot be undone.</>}
            </>
          }
          confirmLabel={deleteError ? 'Close' : 'Delete provider'}
          danger={!deleteError}
          onClose={() => { setDeleteTarget(null); setDeleteError(null) }}
          onConfirm={deleteError ? () => { setDeleteTarget(null); setDeleteError(null) } : handleDelete}
          busy={busy}
        />
      )}
      {detailProv && (
        <ProviderDetailDrawer
          provider={detailProv as any}
          onClose={() => setDetailProv(null)}
          onEdit={() => { setEditTarget(detailProv as any); setDetailProv(null) }}
          onDelete={() => { openDelete(detailProv); setDetailProv(null) }}
        />
      )}
      {testTarget && (
        <EmbeddingTestModal provider={testTarget} onClose={() => setTestTarget(null)} />
      )}
      {toast && <Toast {...toast} />}
    </div>
  )
}

export default EmbeddingProvidersPage
