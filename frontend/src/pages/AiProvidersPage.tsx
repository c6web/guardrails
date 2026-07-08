import React from 'react'
import { Plus, Pencil, Trash2, Play, Network, Activity } from '../components/ui/Icons'
import { Chip, DataTable, type ColumnDef } from '../components/ui'
import { getAiProviders, getAiProvider, createAiProvider, updateAiProvider, deleteAiProvider, type AiProvider } from '../api/aiProviders'
import { getProviders } from '../api/providers'
import { getClassifierConfig, type ClassifierConfig } from '../api/classifiers'
import { PageHeader, Breadcrumbs, StatCard, StatRow, EmptyState, ErrorState, LoadingState } from '../components/ui'
import { Toast, ConfirmModal, ProviderFormModal, ProviderDetailDrawer, ProviderTestModal, type ProviderFormData } from './components/ProviderShared'
import { MeterDrawer, meterDrawerStateFromSummary, meterDrawerStateFromProvider, type MeterDrawerState } from './components/MeterDrawer'
import ActionCell from '../components/ui/ActionCell'
import { getMeteringSummary, updateProviderMetering, resetProviderMeter } from '../api/providerMetering'
import type { ProviderMeterSummaryItem } from '../types'
import type { TweakValues } from '../types/index'

interface AiProvidersPageProps { tweaks: TweakValues }

function getGroup(vendor: string): string {
  const v = vendor.toLowerCase()
  if (['openai', 'anthropic', 'google', 'aws', 'azure', 'mistral', 'groq', 'openrouter'].includes(v)) return 'Cloud Provider'
  if (['ollama', 'llamacpp', 'lmstudio', 'vllm'].includes(v)) return 'Local LLM'
  return 'Others (OpenAI Compatible)'
}

const FORM_LABELS = {
  createTitle:  'Register AI provider',
  editTitle:    'Edit AI provider',
  idPrefix:     'prov',
  submitCreate: 'Register provider',
}

