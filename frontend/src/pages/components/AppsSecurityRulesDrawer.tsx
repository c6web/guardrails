import React from 'react'
import { Chip, Badge, LoadingState, Drawer, Tabs, FormModal } from '../../components/ui'
import { Shield, Eye } from '../../components/ui/Icons'
import type { App as UIApp } from '../../types'
import type { AiProvider } from '../../api/providers'
import type { AppThreatKnowledgeItem, AppDetectorItem, AppToolGuardrailItem } from '../../types'

import { getAppThreatKnowledge, setAppThreatKnowledge, getAppDetectors, setAppDetectors, getAppToolGuardrails, setAppToolGuardrails } from '../../api/apps'

// ── Threat Knowledge Section ──────────────────────────────────────────────────

function ThreatKnowledgeSection({
  data,
  loaded,
  custom,
  originalLength,
  onToggle,
  onSelectAll,
  onReset,
}: {
  data: AppThreatKnowledgeItem[]
  loaded: boolean
  custom: boolean
  originalLength: number
  onToggle: (id: string) => void
  onSelectAll: (cat: string) => void
  onReset: () => void
}) {
  const [viewingTk, setViewingTk] = React.useState<AppThreatKnowledgeItem | null>(null)

  const sorted = React.useMemo(() => [...data].sort((a, b) => {
    const order: Record<string, number> = { active: 0, pending: 1, maintenance: 2 }
    const ao = order[a.status] ?? 3
    const bo = order[b.status] ?? 3
    if (ao !== bo) return ao - bo
    return a.name.localeCompare(b.name)
  }), [data])
  const selectable = sorted.filter(t => t.status !== 'pending')
  const allEnabled = selectable.length > 0 && selectable.every(t => t.enabled)

  if (!loaded) return <LoadingState message="Loading threat knowledge…" size="sm" />

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span className="label-strong" style={{ fontSize: 13 }}>Threat Knowledge</span>
        <Chip kind={custom ? 'warn' : 'ok'}>{custom ? `${sorted.filter(t => t.enabled).length} / ${originalLength} enabled` : 'All enabled'}</Chip>
        {custom && (
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={onReset}>Reset to default</button>
        )}
      </div>

      {/* Grid header */}
      <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 60px 38px', alignItems: 'center', gap: 6, padding: '6px 8px', fontSize: 10, color: 'var(--fg-tertiary)', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)' }}>
        <input type="checkbox" checked={allEnabled} onChange={() => onSelectAll('_all')} disabled={selectable.length === 0} style={{ cursor: selectable.length === 0 ? 'not-allowed' : 'pointer', margin: 0 }} />
        <span>Name</span>
        <span>Status</span>
        <span />
      </div>

      {/* All items in one list */}
      {sorted.map(item => {
        const isPending = item.status === 'pending'
        return (
          <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 60px 38px', alignItems: 'center', gap: 6, padding: '8px', borderBottom: '1px solid var(--border-subtle)', fontSize: 12, opacity: isPending ? 0.5 : 1 }}>
            <input type="checkbox" checked={item.enabled} onChange={() => !isPending && onToggle(item.id)} disabled={isPending} style={{ cursor: isPending ? 'not-allowed' : 'pointer', margin: 0 }} />
            <span style={{ fontWeight: 500 }}>{item.name}</span>
            <Chip kind={isPending ? 'muted' : item.status === 'active' ? 'ok' : 'muted'} mono>{item.status}</Chip>
            <button className="icon-btn" style={{ margin: 'auto' }} onClick={() => setViewingTk(item)} title="View details">
              <Eye w={13} />
            </button>
          </div>
        )
      })}

      {viewingTk && (
        <ThreatKnowledgeDetailModal item={viewingTk} onClose={() => setViewingTk(null)} />
      )}
    </div>
  )
}

