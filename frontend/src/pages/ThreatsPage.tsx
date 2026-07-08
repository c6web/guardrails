import React from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { getAllDetectionFrameworks } from '../api/detectionFrameworks'
import type { DetectionFramework } from '../api/detectionFrameworks'
import { fmtAge, fmtDateTime } from '../utils/format'
import { PageHeader, Breadcrumbs, OwaspPill, SevTag, ActionChip, Chip, KV, FilterBar, Drawer, Tabs, DataTable, ScannerBadge, Toast, useToast, FormModal } from '../components/ui'
import type { ColumnDef } from '../components/ui'
import { Download, Plus, Filter, X, Check, AlertTri } from '../components/ui/Icons'
import { getThreatEvents, setClassificationFeedback, countSimilarThreats } from '../api/logs'
import { createIncident } from '../api/incidents'
import { getAclLists, createAclList, createAclEntry } from '../api/networkAcl'
import { getApps } from '../api/apps'
import { Pagination } from './components/AuditShared'
import type { App, TweakValues, ThreatEvent } from '../types'

interface ThreatsPageProps {
  tweaks: TweakValues;
}

// ── Incident creation modal ───────────────────────────────────────────────────

interface IncidentModalProps {
  evt: ThreatEvent | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}

function IncidentModal({ evt, onClose, onCreated }: IncidentModalProps) {
  const [title, setTitle]       = React.useState(evt?.title || '')
  const [severity, setSeverity] = React.useState(evt?.sev || 'high')
  const [desc, setDesc]         = React.useState(evt?.excerpt || '')
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
        framework_id:      evt?.framework_id || null,
        description:       desc || null,
        source_request_id: evt?.requestId || null,
        affected_app_id:   evt?.app || null,
        affected_app_name: evt?.appName || null,
        source_ip:         evt?.src || null,
        detector:          evt?.detector || null,
        confidence:        evt?.confidence ?? null,
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
      {evt && (
        <div style={{ padding: '8px 12px', borderRadius: 4, background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', marginBottom: 14, fontSize: 12 }}>
          <div className="caption" style={{ marginBottom: 2 }}>Linked threat event</div>
          <div style={{ fontWeight: 500 }}>{evt.requestId}</div>
          <div style={{ color: 'var(--fg-tertiary)' }}>{evt.appName} · {evt.framework_id} · {evt.src}</div>
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
          <select className="select" value={severity} onChange={e => setSeverity(e.target.value as typeof severity)} style={{ width: '100%' }}>
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
            value={desc} onChange={e => setDesc(e.target.value)} placeholder="What was detected…"
          />
        </div>

        <div>
          <div className="label" style={{ marginBottom: 4 }}>Notes</div>
          <textarea
            style={{ width: '100%', height: 56, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 4, background: 'var(--bg-surface)', color: 'var(--fg-primary)', fontSize: 12, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'var(--font-ui)' }}
            value={notes} onChange={e => setNotes(e.target.value)} placeholder="Initial notes…"
          />
        </div>
      </div>

      {err && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{err}</div>}
    </FormModal>
  )
}

// ── Similar counts card ───────────────────────────────────────────────────────

function SimCard({ count, label }: { count: number | null; label: string }) {
  return (
    <div style={{ padding: '8px 12px', border: '1px solid var(--border-subtle)', borderRadius: 4, background: 'var(--bg-surface)', minWidth: 0 }}>
      <div className="mono" style={{ fontSize: 18, color: 'var(--fg-primary)', letterSpacing: -0.01 }}>
        {count === null ? '—' : count}
      </div>
      <div className="caption" style={{ fontSize: 10, color: 'var(--fg-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{label}</div>
    </div>
  )
}

// ── Classification feedback modal ─────────────────────────────────────────────

function ClassificationFeedbackModal({ isOpen, correct, reason, onChangeCorrect, onChangeReason, onConfirm, onCancel }: {
  isOpen: boolean
  correct: boolean | null
  reason: string
  onChangeCorrect: (v: boolean | null) => void
  onChangeReason: (v: string) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!isOpen) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 220, background: 'var(--bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onCancel}>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 16, maxWidth: 420, width: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,.2)' }} onClick={e => e.stopPropagation()}>
        <div className="label-strong" style={{ marginBottom: 8 }}>Classification feedback</div>
        <p className="caption" style={{ marginBottom: 12, fontSize: 12, color: 'var(--fg-secondary)' }}>Was the classification correct? This helps improve the model.</p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            className={`btn ${correct === true ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onChangeCorrect(true)}
            style={{ flex: 1 }}
          >
            <Check w={12} /> Correct
          </button>
          <button
            className={`btn ${correct === false ? 'btn-danger' : 'btn-secondary'}`}
            onClick={() => onChangeCorrect(false)}
            style={{ flex: 1 }}
          >
            <X w={12} /> Incorrect
          </button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div className="label" style={{ marginBottom: 4 }}>Reason (optional)</div>
          <textarea
            value={reason}
            onChange={e => onChangeReason(e.target.value)}
            placeholder="Explain your feedback…"
            style={{ width: '100%', minHeight: 80, padding: 8, borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'var(--bg-sunken)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={onConfirm} disabled={correct === null}>
            Save feedback
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Threat drawer ─────────────────────────────────────────────────────────────

interface FrameworkLookup {
  [id: string]: { framework_code: string; name: string; description?: string }
}

interface ThreatDrawerProps {
  evt: ThreatEvent;
  open?: boolean;
  onClose: () => void;
  onFeedback: (id: string) => void;
  onOpenIncident: (evt: ThreatEvent) => void;
  onBlocked: (ip: string) => void;
  frameworkLookup: FrameworkLookup;
}

function ThreatDrawer({ evt, open, onClose, onFeedback, onOpenIncident, onBlocked, frameworkLookup }: ThreatDrawerProps) {
  const [tab, setTab]             = React.useState('summary')
  const [markingFn, setMarkingFn] = React.useState(false)
  const [blocking, setBlocking]   = React.useState(false)
  const [similar, setSimilar]     = React.useState<{ sameDetector: number | null; sameSource: number | null; sameUser: number | null }>({ sameDetector: null, sameSource: null, sameUser: null })
  const [showFeedback, setShowFeedback] = React.useState(false)
  const [feedbackCorrect, setFeedbackCorrect] = React.useState<boolean | null>(null)
  const [feedbackReason, setFeedbackReason] = React.useState('')

  const fw = frameworkLookup[evt.framework_id]

  React.useEffect(() => {
    countSimilarThreats(evt.detector, evt.src, evt.appApiKey)
      .then(r => setSimilar({ sameDetector: r.sameDetector, sameSource: r.sameSource, sameUser: r.sameUser }))
      .catch(() => {})
  }, [evt.detector, evt.src, evt.appApiKey])

  function handleFeedbackClick() {
    setShowFeedback(true)
    setFeedbackCorrect(evt.isClassificationCorrect ?? null)
    setFeedbackReason(evt.correctionReason || '')
  }

  async function handleFeedbackConfirm() {
    setMarkingFn(true)
    try {
      await setClassificationFeedback(evt.requestId, feedbackCorrect, feedbackReason || undefined)
      onFeedback(evt.id)
      onClose()
    } catch {
      setMarkingFn(false)
    }
  }

  async function handleBlockIp() {
    setBlocking(true)
    try {
      const lists = await getAclLists()
      let blocklist = lists.find(l => l.list_type === 'blocklist')
      if (!blocklist) {
        blocklist = await createAclList({ name: 'Threat Blocklist', list_type: 'blocklist', description: 'IPs blocked from threat analysis' })
      }
      await createAclEntry(blocklist.id, {
        value:      evt.src,
        entry_type: 'ip',
        note:       `Blocked from threat event ${evt.requestId} — ${evt.title}`,
      })
      onBlocked(evt.src)
      onClose()
    } catch {
      setBlocking(false)
    }
  }

  return (
    <>
      <Drawer
        open={open}
        title={
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span className={`dot-sev ${evt.sev} pulse`} style={{ marginTop: 8, width: 12, height: 12 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="crumbs" style={{ marginBottom: 4 }}>
                <span>Threat</span>
                <span className="sep">/</span>
                <span className="mono here">{evt.id}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                {evt.title}
              </div>
              <div className="row-tight" style={{ marginTop: 6, gap: 6, flexWrap: 'wrap' }}>
                <OwaspPill id={evt.framework_id} withName />
                <SevTag sev={evt.sev} />
                <ActionChip action={evt.action} />
                <span className="caption mono" style={{ fontSize: 11 }}>{fmtDateTime(evt.ts)}</span>
              </div>
            </div>
          </div>
        }
        onClose={onClose}
        footer={
          <>
            <button className="btn btn-outline" onClick={handleFeedbackClick} disabled={markingFn}>
              {markingFn ? 'Marking…' : evt.isClassificationCorrect !== null ? 'Re-evaluate' : 'Review Classification'}
            </button>
            <button className="btn btn-secondary" onClick={handleBlockIp} disabled={blocking}>
              {blocking ? 'Blocking…' : 'Block source IP'}
            </button>
            <button className="btn btn-primary" onClick={() => onOpenIncident(evt)}>
              Open incident
            </button>
          </>
        }
      >
        <Tabs tabs={[
          { key: 'summary', label: 'Summary' },
          { key: 'evidence', label: 'Evidence' },
          { key: 'context', label: 'Context' },
          { key: 'remediation', label: 'Remediation' },
        ]} activeKey={tab} onChange={setTab} />

        {tab === 'summary' && (
          <>
            <div className="card" style={{ padding: 14, marginBottom: 14, borderColor: 'var(--border-subtle)', background: 'var(--bg-sunken)' }}>
              <div className="label-strong" style={{ marginBottom: 4 }}>{fw?.framework_code} · {fw?.name}</div>
              <div className="caption" style={{ fontSize: 12 }}>{fw?.description}</div>
              <div className="row-tight" style={{ marginTop: 10, gap: 6, flexWrap: 'wrap' }}>
                <ScannerBadge row={evt} />
                <Chip kind="muted" mono>{evt.detector}</Chip>
                <Chip kind="info" mono>confidence {(evt.confidence * 100).toFixed(0)}%</Chip>
              </div>
            </div>

            {evt.classificationReason && (
              <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 6, background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', fontSize: 12 }}>
                <div className="label" style={{ marginBottom: 4 }}>AI classification reason</div>
                <div style={{ color: 'var(--fg-secondary)', lineHeight: 1.5 }}>{evt.classificationReason}</div>
              </div>
            )}

            {evt.isClassificationCorrect !== null && (
              <div style={{ padding: '8px 12px', borderRadius: 4, background: evt.isClassificationCorrect ? 'var(--success-bg)' : 'var(--danger-bg)', border: `1px solid ${evt.isClassificationCorrect ? 'var(--accent)' : 'var(--danger)'}` }}>
                <div className="caption" style={{ color: 'var(--fg-secondary)' }}>
                  {evt.isClassificationCorrect ? 'Classification marked correct' : 'Classification marked incorrect'}
                </div>
                {evt.correctionReason && <div className="caption" style={{ marginTop: 4, fontStyle: 'italic' }}>{evt.correctionReason}</div>}
              </div>
            )}

            <div className="label-strong" style={{ marginBottom: 6 }}>Identity</div>
            <KV rows={[
              { label: 'request', value: evt.requestId },
              { label: 'app', value: evt.appName },
              { label: 'api key', value: evt.appApiKey || '—' },
              { label: 'source ip', value: evt.src },
              { label: 'tokens', value: `${evt.tokensIn} in · ${evt.tokensOut} out` },
              { label: 'duration', value: `${evt.durationMs} ms` },
            ]} />

            <div className="label-strong" style={{ margin: '16px 0 6px' }}>Similar in last 24h</div>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <SimCard count={similar.sameDetector} label={`same detector · ${evt.detector}`} />
              <SimCard count={similar.sameSource}   label={`same source · ${evt.src}`} />
              <SimCard count={similar.sameUser}     label={`same api key · ${(evt.appApiKey || '').slice(0, 16)}${(evt.appApiKey || '').length > 16 ? '…' : ''}`} />
            </div>
          </>
        )}

        {tab === 'evidence' && (
          <>
            <div className="label-strong" style={{ marginBottom: 6 }}>Matched fragment</div>
            <div className="code-block" style={{ marginBottom: 14 }}>
              {evt.excerpt
                ? <span className="red">{evt.excerpt}</span>
                : <span style={{ color: 'var(--fg-tertiary)', fontStyle: 'italic' }}>No excerpt available for this detection type</span>
              }
            </div>
            <div className="label-strong" style={{ marginBottom: 6 }}>Inbound prompt</div>
            <div className="code-block" style={{ marginBottom: 14 }}>
              {evt.inboundPrompt ? (
                <>{`{\n  "role": "user",\n  "content": "`}<span className="red">{evt.inboundPrompt}</span>{`"\n}`}</>
              ) : (
                <span style={{ color: 'var(--fg-tertiary)', fontStyle: 'italic' }}>No inbound prompt available</span>
              )}
            </div>
            <div className="label-strong" style={{ marginBottom: 6 }}>Gateway response</div>
            <div className="code-block">
              <span className="c">// upstream call cancelled — verdict: {evt.action}</span>{'\n'}
              {`{\n  "error": "detector_block",\n  "code": "${(evt.framework_id || '').toLowerCase()}.${evt.detector?.split('.').slice(-1)[0]}",\n  "message": "Blocked by AI Firewall — `}
              <span className="red">{evt.title}</span>
              {`"\n}`}
            </div>
          </>
        )}

        {tab === 'context' && (
          <>
            <div className="label-strong" style={{ marginBottom: 6 }}>Source · {evt.src}</div>
            <KV rows={[
              { label: 'first seen', value: fmtDateTime(evt.ts) },
              { label: 'similar / 24h', value: `${similar.sameSource === null ? '—' : similar.sameSource} requests from this source` },
              { label: 'same detector', value: `${similar.sameDetector === null ? '—' : similar.sameDetector} in last 24h` },
            ]} style={{ marginBottom: 14 }} />

            <div className="label-strong" style={{ margin: '16px 0 6px' }}>Suggested actions</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--fg-primary)' }}>
              <li>Block <span className="mono">{evt.src}</span> at network level via Network ACL</li>
              <li>Review detector <span className="mono">{evt.detector}</span> threshold</li>
              {(similar.sameSource ?? 0) > 5 && (
                <li style={{ color: 'var(--danger)' }}>High activity from this source — consider immediate block</li>
              )}
            </ul>
          </>
        )}

        {tab === 'remediation' && (
          <>
            <div className="label-strong" style={{ marginBottom: 6 }}>Mitigation · {fw?.framework_code}</div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--fg-primary)' }}>
              <li style={{ marginBottom: 8 }}>Block at ingress when detector <span className="mono">{evt.detector}</span> fires.</li>
              <li style={{ marginBottom: 8 }}>Strip URL fetches from any upstream tool when prompt origin is untrusted.</li>
              <li style={{ marginBottom: 8 }}>Pin system prompt with HMAC envelope; reject prompts where envelope is altered.</li>
              <li style={{ marginBottom: 8 }}>Log full evidence to immutable audit storage (retention 7y).</li>
            </ol>

            <div className="label-strong" style={{ margin: '16px 0 6px' }}>References</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
              <li>{fw?.name} · {evt.framework_id}</li>
              <li>Internal runbook: <span className="mono">rb/sec-ai-{(evt.framework_id || '').toLowerCase()}</span></li>
            </ul>
          </>
        )}
      </Drawer>

      <ClassificationFeedbackModal
        isOpen={showFeedback}
        correct={feedbackCorrect}
        reason={feedbackReason}
        onChangeCorrect={(v) => setFeedbackCorrect(v)}
        onChangeReason={(r) => setFeedbackReason(r)}
        onConfirm={handleFeedbackConfirm}
        onCancel={() => setShowFeedback(false)}
      />
    </>
  )
}