const AiProvidersPage: React.FC<AiProvidersPageProps> = () => {
  const [providers, setProviders]       = React.useState<AiProvider[]>([])
  const [upstreamIds, setUpstreamIds]   = React.useState<Set<string>>(new Set())
  const [config, setConfig]             = React.useState<ClassifierConfig>({ primary_id: null, backup1_id: null, backup2_id: null, confidence_threshold: 0.5 })
  const [loading, setLoading]           = React.useState(true)
  const [loadError, setLoadError]       = React.useState<string | null>(null)
  const [busy, setBusy]                 = React.useState(false)

  const [search, setSearch]             = React.useState('')
  const [vendorFilter, setVendorFilter] = React.useState('all')
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'healthy' | 'degraded' | 'unhealthy'>('all')

  const [showCreate, setShowCreate]     = React.useState(false)
  const [editTarget, setEditTarget]     = React.useState<AiProvider | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<AiProvider | null>(null)
  const [detailProv, setDetailProv]     = React.useState<AiProvider | null>(null)
  const [testTarget, setTestTarget]     = React.useState<AiProvider | null>(null)
  const [toast, setToast]               = React.useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)
  const [deleteError, setDeleteError]   = React.useState<string | null>(null)
  const [meterSummary, setMeterSummary] = React.useState<Record<string, ProviderMeterSummaryItem>>({})
  const [meterTarget, setMeterTarget]   = React.useState<MeterDrawerState | null>(null)
  const [meterSaving, setMeterSaving]   = React.useState(false)
  const [meterResetting, setMeterResetting] = React.useState(false)
  const [meterResetConfirm, setMeterResetConfirm] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true); setLoadError(null)
    try {
      const [provs, upstream, cfg, meter] = await Promise.all([
        getAiProviders(),
        getProviders(),
        getClassifierConfig(),
        getMeteringSummary().catch(() => [] as ProviderMeterSummaryItem[]),
      ])
      setProviders(provs)
      setUpstreamIds(new Set(upstream.map(p => p.id)))
      setConfig(cfg)
      const m: Record<string, ProviderMeterSummaryItem> = {}
      meter.forEach(item => { m[item.id] = item })
      setMeterSummary(m)
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

  const classifierIds = React.useMemo(() =>
    new Set([config.primary_id, config.backup1_id, config.backup2_id].filter(Boolean) as string[]),
    [config]
  )

  const grouped = React.useMemo(() => {
    const groups: Record<string, AiProvider[]> = {}
    providers.forEach(p => {
      const g = getGroup(p.vendor)
      if (!groups[g]) groups[g] = []
      groups[g].push(p)
    })
    return groups
  }, [providers])

  const filtered = React.useMemo(() => {
    let list = providers
    if (statusFilter !== 'all') list = list.filter(p => p.status === statusFilter)
    if (vendorFilter !== 'all') list = list.filter(p => getGroup(p.vendor) === vendorFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.endpoint.toLowerCase().includes(q) ||
        p.vendor.toLowerCase().includes(q)
      )
    }
    return list
  }, [providers, statusFilter, vendorFilter, search])

  const groupKeys = React.useMemo(() => {
    const order = ['Cloud Provider', 'Local LLM', 'Others (OpenAI Compatible)']
    return order.filter(g => {
      if (!grouped[g]) return false
      return grouped[g].some(p => filtered.includes(p))
    })
  }, [grouped, filtered])

  const healthyCount = providers.filter(p => p.status === 'healthy').length

  async function handleCreate(data: ProviderFormData) {
    await createAiProvider({
      id: data.id, name: data.name, vendor: data.vendor, endpoint: data.endpoint,
      api_key: data.api_key || undefined, notes: data.notes || undefined,
      model: data.model || undefined, max_output_token: data.max_output_token ?? undefined, max_input_token: data.max_input_token ?? undefined,
      timeout_ms: data.timeout_ms,
      provider: data.provider || null,
      allow_fallbacks: data.allow_fallbacks ?? null,
      data_collection: data.data_collection ?? null,
    })
    setShowCreate(false)
    await load()
    setToast({ msg: `${data.name} registered`, kind: 'ok' })
  }

  async function handleEdit(data: ProviderFormData) {
    setEditTarget(null); setDetailProv(null)
    await updateAiProvider(data.id, {
      name: data.name, vendor: data.vendor, endpoint: data.endpoint,
      api_key: data.api_key ?? undefined, notes: data.notes ?? undefined,
      model: data.model ?? undefined, max_output_token: data.max_output_token ?? undefined, max_input_token: data.max_input_token ?? undefined,
      timeout_ms: data.timeout_ms,
      provider: data.provider || null,
      allow_fallbacks: data.allow_fallbacks ?? null,
      data_collection: data.data_collection ?? null,
    })
    await load()
    setToast({ msg: `${data.name} updated`, kind: 'ok' })
  }

  async function handleDelete(provider: AiProvider) {
    setDeleteError(null)
    setBusy(true)
    try {
      await deleteAiProvider(provider.id)
      setDeleteTarget(null)
      await load()
      setToast({ msg: `${provider.name} deleted`, kind: 'ok' })
    } catch (err) {
      const msg = (err as Error).message || 'Delete failed'
      setDeleteError(msg)
    } finally { setBusy(false) }
  }

  async function openDetail(p: AiProvider) {
    try { setDetailProv(await getAiProvider(p.id)) } catch { setDetailProv(p) }
  }

  async function openEdit(p: AiProvider) {
    try { setEditTarget(await getAiProvider(p.id)) } catch { setEditTarget(p) }
  }

  function openDelete(provider: AiProvider) {
    setDeleteTarget(provider)
    setDeleteError(null)
  }

  function openMeter(p: AiProvider) {
    const summary = meterSummary[p.id]
    setMeterTarget(summary ? meterDrawerStateFromSummary(summary) : meterDrawerStateFromProvider(p.id, p.name, p.vendor))
  }

  async function handleMeterSave(s: MeterDrawerState) {
    setMeterSaving(true)
    try {
      await updateProviderMetering(s.item.id, {
        meter_mode: s.mode,
        meter_metric: s.metric,
        meter_limit: s.limit ? Number(s.limit) : null,
        meter_warning_limit: s.warning ? Number(s.warning) : null,
        meter_enforcement: s.enforcement,
        meter_reset_day: s.resetDay ? Number(s.resetDay) : null,
        price_per_1m_input: s.priceIn !== '' ? Number(s.priceIn) : null,
        price_per_1m_output: s.priceOut !== '' ? Number(s.priceOut) : null,
      })
      setMeterTarget(null)
      setToast({ msg: 'Meter config saved', kind: 'ok' })
      load()
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Save failed', kind: 'err' })
    } finally { setMeterSaving(false) }
  }

  async function handleMeterReset() {
    if (!meterTarget) return
    setMeterResetting(true)
    try {
      await resetProviderMeter(meterTarget.item.id)
      setMeterResetConfirm(false)
      setMeterTarget(null)
      setToast({ msg: 'Meter period reset', kind: 'ok' })
      load()
    } catch {
      setToast({ msg: 'Reset failed', kind: 'err' })
    } finally { setMeterResetting(false) }
  }

  function slotLabel(id: string): string | null {
    if (id === config.primary_id) return 'primary'
    if (id === config.backup1_id) return 'backup 1'
    if (id === config.backup2_id) return 'backup 2'
    return null
  }

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
      render: (p) => <span className="mono" style={{ fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.endpoint}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (p) => (
        p.status === 'healthy'   ? <Chip kind="ok"     dot>healthy</Chip> :
        p.status === 'degraded'  ? <Chip kind="warn"   dot>degraded</Chip> :
        p.status === 'unhealthy' ? <Chip kind="danger" dot>unhealthy</Chip> : null
      ),
    },
    {
      key: 'apiKey',
      label: 'API Key',
      render: (p) => {
        const localVendors = ['ollama', 'llamacpp', 'lmstudio', 'vllm']
        const isLocal = localVendors.includes(p.vendor.toLowerCase())
        if (isLocal) return <Chip kind="info" mono>N/A</Chip>
        return p.has_api_key
          ? <Chip kind="ok">✅ set</Chip>
          : <Chip kind="warn">❓ missing</Chip>
      },
    },
    {
      key: 'roles',
      label: 'Roles',
      render: (p) => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {upstreamIds.has(p.id) && <Chip kind="info" mono>upstream</Chip>}
          {(() => {
            const slot = slotLabel(p.id)
            return slot ? <Chip kind={slot === 'primary' ? 'ok' : 'warn'} mono>{slot}</Chip> : null
          })()}
        </div>
      ),
    },
    {
      key: 'timeout',
      label: 'Timeout',
      render: (p) => <span className="mono" style={{ fontSize: 11 }}>{p.timeout_ms}ms</span>,
    },
    {
      key: 'errors',
      label: 'Errors',
      render: (p) => <span className="mono" style={{ fontSize: 11, color: p.errors_24h > 0 ? 'var(--danger)' : 'inherit' }}>{p.errors_24h}</span>,
    },
    {
      key: 'latency',
      label: 'Latency',
      render: (p) => <span className="mono" style={{ fontSize: 11 }}>{p.avg_latency_ms}ms</span>,
    },
    {
      key: 'action',
      label: 'Action',
      render: (p) => (
        <ActionCell actions={[
          { icon: <Activity w={13} />, label: 'Usage metering', onClick: () => openMeter(p) },
          { icon: <Play w={13} />, label: 'Test', onClick: () => setTestTarget(p) },
          { icon: <Pencil w={13} />, label: 'Edit', onClick: () => openEdit(p) },
          { icon: <Trash2 w={14} />, label: 'Delete', danger: true, onClick: () => openDelete(p) },
        ]} />
      ),
    },
  ]

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="ai-providers" />
      <PageHeader title="AI providers" subtitle="Central registry of all AI endpoints — assign them as upstream routes or classifier chain slots"
        actions={<button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus w={13} /> Register provider</button>} />

      {/* Stats */}
      <StatRow>
        <StatCard variant="compact" label="Registered" value={providers.length} accent="var(--accent)" />
        <StatCard variant="compact" label="Healthy" value={healthyCount} />
        <StatCard variant="compact" label="In Upstream Pool" value={upstreamIds.size} />
        <StatCard variant="compact" label="In Classifier Chain" value={classifierIds.size} />
      </StatRow>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        {(['all', 'healthy', 'degraded', 'unhealthy'] as const).map(s => (
          <button key={s} className={`filter-chip ${statusFilter === s ? 'active' : ''}`}
            onClick={() => setStatusFilter(s)}>{s}</button>
        ))}
        <>
          <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginRight: 2 }}>Group:</span>
          <select className="select" style={{ width: 'auto', minWidth: 180 }} value={vendorFilter}
            onChange={e => setVendorFilter(e.target.value)}>
            <option value="all">All groups</option>
            <option value="Cloud Provider">Cloud Provider</option>
            <option value="Local LLM">Local LLM</option>
            <option value="Others (OpenAI Compatible)">Others (OpenAI Compatible)</option>
          </select>
        </>
        <input className="input" type="search" placeholder="Search name, vendor, endpoint…"
          value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
      </div>

      {/* Table */}
      {loading ? (
        <LoadingState />
      ) : loadError ? (
        <ErrorState title="Failed to load providers" message={loadError} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Network w={28} />}
          title={search || vendorFilter !== 'all' || statusFilter !== 'all' ? 'No providers match this filter.' : 'No AI providers registered yet.'}
          action={!search && vendorFilter === 'all' && statusFilter === 'all' ? (
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
              <Plus w={12} /> Register first provider
            </button>
          ) : undefined}
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
                <DataTable<AiProvider>
                  columns={columns}
                  data={rows}
                  rowKey={(p) => p.id}
                  onRowClick={(p) => openDetail(p)}
                  rowStyle={(p) => ({ opacity: p.status === 'unhealthy' ? 0.55 : 1 })}
                  minWidth={880}
                  card={false}
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

      {showCreate && (
        <ProviderFormModal labels={FORM_LABELS} config={{ requiredFields: [] }} onClose={() => setShowCreate(false)} onSave={handleCreate} asDrawer />
      )}
      {editTarget && (
        <ProviderFormModal labels={FORM_LABELS} config={{ requiredFields: [] }} initialProvider={editTarget} onClose={() => setEditTarget(null)} onSave={handleEdit} asDrawer />
      )}
      {deleteTarget && (
        <ConfirmModal
          title="Delete AI provider"
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
          onConfirm={deleteError ? () => { setDeleteTarget(null); setDeleteError(null) } : () => handleDelete(deleteTarget)}
          busy={busy}
        />
      )}
      {detailProv && (
        <ProviderDetailDrawer
          provider={detailProv}
          onClose={() => setDetailProv(null)}
          onEdit={() => { setEditTarget(detailProv); setDetailProv(null) }}
          onDelete={() => { openDelete(detailProv); setDetailProv(null) }}
        />
      )}

      {testTarget && (
        <ProviderTestModal provider={testTarget} apiBase="/api/ai-providers" onClose={() => setTestTarget(null)} />
      )}
      {meterTarget && (
        <MeterDrawer
          state={meterTarget}
          onClose={() => setMeterTarget(null)}
          onSave={handleMeterSave}
          onReset={() => setMeterResetConfirm(true)}
          saving={meterSaving}
          resetting={meterResetting}
        />
      )}
      {meterResetConfirm && meterTarget && (
        <ConfirmModal
          title="Reset meter period"
          message={<>Reset the current metering period for <strong>{meterTarget.item.name}</strong>? Usage counters will restart from now.</>}
          confirmLabel="Reset period"
          danger
          onClose={() => setMeterResetConfirm(false)}
          onConfirm={handleMeterReset}
          busy={meterResetting}
        />
      )}
      {toast && <Toast {...toast} />}
    </div>
  )
}

export default AiProvidersPage