function ThreatKnowledgeDetailModal({ item, onClose }: { item: AppThreatKnowledgeItem; onClose: () => void }) {
  return (
    <FormModal
      open
      title={item.name}
      onClose={onClose}
      zIndex={230}
      width={500}
      submitLabel="Close"
      onSubmit={(e) => { e.preventDefault(); onClose(); }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', fontWeight: 600, marginBottom: 3 }}>DESCRIPTION</div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--fg-primary)' }}>{item.description || '—'}</div>
        </div>

        {item.threat_context && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', fontWeight: 600, marginBottom: 3 }}>THREAT CONTEXT</div>
            <div style={{
              background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
              borderRadius: 6, padding: '10px 12px',
              fontSize: 12, fontFamily: 'monospace', lineHeight: 1.5,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              color: 'var(--fg-secondary)',
            }}>{item.threat_context}</div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', fontWeight: 600, marginBottom: 3 }}>STATUS</div>
            <Chip kind={item.status === 'active' ? 'ok' : 'muted'} mono>{item.status}</Chip>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', fontWeight: 600, marginBottom: 3 }}>SOURCE</div>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{item.source || '—'}</span>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', fontWeight: 600, marginBottom: 3 }}>ACTIVE</div>
            <span style={{ fontSize: 13, fontWeight: 500, color: item.enabled ? 'var(--ok, #76B400)' : 'var(--fg-tertiary)' }}>{item.enabled ? 'Yes' : 'No'}</span>
          </div>
        </div>
      </div>
    </FormModal>
  )
}

// ── Merged Detectors Section (unified per-rule toggles) ───────────────────────

function MergedDetectorsSection({
  inputDets,
  loadedInput,
  customInput,
  onToggle,
  onSelectAll,
  onReset,
}: {
  inputDets: AppDetectorItem[]
  loadedInput: boolean
  customInput: boolean
  onToggle: (id: string) => void
  onSelectAll: () => void
  onReset: () => void
}) {
  const [viewingDet, setViewingDet] = React.useState<AppDetectorItem | null>(null)

  if (!loadedInput) return <LoadingState message="Loading detectors…" size="sm" />

  const allEnabled = inputDets.length > 0 && inputDets.every(d => d.enabled)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span className="label-strong" style={{ fontSize: 13 }}>Scanners</span>
        <Chip kind="warn">prompt/response scanning</Chip>
        <Chip kind={customInput ? 'warn' : 'ok'}>{customInput ? 'Customized' : 'Default'}</Chip>
        {customInput && (
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={onReset}>Reset all</button>
        )}
      </div>

      {inputDets.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', textAlign: 'center', padding: 24 }}>
          No detectors configured. Create detectors in the Detectors page.
        </div>
      ) : (
        <>
          {/* Grid header */}
          <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 55px 55px 50px 55px 38px 38px', alignItems: 'center', gap: 6, padding: '6px 8px', fontSize: 10, color: 'var(--fg-tertiary)', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)' }}>
            <input type="checkbox" checked={allEnabled} onChange={onSelectAll} style={{ cursor: 'pointer', margin: 0 }} />
            <span>Detector</span>
            <span>Mode</span>
            <span>Type</span>
            <span>Threshold</span>
            <span>Scope</span>
            <span style={{ textAlign: 'center' }}>On</span>
            <span />
          </div>

          {/* Grid rows */}
          {inputDets.map(det => (
            <div key={det.id} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 55px 55px 50px 55px 38px 38px', alignItems: 'center', gap: 6, padding: '8px', borderBottom: '1px solid var(--border-subtle)', fontSize: 12 }}>
              <input type="checkbox" checked={det.enabled} onChange={() => onToggle(det.id)} style={{ cursor: 'pointer', margin: 0 }} />
              <span style={{ fontWeight: 500 }}>{det.name}</span>
              <Chip kind={det.mode === 'block' ? 'err' : det.mode === 'redact' ? 'warn' : 'info'} mono>{det.mode || 'block'}</Chip>
              <Chip kind="muted" mono>{det.rule_type}</Chip>
              <Chip kind="muted" mono>{det.threshold}</Chip>
              <span style={{ color: 'var(--fg-tertiary)', fontSize: 10 }}>{det.scanning_scope}</span>
              <button className={`filter-chip ${det.enabled ? 'active' : ''}`} style={{ fontSize: 10, padding: '2px 6px', margin: 'auto', cursor: 'pointer' }} onClick={() => onToggle(det.id)}>
                {det.enabled ? 'on' : 'off'}
              </button>
              <button className="icon-btn" style={{ margin: 'auto' }} onClick={() => setViewingDet(det)} title="View details">
                <Eye w={13} />
              </button>
            </div>
          ))}

          <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 8 }}>
            {inputDets.length} detector{inputDets.length !== 1 ? 's' : ''} configured
          </div>
        </>
      )}

      {viewingDet && (
        <DetectorDetailModal det={viewingDet} onClose={() => setViewingDet(null)} />
      )}
    </div>
  )
}