// ── DataTable columns ─────────────────────────────────────────────────────────

const threatColumns: ColumnDef<ThreatEvent>[] = [
  {
    key: 'sev-dot',
    label: '',
    width: 22,
    render: (e) => (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
        <span className={`dot-sev ${e.sev}`} />
        {e.isClassificationCorrect === true && (
          <span title="Classified correct" style={{ fontSize: 8, color: 'var(--accent)', lineHeight: '8px' }}>✓</span>
        )}
        {e.isClassificationCorrect === false && (
          <span title="Classified incorrect" style={{ fontSize: 8, color: 'var(--danger)', lineHeight: '8px' }}>✗</span>
        )}
      </div>
    ),
  },
  {
    key: 'time',
    label: 'time',
    width: 76,
    render: (e) => (
      <span className="mono" style={{ color: 'var(--fg-tertiary)' }}>{fmtAge(e.age)} ago</span>
    ),
  },
  {
    key: 'severity',
    label: 'severity',
    width: 80,
    render: (e) => <SevTag sev={e.sev} />,
  },
  {
    key: 'framework',
    label: 'Framework',
    width: 96,
    render: (e) => <OwaspPill id={e.framework_id} />,
  },
  {
    key: 'threat',
    label: 'threat',
    render: (e) => (
      <div className="truncate" style={{ maxWidth: 320 }}>
        <div style={{ fontWeight: 500, color: 'var(--fg-primary)' }}>{e.title}</div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.excerpt}</div>
      </div>
    ),
  },
  {
    key: 'app',
    label: 'app',
    render: (e) => <span style={{ fontSize: 11 }}>{e.appName}</span>,
  },
  {
    key: 'source',
    label: 'source',
    render: (e) => <span className="mono" style={{ color: 'var(--fg-secondary)' }}>{e.src}</span>,
  },
  {
    key: 'action',
    label: 'action',
    render: (e) => <ActionChip action={e.action} />,
  },
  {
    key: 'scanner',
    label: 'scanner',
    render: (e) => <ScannerBadge row={e} />,
  },
  {
    key: 'conf',
    label: 'conf.',
    width: 56,
    align: 'right',
    render: (e) => <span className="mono">{(e.confidence * 100).toFixed(0)}%</span>,
  },
]

