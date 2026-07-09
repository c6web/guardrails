import React from 'react'
import { Plus, Network, Trash2, Play } from '../components/ui/Icons'
import { Chip, DataTable, type ColumnDef } from '../components/ui'
import { getProviders, assignProvider, unassignProvider, setProviderDefault, updateProvider, setAiProviderAllowedModels, type AiProvider } from '../api/providers'
import { getAiProviders } from '../api/aiProviders'

import { PageHeader, Breadcrumbs, StatCard, StatRow, EmptyState, ErrorState, LoadingState, Drawer } from '../components/ui'
import { Toast, ConfirmModal, ProviderDetailDrawer, ProviderTestModal, ProviderFormModal, type ProviderFormData } from './components/ProviderShared'
import ActionCell from '../components/ui/ActionCell'

function getGroup(vendor: string): string {
  const v = vendor.toLowerCase()
  if (['openai', 'anthropic', 'google', 'aws', 'azure', 'mistral', 'groq', 'openrouter'].includes(v)) return 'Cloud Provider'
  if (['ollama', 'llamacpp', 'lmstudio', 'vllm'].includes(v)) return 'Local LLM'
  return 'Others (OpenAI Compatible)'
}

// ── Provider picker modal ──────────────────────────────────────────────────────

function UpstreamPickerModal({ assignedIds, onAssign, onClose }: {
  assignedIds: Set<string>
  onAssign: (provider: AiProvider) => Promise<void>
  onClose: () => void
}) {
  const [all, setAll]           = React.useState<AiProvider[]>([])
  const [search, setSearch]     = React.useState('')
  const [loading, setLoading]   = React.useState(true)
  const [assigning, setAssigning] = React.useState<string | null>(null)

  React.useEffect(() => {
    getAiProviders().then(setAll).finally(() => setLoading(false))
  }, [])

  const available = React.useMemo(() => {
    const pool = all.filter(p => !assignedIds.has(p.id))
    if (!search.trim()) return pool
    const q = search.toLowerCase()
    return pool.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.vendor.toLowerCase().includes(q) ||
      p.endpoint.toLowerCase().includes(q)
    )
  }, [all, assignedIds, search])

  async function handleAssign(provider: AiProvider) {
    setAssigning(provider.id)
    try { await onAssign(provider) } finally { setAssigning(null) }
  }

  const pickerColumns: ColumnDef<AiProvider>[] = React.useMemo(() => [
    {
      key: 'name',
      label: 'Name',
      render: (p) => <span style={{ fontWeight: 500, fontSize: 13 }}>{p.name}</span>,
    },
    {
      key: 'vendor',
      label: 'Vendor',
      render: (p) => <Chip kind="ok" mono>{p.vendor}</Chip>,
    },
    {
      key: 'model',
      label: 'Model',
      render: (p) => <Chip kind={p.model ? 'ok' : 'muted'} mono>{p.model || 'Default'}</Chip>,
    },
    {
      key: 'endpoint',
      label: 'Endpoint',
      render: (p) => <span className="mono" style={{ fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.endpoint}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (p) => (
        <>
          {p.status === 'healthy'   && <Chip kind="ok"   dot>healthy</Chip>}
          {p.status === 'degraded'  && <Chip kind="warn" dot>degraded</Chip>}
          {p.status === 'unhealthy' && <Chip kind="danger" dot>unhealthy</Chip>}
        </>
      ),
    },
    {
      key: 'action',
      label: '',
      width: 1,
      align: 'right',
      render: (p) => (
        <button className="btn btn-primary btn-sm"
          disabled={assigning === p.id}
          onClick={(e) => { e.stopPropagation(); handleAssign(p) }}>
          {assigning === p.id ? 'Adding\u2026' : <><Plus w={11} /> Add</>}
        </button>
      ),
    },
  ], [assigning, handleAssign])

  return (
    <Drawer
      title="Add to upstream pool"
      onClose={onClose}
      width={540}
      footer={
        <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>
          Register new AI providers on the <strong>AI Providers</strong> page.
        </div>
      }
    >
      <div style={{ padding: '12px 16px' }}>
        <input className="input" type="search" placeholder="Search AI providers\u2026"
          value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} autoFocus />
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {loading ? (
          <LoadingState />
        ) : (
          <DataTable
            columns={pickerColumns}
            data={available}
            rowKey={(p) => p.id}
            card={false}
            minWidth={480}
            emptyState={
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--fg-tertiary)', fontSize: 13 }}>
                {all.filter(p => !assignedIds.has(p.id)).length === 0
                  ? 'All registered AI providers are already in the upstream pool.'
                  : 'No providers match this search.'}
              </div>
            }
          />
        )}
      </div>
    </Drawer>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const UpstreamProvidersPage: React.FC<{}> = () => {
  const [providers, setProviders]         = React.useState<AiProvider[]>([])
  const [loading, setLoading]             = React.useState(true)
  const [loadError, setLoadError]         = React.useState<string | null>(null)
  const [busy, setBusy]                   = React.useState(false)

  const [search, setSearch]               = React.useState('')
  const [vendorFilter, setVendorFilter]   = React.useState<string>('all')
  const [statusFilter, setStatusFilter]   = React.useState<'all' | 'healthy' | 'degraded' | 'unhealthy'>('all')

  const [showPicker, setShowPicker]       = React.useState(false)
  const [editTarget, setEditTarget]       = React.useState<AiProvider | null>(null)
  const [unassignTarget, setUnassignTarget] = React.useState<AiProvider | null>(null)
  const [detailProv, setDetailProv]       = React.useState<AiProvider | null>(null)
  const [testTarget, setTestTarget]       = React.useState<AiProvider | null>(null)
  const [defaultingId, setDefaultingId]   = React.useState<string | null>(null)
  const [toast, setToast]                 = React.useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true); setLoadError(null)
    try { setProviders(await getProviders()) }
    catch (err) { setLoadError((err as Error).message || 'Failed to load') }
    finally { setLoading(false) }
  }, [])

  React.useEffect(() => { load() }, [load])
  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const assignedIds = React.useMemo(() => new Set(providers.map(p => p.id)), [providers])

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

  const grouped = React.useMemo(() => {
    const groups: Record<string, AiProvider[]> = {}
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

  const healthyCount = providers.filter(p => p.status === 'healthy').length
  const totalReqs = providers.reduce((s, p) => s + p.requests_24h, 0)
  const totalErrors = providers.reduce((s, p) => s + p.errors_24h, 0)

  async function handleAssign(provider: AiProvider) {
    await assignProvider(provider.id)
    await load()
    setToast({ msg: `${provider.name} added to upstream pool`, kind: 'ok' })
  }

  async function handleSetDefault(provider: AiProvider) {
    setDefaultingId(provider.id)
    try {
      await setProviderDefault(provider.id)
      await load()
      setToast({ msg: `${provider.name} set as default upstream provider`, kind: 'ok' })
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to set default', kind: 'err' })
    } finally { setDefaultingId(null) }
  }

  async function handleUnassign(provider: AiProvider) {
    setUnassignTarget(null)
    setBusy(true)
    try {
      await unassignProvider(provider.id)
      await load()
      setToast({ msg: `${provider.name} removed from upstream pool`, kind: 'ok' })
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to unassign', kind: 'err' })
    } finally { setBusy(false) }
  }

  async function handleEditSave(provider: AiProvider, data: ProviderFormData) {
    try {
      await updateProvider(provider.id, { name: data.name, vendor: data.vendor, endpoint: data.endpoint, api_key: data.api_key || undefined, notes: data.notes || undefined, model: (data.model as string).trim() || undefined, max_output_token: data.max_output_token !== null && data.max_output_token !== 0 ? Number(data.max_output_token) : undefined, max_input_token: data.max_input_token !== null && data.max_input_token !== 0 ? Number(data.max_input_token) : undefined, timeout_ms: data.timeout_ms })
      if (data.allowed_models?.length && data.default_model) {
        await setAiProviderAllowedModels(provider.id, data.allowed_models, data.default_model)
      }
      await load()
      setToast({ msg: `${data.name} updated`, kind: 'ok' })
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to update', kind: 'err' })
    } finally { setEditTarget(null) }
  }

  const columns: ColumnDef<AiProvider>[] = [
    {
      key: 'name',
      label: 'Name',
      render: (p) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {p.name}
          {p.is_default && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: 'var(--accent-subtle, #e8f0fe)', color: 'var(--accent)', border: '1px solid var(--accent)', lineHeight: '16px' }}>
              DEFAULT
            </span>
          )}
        </span>
      ),
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
      render: (p) => {
        const extras = p.allowed_models?.length ? p.allowed_models.length - 1 : 0
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Chip kind={p.model ? 'ok' : 'muted'} mono>{p.model || 'Default'}</Chip>
            {extras > 0 && (
              <span style={{ fontSize: 10, color: 'var(--fg-tertiary)', whiteSpace: 'nowrap' }}>+{extras} more</span>
            )}
          </div>
        )
      },
    },
    {
      key: 'endpoint',
      label: 'Endpoint',
      render: (p) => <span className="mono" style={{ fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.endpoint}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (p) => (
        <>
          {p.status === 'healthy'   && <Chip kind="ok"   dot>healthy</Chip>}
          {p.status === 'degraded'  && <Chip kind="warn" dot>degraded</Chip>}
          {p.status === 'unhealthy' && <Chip kind="danger" dot>unhealthy</Chip>}
        </>
      ),
    },
    {
      key: 'timeout',
      label: 'Timeout',
      render: (p) => <span className="mono" style={{ fontSize: 11 }}>{p.timeout_ms}ms</span>,
    },
    {
      key: 'requests',
      label: 'Requests (24h)',
      render: (p) => <span className="mono" style={{ fontSize: 11 }}>{p.requests_24h.toLocaleString()}</span>,
    },
    {
      key: 'errors',
      label: 'Errors (24h)',
      render: (p) => <span className="mono" style={{ fontSize: 11, color: p.errors_24h > 0 ? 'var(--danger)' : 'inherit' }}>{p.errors_24h}</span>,
    },
    {
      key: 'avg_latency',
      label: 'Avg Latency',
      render: (p) => <span className="mono" style={{ fontSize: 11 }}>{p.avg_latency_ms}ms</span>,
    },
    {
      key: 'action',
      label: 'Action',
      render: (p) => (
        <div className="row-tight" style={{ gap: 2 }} onClick={e => e.stopPropagation()}>
          <ActionCell actions={[
            { icon: <Play w={13} />, label: 'Test provider', onClick: () => setTestTarget(p) },
            { icon: <Trash2 w={14} />, label: 'Remove from upstream', danger: true, onClick: () => setUnassignTarget(p) },
          ]} />
          {!p.is_default && (
            <button className="icon-btn" title="Set as default"
              style={{ color: 'var(--fg-tertiary)', fontWeight: 700, fontSize: 14 }}
              disabled={defaultingId === p.id}
              onClick={() => handleSetDefault(p)}>
              {defaultingId === p.id ? 'Setting\u2026' : '\u2605'}
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="providers" />
      <PageHeader title="Upstream providers" subtitle="Assign LLM inference endpoints \u2014 OpenAI, Anthropic, Ollama, OpenRouter \u2014 as routes for gateway requests. Configure fallback order and monitor provider health and latency."
        actions={<button className="btn btn-primary" onClick={() => setShowPicker(true)}><Plus w={13} /> Add to upstream</button>} />

      {/* Stats */}
      <StatRow>
        <StatCard variant="compact" label="Assigned" value={providers.length} accent="var(--accent)" />
        <StatCard variant="compact" label="Healthy" value={healthyCount} />
        <StatCard variant="compact" label="Requests (24h)" value={totalReqs.toLocaleString()} />
        <StatCard variant="compact" label="Errors (24h)" value={totalErrors.toLocaleString()} />
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
        <input className="input" type="search" placeholder="Search name, vendor, endpoint\u2026"
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
          title={search || vendorFilter !== 'all' || statusFilter !== 'all'
            ? 'No providers match this filter.'
            : 'No providers assigned to upstream pool.'}
          action={!search && vendorFilter === 'all' && statusFilter === 'all' ? (
            <button className="btn btn-primary btn-sm" onClick={() => setShowPicker(true)}>
              <Plus w={12} /> Add first provider
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
                <DataTable
                  columns={columns}
                  data={rows}
                  rowKey={(p) => p.id}
                  onRowClick={(p) => setDetailProv(p)}
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

      {showPicker && (
        <UpstreamPickerModal
          assignedIds={assignedIds}
          onAssign={async (p) => { await handleAssign(p); setShowPicker(false) }}
          onClose={() => setShowPicker(false)}
        />
      )}
      {unassignTarget && (
        <ConfirmModal
          title="Remove from upstream"
          message={<>Remove <strong>{unassignTarget.name}</strong> from the upstream pool? The provider record will remain in AI Providers.</>}
          confirmLabel="Remove" danger
          onClose={() => setUnassignTarget(null)}
          onConfirm={() => handleUnassign(unassignTarget)}
          busy={busy}
        />
      )}
      {detailProv && (
        <ProviderDetailDrawer
          provider={detailProv}
          onClose={() => setDetailProv(null)}
          onEdit={() => { setEditTarget(detailProv); setDetailProv(null) }}
          onDelete={() => { setUnassignTarget(detailProv); setDetailProv(null) }}
          onSetDefault={async () => { await handleSetDefault(detailProv); setDetailProv(null) }}
        />
      )}
      {testTarget && (
        <ProviderTestModal provider={testTarget} apiBase="/api/providers" onClose={() => setTestTarget(null)} />
      )}
      {editTarget && (
        <ProviderFormModal
          initialProvider={{ id: editTarget.id, name: editTarget.name, vendor: editTarget.vendor, endpoint: editTarget.endpoint, api_key: editTarget.api_key || '', notes: editTarget.notes || '', model: editTarget.model || '', max_output_token: editTarget.max_output_token, max_input_token: editTarget.max_input_token }}
          onClose={() => setEditTarget(null)}
          onSave={async (data) => await handleEditSave(editTarget, data)}
          labels={{ createTitle: 'Register upstream provider', editTitle: 'Edit upstream provider', idPrefix: 'prov', submitCreate: 'Register provider' }}
        />
      )}
      {toast && <Toast {...toast} />}
    </div>
  )
}

export default UpstreamProvidersPage