function DetectorDetailModal({ det, onClose }: { det: AppDetectorItem; onClose: () => void }) {
  const patterns = det.keywords && det.keywords.length > 0 ? det.keywords : null
  return (
    <FormModal
      open
      title={det.name}
      onClose={onClose}
      zIndex={230}
      width={480}
      submitLabel="Close"
      onSubmit={(e) => { e.preventDefault(); onClose(); }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', fontWeight: 600, marginBottom: 3 }}>DESCRIPTION</div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--fg-primary)' }}>{det.description || '—'}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', fontWeight: 600, marginBottom: 3 }}>MODE</div>
            <Chip kind={det.mode === 'block' ? 'err' : det.mode === 'redact' ? 'warn' : 'info'} mono>{det.mode}</Chip>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', fontWeight: 600, marginBottom: 3 }}>THRESHOLD</div>
            <Chip kind="muted" mono>{det.threshold}</Chip>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', fontWeight: 600, marginBottom: 3 }}>SCOPE</div>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{det.scanning_scope}</span>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', fontWeight: 600, marginBottom: 3 }}>RULE TYPE</div>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{det.rule_type}</span>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', fontWeight: 600, marginBottom: 3 }}>ACTIVE</div>
            <span style={{ fontSize: 13, fontWeight: 500, color: det.enabled ? 'var(--ok, #76B400)' : 'var(--fg-tertiary)' }}>{det.enabled ? 'Yes' : 'No'}</span>
          </div>
          {det.mode === 'redact' && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', fontWeight: 600, marginBottom: 3 }}>PLACEHOLDER</div>
              <span style={{ fontSize: 13, fontWeight: 500, fontFamily: 'monospace' }}>{det.redaction_placeholder || '[REDACTED]'}</span>
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', fontWeight: 600, marginBottom: 3 }}>
            PATTERN{patterns && patterns.length > 1 ? 'S' : ''} ({det.rule_type})
          </div>
          {patterns ? patterns.map((p, i) => (
            <div key={i} style={{
              background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
              borderRadius: 6, padding: '8px 10px', marginBottom: 4,
              fontSize: 11, fontFamily: 'monospace', lineHeight: 1.5,
              wordBreak: 'break-all', color: 'var(--fg-secondary)',
            }}>{p}</div>
          )) : (
            <div style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>No patterns defined</div>
          )}
        </div>
      </div>
    </FormModal>
  )
}

// ── Tool Guardrails Section ───────────────────────────────────────────────────

function ToolGuardrailsSection({
  data,
  loaded: _loaded,
  custom,
  blockedCount,
  onToggle,
  onToggleAll,
  onReset,
}: {
  data: AppToolGuardrailItem[]
  loaded: boolean
  custom: boolean
  blockedCount: number
  onToggle: (id: string) => void
  onToggleAll: () => void
  onReset: () => void
}) {
  const sorted = React.useMemo(() => [...data].sort((a, b) => a.tool_name.localeCompare(b.tool_name)), [data])
  const allBlocked = sorted.length > 0 && sorted.every(t => t.blocked)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span className="label-strong" style={{ fontSize: 13 }}>Tool Guardrails</span>
        <Badge kind="warn">tool blocking</Badge>
        <Badge kind={custom ? 'warn' : 'ok'}>
          {custom
            ? `${blockedCount} blocked`
            : 'Default (none blocked)'}
        </Badge>
        {custom && (
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={onReset}>Reset</button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', textAlign: 'center', padding: 24 }}>
          No tool guardrails defined. Add tools in Govern → Tool Guardrails.
        </div>
      ) : (
         <>
            {/* Grid header */}
            <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 1fr', alignItems: 'center', gap: 6, padding: '6px 8px', fontSize: 10, color: 'var(--fg-tertiary)', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)' }}>
              <input type="checkbox" checked={allBlocked} onChange={onToggleAll} style={{ cursor: 'pointer', margin: 0 }} />
              <span>Tool</span>
              <span>Description</span>
            </div>

            {/* Grid rows */}
            {sorted.map(tool => (
              <div key={tool.id} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 1fr', alignItems: 'center', gap: 6, padding: '8px', borderBottom: '1px solid var(--border-subtle)', fontSize: 12 }}>
                <input type="checkbox" checked={tool.blocked} onChange={() => onToggle(tool.id)} style={{ cursor: 'pointer', margin: 0 }} />
                <span style={{ fontWeight: 500 }}>{tool.tool_name}</span>
                <span title={tool.description ?? undefined} style={{ color: 'var(--fg-tertiary)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tool.description || '—'}</span>
              </div>
            ))}

          <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 8 }}>
            {sorted.length} tool{sorted.length !== 1 ? 's' : ''} available
          </div>
        </>
      )}
    </div>
  )
}

