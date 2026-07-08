import React from 'react'

import { useFrameworks, FrameworkProvider } from '../context/FrameworkContext'
import { fmtTs, fmtDateTime } from '../utils/format'
import { Drawer, PageHeader, Breadcrumbs, OwaspPill, Chip, ShieldCheck, CodeBlock, StatCard, KV, FilterBar, ProgressBar, Timeline, FormModal } from '../components/ui'
import JsonPayload from '../components/ui/JsonPayload'
import { Download, Pause, Play, Filter, AlertTri } from '../components/ui/Icons'
import { getTrafficLogs, getTrafficStats, type TrafficStats } from '../api/logs'
import { createIncident } from '../api/incidents'
import { getApps } from '../api/apps'
import type { App, PipelineTrace, TweakValues, TrafficRow } from '../types'
import { ThreatKnowledgeTab } from './components/AIActivitiesShared'
import { ScannerBadge } from '../components/ui'

interface TrafficPageProps {
  tweaks: TweakValues;
}

function DetectorList({ req }: { req: TrafficRow }) {
  const stages = req.pipelineTrace?.stages ?? []

  // Collect all detectors_evaluated entries from pipeline stages
  const evaluatedRows = stages.flatMap(s =>
    (s.detectors_evaluated ?? []).map(d => ({ ...d, stage: s.stage }))
  )

  if (!req.pipelineTrace) {
    return (
      <div className="caption" style={{ padding: 14 }}>
        No detectors ran — request blocked before reaching the detection pipeline.
      </div>
    )
  }

  // No stages had detectors_evaluated — pre-gateway-change log
  if (evaluatedRows.length === 0 && !stages.some(s => s.detectors_evaluated)) {
    return (
      <div className="caption" style={{ padding: 14 }}>
        Per-detector results not recorded for this request.
      </div>
    )
  }

  // Explicitly empty array — app has detectors_custom with no selections
  const explicitEmpty = stages.some(s => s.detectors_evaluated && s.detectors_evaluated.length === 0)
  if (explicitEmpty && evaluatedRows.length === 0) {
    return (
      <div className="caption" style={{ padding: 14 }}>
        No detector rules selected for this app — 0 detectors evaluated.
      </div>
    )
  }

  return (
    <div className="t-wrap">
      <table className="t" style={{ fontSize: 12 }}>
        <thead>
          <tr><th>detector</th><th>framework</th><th>mode</th><th>outcome</th></tr>
        </thead>
        <tbody>
          {evaluatedRows.map(d => (
            <tr key={d.id} style={d.outcome === "hit" ? { background: 'var(--danger-bg)' } : {}}>
              <td className="mono">{d.name}</td>
              <td>{d.framework_id ? <OwaspPill id={d.framework_id} /> : <span className="caption">—</span>}</td>
              <td><span style={{ fontSize: 10, color: d.mode === 'block' ? 'var(--danger)' : 'var(--warning)', fontWeight: 600, textTransform: 'uppercase' }}>{d.mode}</span></td>
              <td>{d.outcome === "hit" ? <Chip kind="err" dot>hit</Chip> : <Chip kind="ok" dot>pass</Chip>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TimelineList({ req }: { req: TrafficRow }) {
  function renderPipelineTrace(trace: PipelineTrace) {
    return trace.stages.map((s, _i) => {
      const decision = s.decision?.toLowerCase() ?? ''
      const isHit = decision === 'attack' || decision === 'match' || decision === 'block'
      const noteParts: string[] = []
      if (s.matches?.length) {
        noteParts.push(s.matches.map(m => m.name).join(', '))
      }
      if (s.provider) noteParts.push(`provider: ${s.provider}`)
      if (s.category) noteParts.push(`category: ${s.category}`)
      if (s.reason) noteParts.push(s.reason)
      if (s.threshold != null) noteParts.push(`threshold: ${(s.threshold * 100).toFixed(0)}%`)
      if (s.enforced) noteParts.push('enforced')
      if (s.would_block) noteParts.push('would_block')
      return { time: `+${s.ms}ms`, label: s.stage.toUpperCase(), detail: noteParts.join(' · '), hit: isHit }
    })
  }

  const events = req.pipelineTrace ? renderPipelineTrace(req.pipelineTrace) : [
    { time: '+0ms', label: 'INGRESS', detail: `${req.src}`, hit: false },
    { time: '+0ms', label: 'BLOCKED', detail: req.threatTitle ?? "blocked before reaching the detection pipeline", hit: true },
    { time: `+${req.ms}ms`, label: 'EGRESS', detail: `${req.code} · ${req.ms}ms wall`, hit: false },
  ]
  return <Timeline events={events} variant="compact" timeWidth={60} />
}

function ContentQualityTab({ req }: { req: TrafficRow }) {
  if (!req.contentQualityScanned) {
    return (
      <div className="caption" style={{ padding: 14 }}>
        No content quality scan ran for this request — either the app doesn't have Content Quality Scan enabled, or generation failed before a scan could run.
      </div>
    )
  }

  const actionKind = req.contentQualityAction === 'blocked' ? 'err'
    : req.contentQualityAction === 'redacted' ? 'warn'
    : req.contentQualityAction === 'flagged' ? 'warn'
    : req.contentQualityAction === 'monitored' ? 'info'
    : 'ok'

  function scoreRow(label: string, value: number | null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--fg-tertiary)', width: 110, flexShrink: 0 }}>{label}</span>
        {value == null ? (
          <span className="caption">—</span>
        ) : (
          <>
            <div style={{ flex: 1 }}>
              <ProgressBar value={Math.round(value * 100)} height={6} color={value >= 0.7 ? 'var(--ok)' : value >= 0.4 ? 'var(--warn)' : 'var(--danger)'} />
            </div>
            <span className="mono" style={{ fontSize: 12, width: 40, textAlign: 'right' }}>{(value * 100).toFixed(0)}%</span>
          </>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="label-strong" style={{ marginBottom: 10 }}>Scores</div>
      {scoreRow('Groundedness', req.contentQualityGroundedness)}
      {scoreRow('Relevance', req.contentQualityRelevance)}
      {scoreRow('Hallucination', req.contentQualityHallucination)}

      <div className="label-strong" style={{ marginTop: 16, marginBottom: 6 }}>Outcome</div>
      <div className="row-tight" style={{ gap: 6, marginBottom: 10 }}>
        <Chip kind={req.contentQualityFlagged ? 'warn' : 'ok'} dot>{req.contentQualityFlagged ? 'flagged' : 'passed'}</Chip>
        {req.contentQualityAction && <Chip kind={actionKind} mono>{req.contentQualityAction}</Chip>}
      </div>
      {req.contentQualityReason && (
        <div className="card" style={{ padding: 12, background: 'var(--bg-sunken)' }}>
          <div className="caption" style={{ marginBottom: 4 }}>Judge reason</div>
          <div style={{ fontSize: 13 }}>{req.contentQualityReason}</div>
        </div>
      )}
    </>
  )
}

function IncidentModal({ req, onClose, onCreated }: { req: TrafficRow; onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle]       = React.useState(req.threat?.title || '')
  const [severity, setSeverity] = React.useState('high')
  const [desc, setDesc]         = React.useState(req.threat?.excerpt || '')
  const [notes, setNotes]       = React.useState('')
  const [saving, setSaving]     = React.useState(false)
  const [err, setErr]           = React.useState('')

  async function handleCreate() {
    if (!title.trim()) { setErr('Title is required'); return }
    setSaving(true)
    try {
      const incident = await createIncident({
        title:             title.trim(),
        severity,
        framework_id:      req.threat?.framework_id || null,
        description:       desc || null,
        source_request_id: req.id || null,
        affected_app_id:   req.app || null,
        affected_app_name: req.appName || null,
        source_ip:         req.src || null,
        detector:          req.threat?.detector || null,
        confidence:        req.threat?.confidence ?? null,
        notes:             notes || null,
      })
      onCreated(incident.id)
    } catch {
      setErr('Failed to create incident')
    }
    setSaving(false)
  }

  return (
    <FormModal
      title={<><AlertTri w={16} style={{ color: 'var(--warning)', verticalAlign: 'middle', marginRight: 8 }} /> Create incident</>}
      onSubmit={handleCreate}
      onClose={onClose}
      busy={saving}
      submitLabel="Create incident"
      busyLabel="Creating…"
      width={480}
      zIndex={200}
    >
      {req.flag && req.threat ? (
        <div style={{ padding: '8px 12px', borderRadius: 4, background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', marginBottom: 14, fontSize: 12 }}>
          <div className="caption" style={{ marginBottom: 2 }}>Linked threat event</div>
          <div style={{ fontWeight: 500 }}>{req.id}</div>
          <div style={{ color: 'var(--fg-tertiary)' }}>{req.appName} · {req.threat.framework_id} · {req.src}</div>
        </div>
      ) : (
        <div style={{ padding: '8px 12px', borderRadius: 4, background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', marginBottom: 14, fontSize: 12 }}>
          <div className="caption" style={{ marginBottom: 2 }}>Linked request</div>
          <div style={{ fontWeight: 500 }}>{req.id}</div>
          <div style={{ color: 'var(--fg-tertiary)' }}>{req.appName} · {req.path} · {req.src}</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div className="label" style={{ marginBottom: 4 }}>Title *</div>
          <input
            style={{ width: '100%', height: 32, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 4, background: 'var(--bg-surface)', color: 'var(--fg-primary)', fontSize: 13, boxSizing: 'border-box' }}
            value={title} onChange={e => setTitle(e.target.value)} placeholder="Incident title…"
          />
        </div>

        <div>
          <div className="label" style={{ marginBottom: 4 }}>Severity</div>
          <select className="select" value={severity} onChange={e => setSeverity(e.target.value)} style={{ width: '100%' }}>
            <option value="crit">Critical</option>
            <option value="high">High</option>
            <option value="med">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        <div>
          <div className="label" style={{ marginBottom: 4 }}>Description</div>
          <textarea
            style={{ width: '100%', height: 72, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 4, background: 'var(--bg-surface)', color: 'var(--fg-primary)', fontSize: 12, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'var(--font-ui)' }}
            value={desc} onChange={e => setDesc(e.target.value)} placeholder="What happened?"
          />
        </div>

        <div>
          <div className="label" style={{ marginBottom: 4 }}>Notes</div>
          <textarea
            style={{ width: '100%', height: 64, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 4, background: 'var(--bg-surface)', color: 'var(--fg-primary)', fontSize: 12, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'var(--font-ui)' }}
            value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional context…"
          />
        </div>

        {err && <div className="caption" style={{ color: 'var(--danger)' }}>{err}</div>}
      </div>
    </FormModal>
  )
}

function RequestDrawer({ req, open, onClose, onOpenIncident }: { req: TrafficRow; open?: boolean; onClose: () => void; onOpenIncident?: () => void }) {
  const [activeTab, setActiveTab] = React.useState("overview")
  const frameworks = useFrameworks()

  function fwDesc(id: string | null): string {
    if (!id || !frameworks) return ''
    const fw = frameworks[id]
    return fw ? fw.description : ''
  }

  return (
    <Drawer
      open={open}
      title={
        <div>
          <div className="crumbs" style={{ marginBottom: 4 }}>
            <span>Request</span>
            <span className="sep">/</span>
            <span className="mono here">{req.id}</span>
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, letterSpacing: "-0.01em" }}>
            {req.flag && req.threat ? req.threat.title : "Request passed all detectors"}
          </div>
          <div className="row-tight" style={{ marginTop: 6, gap: 6, flexWrap: "wrap" }}>
            {req.flag && req.threat && <OwaspPill id={req.threat.framework_id} withName />}
            <Chip kind={req.code === 200 ? "ok" : req.code === 403 ? "err" : "warn"} mono>HTTP {req.code}</Chip>
            <Chip kind="muted" mono>{req.method}</Chip>
            {req.cacheHit && <Chip kind="info" mono>cache · {req.cacheTier ?? '?'}</Chip>}
            <span className="caption">{fmtDateTime(req.ts)}</span>
          </div>
        </div>
      }
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost">Copy as cURL</button>
          {req.flag && <button className="btn btn-primary" onClick={() => onOpenIncident?.()}>Open incident</button>}
        </>
      }
    >
      <div className="tabs" style={{ padding: "0 20px" }}>
        {["overview", "payload", "detectors", "timeline", "threatknowledge", "content-quality"].map(t => (
          <div key={t} className={`tab ${activeTab === t ? "active" : ""}`} onClick={() => setActiveTab(t)}>
            {t === 'threatknowledge' ? 'Threat Knowledge' : t === 'content-quality' ? 'Content Quality' : t[0].toUpperCase() + t.slice(1)}
          </div>
        ))}
      </div>

      <div style={{ padding: '16px 20px' }}>
        {activeTab === "overview" && (
          <>
            <div className="label-strong" style={{ marginBottom: 6 }}>Identity</div>
            <KV rows={[
              { label: 'request', value: req.id },
              { label: 'app', value: req.appName ?? req.app },
              { label: 'path', value: req.path },
              { label: 'source ip', value: req.src },
              { label: 'tokens', value: `${req.tokensIn} in · ${req.tokensOut} out` },
              { label: 'duration', value: `${req.ms} ms` },
            ]} style={{ marginBottom: 14 }} />

            <div className="label-strong" style={{ marginBottom: 6 }}>Verdict</div>
            {req.flag && req.threat ? (
              <div className="card" style={{ padding: 14, borderColor: "var(--danger)", borderWidth: 1, background: "var(--danger-bg)" }}>
                <div className="row-tight" style={{ marginBottom: 8 }}>
                  <span className="dot-sev crit pulse" />
                  <span style={{ fontWeight: 600 }}>{req.threat.title}</span>
                </div>
                <div className="caption" style={{ marginBottom: 8 }}>{fwDesc(req.threat.framework_id)}</div>
                <div className="row-tight" style={{ flexWrap: "wrap", gap: 6 }}>
                  <OwaspPill id={req.threat.framework_id} withName />
                  <Chip kind="err" mono>{req.threat.detector}</Chip>
                  <Chip kind="muted" mono>confidence {(req.threat.confidence * 100).toFixed(0)}%</Chip>
                </div>
              </div>
            ) : req.code >= 400 ? (
              <div className="card" style={{ padding: 14, borderColor: "var(--danger)", background: "var(--danger-bg)" }}>
                <div className="row-tight">
                  <AlertTri w={16} style={{ color: "var(--danger)" }} />
                  <span style={{ fontWeight: 600 }}>Error · HTTP {req.code}</span>
                </div>
                <div className="caption" style={{ marginTop: 6 }}>Request did not complete successfully — upstream or gateway returned an error response.</div>
              </div>
            ) : req.pipelineTrace ? (
              <div className="card" style={{ padding: 14, borderColor: "var(--accent)", background: "var(--success-bg)" }}>
                <div className="row-tight">
                  <ShieldCheck w={16} style={{ color: "var(--accent)" }} />
                  <span style={{ fontWeight: 600 }}>Allowed · {req.pipelineTrace.stages.length} layer{req.pipelineTrace.stages.length !== 1 ? 's' : ''} checked</span>
                </div>
                <div className="caption" style={{ marginTop: 6 }}>
                  {(() => {
                    const stageNames: Record<string, string> = { keyword_regex: 'keyword', semantic: 'semantic', llm_classify: 'classifier', t2_intent_analysis: 'T2 intent', cache_lookup: 'cache' }
                    const present = req.pipelineTrace!.stages.filter(s => s.decision !== 'skipped' && s.stage !== 'cache_lookup').map(s => stageNames[s.stage] ?? s.stage)
                    if (present.length === 0) return 'No scan layers were active for this request.'
                    const last = present.pop()!
                    return `No matches across ${present.length ? present.join(', ') + ' and ' : ''}${last} layers. Forwarded to upstream.`
                  })()}
                </div>
              </div>
            ) : (
              <div className="card" style={{ padding: 14, borderColor: "var(--border-subtle)", background: "var(--bg-secondary)" }}>
                <div className="row-tight">
                  <AlertTri w={16} style={{ color: "var(--fg-tertiary)" }} />
                  <span style={{ fontWeight: 600 }}>Blocked — {req.threatTitle ?? 'request blocked'}</span>
                </div>
                <div className="caption" style={{ marginTop: 6 }}>Request did not reach the detection pipeline; no detectors ran.</div>
              </div>
            )}
          </>
        )}

        {activeTab === "payload" && (
          <>
            <div className="label-strong" style={{ marginBottom: 6 }}>Input (extracted text)</div>
            <CodeBlock>
              {req.userPrompt || req.threat?.excerpt || '(empty)'}
            </CodeBlock>
            <JsonPayload data={req.rawInputPayload} label="Raw Input Payload" />
            <div className="label-strong" style={{ marginBottom: 6 }}>Output</div>
            <CodeBlock>
              {req.flag && req.threat ? (
                <span className="red">// response replaced by gateway — {req.threat.detector}</span>
              ) : (
                req.responseBody || '(empty)'
              )}
            </CodeBlock>
            <JsonPayload data={req.rawOutputPayload} label="Raw Output Payload" />
          </>
        )}

        {activeTab === "detectors" && <DetectorList req={req} />}
        {activeTab === "timeline" && <TimelineList req={req} />}
        {activeTab === "threatknowledge" && <ThreatKnowledgeTab row={req} />}
        {activeTab === "content-quality" && <ContentQualityTab req={req} />}
      </div>
    </Drawer>
  )
}

const COLUMN_DEFS = [
  { id: 'time', label: 'Time', width: 90, visible: true },
  { id: 'method', label: 'Method', width: 70, visible: true },
  { id: 'status', label: 'Status', width: 70, visible: true },
  { id: 'app', label: 'App · Path', visible: true },
  { id: 'source', label: 'Source', visible: true },
  { id: 'userAgent', label: 'User Agent', visible: true },
  { id: 'in', label: 'In', width: 56, visible: true },
  { id: 'out', label: 'Out', width: 56, visible: true },
  { id: 'ms', label: 'Ms', width: 64, visible: true },
  { id: 'verdict', label: 'Verdict', visible: true },
]

const TrafficPageContent: React.FC<TrafficPageProps> = () => {
  const [rows, setRows] = React.useState<TrafficRow[]>([])
  const [paused, setPaused] = React.useState(false)
  const [selected, setSelected] = React.useState<TrafficRow | null>(null)
  const [incidentModal, setIncidentModal] = React.useState<TrafficRow | null>(null)
  const [filterFlag, setFilterFlag] = React.useState("all")
  const [filterMethod, setFilterMethod] = React.useState("all")
  const [filterApp, setFilterApp] = React.useState("all")
  const [filterApps, setFilterApps] = React.useState<App[]>([])
  const [columns, setColumns] = React.useState(COLUMN_DEFS)
  const [showColumnMenu, setShowColumnMenu] = React.useState(false)
  const [stats, setStats] = React.useState<TrafficStats | null>(null)
  const [statsLoading, setStatsLoading] = React.useState(true)

  // Initial load
  React.useEffect(() => {
    getTrafficLogs({ limit: 50 }).then(r => setRows(r.rows)).catch(console.error)
    getApps().then(setFilterApps).catch(console.error)
  }, [])

  React.useEffect(() => {
    setStatsLoading(true)
    getTrafficStats({
      flagged: filterFlag === 'flagged' ? true : filterFlag === 'clean' ? false : undefined,
      app_id: filterApp === 'all' ? undefined : filterApp,
    }).then(setStats).catch(console.error).finally(() => setStatsLoading(false))
  }, [filterFlag, filterApp])

  // Poll for new rows when not paused
  React.useEffect(() => {
    if (paused) return
    const t = setInterval(() => {
      getTrafficLogs({ limit: 10 }).then(r => {
        setRows(prev => {
          const existingIds = new Set(prev.map(x => x.id))
          const fresh = r.rows.filter(x => !existingIds.has(x.id))
          return [...fresh, ...prev].slice(0, 80)
        })
      }).catch(() => {})
    }, 5000)
    return () => clearInterval(t)
  }, [paused])

  const filtered = rows.filter(r => {
    if (filterFlag === "flagged" && !r.flag) return false
    if (filterFlag === "clean" && r.flag) return false
    if (filterMethod !== "all" && r.method !== filterMethod) return false
    if (filterApp !== "all" && r.app !== filterApp) return false
    return true
  })

  const flaggedCount = rows.filter(r => r.flag).length
  const avgMs = Math.round(rows.reduce((s, r) => s + r.ms, 0) / Math.max(1, rows.length))

  const toggleColumn = (id: string) => {
    setColumns(cols => cols.map(c => c.id === id ? { ...c, visible: !c.visible } : c))
  }

  const exportNdjson = () => {
    const ndjson = filtered.map(r => JSON.stringify(r)).join('\n')
    const blob = new Blob([ndjson], { type: 'application/x-ndjson' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `traffic-export-${new Date().toISOString().split('T')[0]}.ndjson`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page fade-in" style={{ paddingBottom: 24 }}>
      <Breadcrumbs pageId="traffic" />
      <PageHeader title="Live request stream" subtitle={<><span>Inspect every LLM request flowing through the gateway in real time — filter by app, detector, or verdict, review prompt/response pairs, create incidents from suspicious traffic, and view detailed pipeline traces.<br /></span><span className="mono">{rows.length}</span><span> in window · {flaggedCount} flagged · avg </span><span className="mono">{avgMs} ms</span>.</>}
        actions={<><button className="btn btn-ghost" onClick={exportNdjson}><Download w={13} /> Export NDJSON</button><button className={`btn ${paused ? "btn-secondary" : "btn-primary"}`} onClick={() => setPaused(p => !p)}>{paused ? <><Play w={13} /> Resume</> : <><Pause w={13} /> Pause</>}</button></>} />

      {/* KPI row */}
      <div className="kpi-row">
        <StatCard label="Requests" loading={statsLoading} value={(stats?.total ?? 0).toLocaleString()} />
        <StatCard
          label="Blocked / flagged"
          tone="danger"
          loading={statsLoading}
          value={(stats?.blocked_flagged ?? 0).toLocaleString()}
          caption={`rate ${stats ? (stats.blocked_flagged_rate * 100).toFixed(1) : '—'}%`}
        />
        <StatCard label="Avg latency" loading={statsLoading} value={`${stats?.avg_duration_ms ?? '—'} ms`} />
        <StatCard
          label="Tokens"
          tone="warning"
          loading={statsLoading}
          value={((stats?.tokens_in ?? 0) + (stats?.tokens_out ?? 0)).toLocaleString()}
          caption={`in ${(stats?.tokens_in ?? 0).toLocaleString()} · out ${(stats?.tokens_out ?? 0).toLocaleString()}`}
        />
      </div>

      {/* Filter bar */}
      <FilterBar mb={12}>
        <span className="label">Filter</span>
        <div className="group">
          <button className={`filter-chip ${filterFlag === "all" ? "active" : ""}`} onClick={() => setFilterFlag("all")}>All</button>
          <button className={`filter-chip ${filterFlag === "flagged" ? "active" : ""}`} onClick={() => setFilterFlag("flagged")}>Flagged only</button>
          <button className={`filter-chip ${filterFlag === "clean" ? "active" : ""}`} onClick={() => setFilterFlag("clean")}>Clean only</button>
        </div>
        <span className="sep" />
        <div className="group">
          <span className="label">Method</span>
          {["all", "GET", "POST", "STREAM"].map(m => (
            <button key={m} className={`filter-chip ${filterMethod === m ? "active" : ""}`} onClick={() => setFilterMethod(m)}>{m}</button>
          ))}
        </div>
        <span className="sep" />
        <div className="group">
          <span className="label">App</span>
          <select className="select" value={filterApp} onChange={e => setFilterApp(e.target.value)}>
            <option value="all">All apps</option>
            {filterApps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="spacer" style={{ flex: 1 }} />
      </FilterBar>

      {/* Stream */}
      <div className="card">
        <div className="card-hdr">
          <h3>Stream</h3>
          <div className="right">
            <span className="meta">{filtered.length} rows{paused ? ' · paused' : ' · live'}</span>
              {paused && <span className="health-pill" style={{ marginLeft: 8, background: "var(--warning-bg)", color: "var(--warning)" }}><span className="dot" style={{ background: "var(--warning)" }} /> Polling paused — no new rows until resume</span>}
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowColumnMenu(!showColumnMenu)}><Filter w={11} /> Columns</button>
              {showColumnMenu && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setShowColumnMenu(false)} />
                  <div style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 101,
                    background: 'var(--bg-surface)', border: '1px solid var(--border-strong)',
                    borderRadius: 6, padding: '8px 0', minWidth: 180, boxShadow: '0 4px 12px rgba(0,0,0,.15)'
                  }}>
                    {columns.map(col => (
                      <label key={col.id} style={{
                         display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer',
                         fontSize: 12, borderBottom: '1px solid var(--border-subtle)', color: 'var(--fg-primary)'
                       }}>
                        <input
                          type="checkbox"
                          checked={col.visible}
                          onChange={() => toggleColumn(col.id)}
                          style={{ cursor: 'pointer' }}
                        />
                        {col.label}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="t-wrap" style={{ maxHeight: "calc(100vh - 360px)", overflowY: "auto" }}>
          <table className="t" style={{ fontFamily: "var(--font-mono)", fontSize: 11, minWidth: 600 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
              <tr>
                {columns.filter(c => c.visible).map(col => (
                  <th key={col.id} style={{ width: col.width }} className={col.id === 'source' || col.id === 'app' || col.id === 'userAgent' ? '' : col.id === 'in' || col.id === 'out' || col.id === 'ms' ? 'r' : ''}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className={selected?.id === r.id ? "selected" : ""} onClick={() => setSelected(r)} style={r.flag ? { background: "rgba(179,50,31,.03)" } : undefined}>
                  {columns.filter(c => c.visible).map(col => (
                    <td key={col.id} className={col.id === 'in' || col.id === 'out' || col.id === 'ms' ? 'r' : col.id === 'app' || col.id === 'userAgent' ? 'truncate' : ''} style={col.id === 'time' ? { color: "var(--fg-tertiary)" } : col.id === 'source' ? { color: "var(--fg-secondary)" } : col.id === 'userAgent' ? { color: "var(--fg-secondary)", maxWidth: 220 } : {}}>
                      {col.id === 'time' && fmtTs(r.ts)}
                      {col.id === 'method' && <span style={{ fontWeight: 600, color: r.method === "POST" ? "var(--accent)" : r.method === "STREAM" ? "var(--amber-600)" : "var(--cobalt-500)" }}>{r.method}</span>}
                      {col.id === 'status' && <span style={{ fontWeight: 600, color: r.code === 200 ? "var(--accent)" : r.code === 403 ? "var(--danger)" : "var(--warning)" }}>{r.code}</span>}
                      {col.id === 'app' && (
                        <>
                          <span style={{ color: "var(--fg-primary)", fontFamily: "var(--font-ui)" }}>{r.appName}</span>
                          <span style={{ color: "var(--fg-tertiary)", margin: "0 6px" }}>·</span>
                          <span style={{ color: "var(--fg-secondary)" }}>{r.path}</span>
                        </>
                      )}
                      {col.id === 'source' && r.src}
                      {col.id === 'userAgent' && <span title={r.userAgent ?? ''}>{r.userAgent ?? '—'}</span>}
                      {col.id === 'in' && r.tokensIn}
                      {col.id === 'out' && r.tokensOut}
                      {col.id === 'ms' && r.ms}
                      {col.id === 'verdict' && (
                        r.flag && r.threat
                          ? <span style={{ display: "inline-flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                              <OwaspPill id={r.threat.framework_id} />
                              <ScannerBadge row={r} />
                              <Chip kind={r.code === 403 ? "err" : "warn"} mono>{r.code === 403 ? "blocked" : r.threat.action || "throttled"}</Chip>
                            </span>
                          : r.code >= 400
                            ? <Chip kind="err" mono>error</Chip>
                            : r.cacheHit
                              ? <Chip kind="info" mono>cache · {r.cacheTier ?? '?'}</Chip>
                              : <Chip kind="ok" mono>pass</Chip>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <RequestDrawer req={selected} onClose={() => setSelected(null)} onOpenIncident={() => setIncidentModal(selected)} />}
      {incidentModal && <IncidentModal req={incidentModal} onClose={() => setIncidentModal(null)} onCreated={() => { setIncidentModal(null); setSelected(null) }} />}
    </div>
  )
}

export default function TrafficPage({ tweaks }: TrafficPageProps) {
  return (
    <FrameworkProvider>
      <TrafficPageContent tweaks={tweaks} />
    </FrameworkProvider>
  )
}