// ── Main page ─────────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const ThreatsPage: React.FC<ThreatsPageProps> = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const focusFramework = searchParams.get('framework')

  const [frameworks, setFrameworks] = React.useState<DetectionFramework[]>([])
  const [frameworkF, setFrameworkF] = React.useState(focusFramework || 'all')
  const [sevF,   setSevF]       = React.useState('all')
  const [appF,   setAppF]       = React.useState('all')
  const [actionF,setActionF]   = React.useState('all')
  const [selected, setSelected] = React.useState<ThreatEvent | null>(null)
  const [groupBy, setGroupBy]   = React.useState('none')
  const [incidentEvt, setIncidentEvt] = React.useState<ThreatEvent | null>(null)
  const [showIncidentModal, setShowIncidentModal] = React.useState(false)
  const { toast, show: showToast } = useToast()
  const [filterApps, setFilterApps] = React.useState<App[]>([])

  // Pagination state
  const [page,      setPage]      = React.useState(1)
  const [limit,     setLimit]      = React.useState(PAGE_SIZE_OPTIONS[0])
  const [total,     setTotal]      = React.useState(0)
  const [loading,   setLoading]   = React.useState(false)
  const [events,    setEvents]     = React.useState<ThreatEvent[]>([])

  // Build framework lookup map from live data
  const frameworkLookup: FrameworkLookup = React.useMemo(() => {
    const map: FrameworkLookup = {}
    frameworks.forEach(f => { map[f.id] = { framework_code: f.framework_code, name: f.name, description: f.description } })
    return map
  }, [frameworks])

  // showToast is provided by useToast hook above

  const loadEvents = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await getThreatEvents({ page, limit, framework_id: frameworkF !== 'all' ? frameworkF : undefined })
      setEvents(res.events)
      setTotal(res.meta.total)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }, [page, limit, frameworkF])

  React.useEffect(() => { loadEvents() }, [loadEvents])

  React.useEffect(() => {
    getAllDetectionFrameworks({ limit: 100 }).then(r => setFrameworks(r.data)).catch(() => {})
    if (focusFramework) setFrameworkF(focusFramework)
  }, [focusFramework])

  React.useEffect(() => {
    getApps().then(setFilterApps).catch(console.error)
  }, [])

  // Reset page when filters change
  const handleFilterChange = (fn: () => void) => () => { fn(); setPage(1) }

  const handleFrameworkFilter = (id: string) => {
    setFrameworkF(id)
    setSearchParams(id === 'all' ? {} : { framework: id })
  }

  // Client-side filters on current page data
  const filteredEvents = events.filter(e => {
    if (sevF    !== 'all' && e.sev    !== sevF)    return false
    if (appF    !== 'all' && e.app    !== appF)    return false
    if (actionF !== 'all' && !e.action.startsWith(actionF)) return false
    return true
  })

  const frameworkCounts = React.useMemo(() => {
    const m: Record<string, number> = Object.fromEntries(frameworks.map(f => [f.id, 0]))
    events.forEach(e => { if (e.framework_id) m[e.framework_id] = (m[e.framework_id] ?? 0) + 1 })
    return m
  }, [events, frameworks])

  const totalEvents = React.useMemo(() => Object.values(frameworkCounts).reduce((a, b) => a + b, 0), [frameworkCounts])

  const sevCounts = React.useMemo(() => {
    const m = { crit: 0, high: 0, med: 0, low: 0 }
    events.forEach(e => { m[e.sev as keyof typeof m]++ })
    return m
  }, [events])

  const totalPages = Math.ceil(total / limit)

  function handleFeedback(id: string) {
    setEvents(prev => prev.map((e: ThreatEvent) => (e.id === id ? { ...e, isClassificationCorrect: true } : e)))
    showToast('Classification feedback saved')
  }

  function handleBlocked(ip: string) {
    showToast(`${ip} added to Network ACL blocklist`)
  }

  function handleOpenIncidentModal(evt: ThreatEvent) {
    setIncidentEvt(evt)
    setShowIncidentModal(true)
    setSelected(null)
  }

  function handleIncidentCreated(incidentId: string) {
    setShowIncidentModal(false)
    setIncidentEvt(null)
    showToast('Incident created — navigating to Incidents')
    setTimeout(() => navigate(`/incidents?highlight=${incidentId}`), 400)
  }

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="threats" />
      <PageHeader title="Threat events" subtitle={<><span>Review all blocked and flagged requests organized by severity, with full detection context from every scanning framework. Classify false positives, escalate to incidents, add IPs to ACL blocklists, and export reports.<br /></span><span className="mono">{total}</span><span> total events</span><span style={{ margin: '0 8px', color: 'var(--border-strong)' }}>·</span><span style={{ color: 'var(--danger)' }}>{sevCounts.crit} crit</span><span style={{ margin: '0 6px', color: 'var(--vermilion-600)' }}>{sevCounts.high} high</span><span style={{ margin: '0 6px', color: 'var(--border-strong)' }}>·</span><span style={{ color: 'var(--warning)' }}>{sevCounts.med} med</span></>}
        actions={<><button className="btn btn-ghost"><Download w={13} /> Export</button><button className="btn btn-secondary" onClick={() => { setIncidentEvt(null); setShowIncidentModal(true) }}><Plus w={13} /> Create incident</button></>} />

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16 }} className="threats-page-grid">
        {/* Framework rail */}
        <div className="card desktop-only" style={{ height: 'fit-content', position: 'sticky', top: 16 }}>
          <div className="card-hdr">
            <h3>Detection Frameworks</h3>
            <span className="meta">{totalEvents}</span>
          </div>
          <div style={{ padding: 6 }}>
            <button className={`nav-item ${frameworkF === 'all' ? 'active' : ''}`} onClick={() => handleFrameworkFilter('all')} style={{ width: '100%' }}>
              <Filter w={13} />
              <span>All categories</span>
              <span className="count">{totalEvents}</span>
            </button>
            {frameworks.map(f => (
              <button key={f.id} className={`nav-item ${frameworkF === f.id ? 'active' : ''}`} onClick={() => handleFrameworkFilter(f.id)} style={{ width: '100%' }}>
                <span style={{ width: 13, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-tertiary)' }}>§</span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <b style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{f.framework_code}</b> · {f.name}
                </span>
                <span className="count">{frameworkCounts[f.id] || 0}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Main */}
        <div>
          <FilterBar mb={12}>
            <span className="label">Severity</span>
            <div className="group">
              {['all', 'crit', 'high', 'med', 'low'].map(s => (
                <button key={s} className={`filter-chip ${sevF === s ? 'active' : ''}`} onClick={handleFilterChange(() => setSevF(s))}>{s}</button>
              ))}
            </div>
            <span className="sep" />
            <span className="label">Action</span>
            <div className="group">
              {['all', 'blocked', 'redacted', 'flagged', 'monitored', 'forwarded', 'failed'].map(s => (
                <button key={s} className={`filter-chip ${actionF === s ? 'active' : ''}`} onClick={handleFilterChange(() => setActionF(s))}>{s}</button>
              ))}
            </div>
            <span className="sep" />
            <span className="label">App</span>
            <select className="select" value={appF} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setAppF(e.target.value); setPage(1); }} >
              <option value="all">All apps</option>
              {filterApps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <div className="spacer" style={{ flex: 1 }} />
            <span className="label">Group</span>
            <select className="select" value={groupBy} onChange={e => setGroupBy(e.target.value)}>
              <option value="none">None</option>
              <option value="framework">Framework</option>
              <option value="app">App</option>
            </select>
          </FilterBar>

          <div className="card" style={{ marginBottom: 12, maxHeight: 'calc(100vh - 380px)', overflowY: 'auto' }}>
            <DataTable<ThreatEvent>
              card={false}
              columns={threatColumns}
              data={filteredEvents}
              rowKey={(e) => e.id}
              onRowClick={(e) => setSelected(e)}
              loading={loading}
              emptyMessage="No events match filters"
              minWidth={660}
              stickyHeader
              rowClassName={(e) => selected?.id === e.id ? 'selected' : undefined}
            />
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--fg-secondary)' }}>
                <span>Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total}</span>
                <select className="select" value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1) }} style={{ width: 'auto', padding: '2px 6px' }}>
                  {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <span className="caption">per page</span>
              </div>
              <Pagination page={page} totalPages={totalPages} onPage={p => setPage(p)} />
            </div>
          )}
        </div>
      </div>

      {selected && (
        <ThreatDrawer
          evt={selected}
          onClose={() => setSelected(null)}
          onFeedback={handleFeedback}
          onOpenIncident={handleOpenIncidentModal}
          onBlocked={handleBlocked}
          frameworkLookup={frameworkLookup}
        />
      )}

      {showIncidentModal && (
        <IncidentModal
          evt={incidentEvt}
          onClose={() => { setShowIncidentModal(false); setIncidentEvt(null) }}
          onCreated={handleIncidentCreated}
        />
      )}

      {toast && <Toast msg={toast.msg} kind={toast.kind} />}
    </div>
  )
}

export default ThreatsPage