// ── Security Rules Drawer ─────────────────────────────────────────────────────

type SecTab = 'threat' | 'detectors' | 'guardrails'

export function AppsSecurityRulesDrawer({ app: a, open, providerMap: _providerMap, onClose }: {
  app: UIApp; open?: boolean; providerMap: Map<string, AiProvider>
  onClose: () => void
}) {
  const [tab, setTab] = React.useState<SecTab>('detectors')

  // Threat knowledge state
  const [threatKbLoaded, setThreatKbLoaded] = React.useState(false)
  const [threatKbData, setThreatKbData] = React.useState<AppThreatKnowledgeItem[]>([])
  const [threatKbCustom, setThreatKbCustom] = React.useState(false)
  const [_threatKbDirty, setThreatKbDirty] = React.useState(false)
  const [threatKbOriginal, setThreatKbOriginal] = React.useState<AppThreatKnowledgeItem[]>([])

  // Detectors state
  const [detectorsLoaded, setDetectorsLoaded] = React.useState(false)
  const [detectorData, setDetectorData] = React.useState<AppDetectorItem[]>([])
  const [detectorsCustom, setDetectorsCustom] = React.useState(false)
  const [_detectorsDirty, setDetectorsDirty] = React.useState(false)
  const [detectorsOriginal, setDetectorsOriginal] = React.useState<AppDetectorItem[]>([])

  // Tool guardrails state
  const [toolGuardrailsLoaded, setToolGuardrailsLoaded] = React.useState(false)
  const [toolGuardrailData, setToolGuardrailData] = React.useState<AppToolGuardrailItem[]>([])
  const [toolGuardrailsCustom, setToolGuardrailsCustom] = React.useState(false)
  const [_toolGuardrailsDirty, setToolGuardrailsDirty] = React.useState(false)
  const [toolGuardrailsOriginal, setToolGuardrailsOriginal] = React.useState<AppToolGuardrailItem[]>([])

  function loadThreatKnowledge() {
    getAppThreatKnowledge(a.id).then(res => {
      setThreatKbData(res.data)
      setThreatKbOriginal([...res.data])
      setThreatKbCustom(res.isCustom)
      setThreatKbLoaded(true)
    }).catch(() => {}).finally(() => setThreatKbLoaded(true))
  }

  function loadDetectors() {
    getAppDetectors(a.id).then(res => {
      setDetectorData(res.data)
      setDetectorsOriginal([...res.data])
      setDetectorsCustom(res.isCustom)
      setDetectorsLoaded(true)
    }).catch(() => {}).finally(() => setDetectorsLoaded(true))
  }

  function loadToolGuardrails() {
    getAppToolGuardrails(a.id).then(res => {
      setToolGuardrailData(res.data)
      setToolGuardrailsOriginal([...res.data])
      setToolGuardrailsCustom(res.isCustom)
      setToolGuardrailsLoaded(true)
    }).catch(() => {}).finally(() => setToolGuardrailsLoaded(true))
  }

  React.useEffect(() => {
    if (tab === 'threat' && !threatKbLoaded) loadThreatKnowledge()
    if (tab === 'detectors' && !detectorsLoaded) loadDetectors()
    if (tab === 'guardrails' && !toolGuardrailsLoaded) loadToolGuardrails()
  }, [tab])

  return (
    <>
      <Drawer
        open={open}
        title={
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield w={14} style={{ color: 'var(--accent)' }} />
              <span style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 2 }}>Security Rules</div>
          </>
        }
        onClose={onClose}
        footer={
          <>
            {tab === 'threat' && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => {
                  setThreatKbData([...threatKbOriginal])
                  setThreatKbDirty(false)
                  onClose()
                }}>Cancel</button>
                <div style={{ flex: 1 }} />
                <button className="btn btn-primary" onClick={() => {
                  const selectedIds = threatKbData.filter(t => t.enabled).map(t => t.id)
                  setAppThreatKnowledge(a.id, selectedIds.length === threatKbOriginal.length ? null : selectedIds)
                  setThreatKbCustom(selectedIds.length !== threatKbOriginal.length)
                  setThreatKbDirty(false)
                  setThreatKbLoaded(false)
                  loadThreatKnowledge()
                }}>
                  Save Changes
                </button>
              </>
            )}
            {tab === 'detectors' && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => {
                  setDetectorData([...detectorsOriginal])
                  setDetectorsDirty(false)
                  onClose()
                }}>Cancel</button>
                <div style={{ flex: 1 }} />
                <button className="btn btn-primary" onClick={() => {
                  const detSelectedIds = detectorData.filter(d => d.enabled).map(d => d.id)
                  setAppDetectors(a.id, detSelectedIds.length === detectorsOriginal.length ? null : detSelectedIds)
                  setDetectorsCustom(detSelectedIds.length !== detectorsOriginal.length)
                  setDetectorsDirty(false)
                  setDetectorsLoaded(false)
                  loadDetectors()
                }}>
                  Save Changes
                </button>
              </>
            )}
            {tab === 'guardrails' && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => {
                  setToolGuardrailData([...toolGuardrailsOriginal])
                  setToolGuardrailsDirty(false)
                  onClose()
                }}>Cancel</button>
                <div style={{ flex: 1 }} />
                <button className="btn btn-primary" onClick={() => {
                  const blockedIds = toolGuardrailData.filter(t => t.blocked).map(t => t.id)
                  setAppToolGuardrails(a.id, blockedIds.length > 0 ? blockedIds : null)
                  setToolGuardrailsCustom(blockedIds.length > 0)
                  setToolGuardrailsDirty(false)
                  setToolGuardrailsLoaded(false)
                  loadToolGuardrails()
                }}>
                  Save Changes
                </button>
              </>
            )}
          </>
        }
      >
        <Tabs tabs={[
          { key: 'detectors', label: 'Detectors' },
          { key: 'threat', label: 'Threat Knowledge' },
          { key: 'guardrails', label: 'Tool Guardrails' },
        ]} activeKey={tab} onChange={setTab} />
        <div style={{ padding: '16px 20px' }}>

        {tab === 'threat' && (
          <ThreatKnowledgeSection
            data={threatKbData}
            loaded={threatKbLoaded}
            custom={threatKbCustom}
            originalLength={threatKbOriginal.length}
            onToggle={(id) => {
              setThreatKbData(prev => prev.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t))
              setThreatKbDirty(true)
            }}
            onSelectAll={(cat) => {
              if (cat !== '_all') return
              const allEnabled = threatKbData.every(t => t.enabled)
              setThreatKbData(prev => prev.map(t => ({ ...t, enabled: !allEnabled })))
              setThreatKbDirty(true)
            }}
            onReset={() => {
              setAppThreatKnowledge(a.id, null)
              setThreatKbCustom(false)
              setThreatKbDirty(false)
              setThreatKbLoaded(false)
              loadThreatKnowledge()
            }}
          />
        )}

        {tab === 'detectors' && (
          <MergedDetectorsSection
            inputDets={detectorData}
            loadedInput={detectorsLoaded}
            customInput={detectorsCustom}
            onToggle={(id) => {
              setDetectorData(prev => prev.map(d => d.id === id ? { ...d, enabled: !d.enabled } : d))
              setDetectorsDirty(true)
            }}
            onSelectAll={() => {
              const allEnabled = detectorData.every(d => d.enabled)
              setDetectorData(prev => prev.map(d => ({ ...d, enabled: !allEnabled })))
              setDetectorsDirty(true)
            }}
            onReset={() => {
              setAppDetectors(a.id, null)
              setDetectorsCustom(false)
              setDetectorsDirty(false)
              setDetectorsLoaded(false)
              loadDetectors()
            }}
          />
        )}

        {tab === 'guardrails' && (
          <ToolGuardrailsSection
            data={toolGuardrailData}
            loaded={toolGuardrailsLoaded}
            custom={toolGuardrailsCustom}
            blockedCount={toolGuardrailData.filter(t => t.blocked).length}
            onToggle={(id) => {
              setToolGuardrailData(prev => prev.map(t => t.id === id ? { ...t, blocked: !t.blocked } : t))
              setToolGuardrailsDirty(true)
            }}
            onToggleAll={() => {
              const allBlocked = toolGuardrailData.every(t => t.blocked)
              setToolGuardrailData(prev => prev.map(t => ({ ...t, blocked: !allBlocked })))
              setToolGuardrailsDirty(true)
            }}
            onReset={() => {
              setAppToolGuardrails(a.id, null)
              setToolGuardrailsCustom(false)
              setToolGuardrailsDirty(false)
              setToolGuardrailsLoaded(false)
              loadToolGuardrails()
            }}
          />
        )}
      </div>
      </Drawer>
    </>
  )
}
