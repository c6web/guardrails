import React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getIncidents, createIncident, updateIncident, deleteIncident } from '../api/incidents'
import { getAllDetectionFrameworks } from '../api/detectionFrameworks'
import type { DetectionFramework } from '../api/detectionFrameworks'
import { Drawer, PageHeader, Breadcrumbs, OwaspPill, SevTag, KV, FilterBar, EmptyState, DataTable, Timeline, Tabs, FormModal } from '../components/ui'
import type { ColumnDef } from '../components/ui'
import { AlertTri, Check, Trash2, ExternalLink, ChevronL, AlertO, X } from '../components/ui/Icons'
import { fmtAgeFromIso } from '../utils/format'
import type { Incident, TweakValues } from '../types'

interface IncidentsPageProps { tweaks: TweakValues }

const STATUS_COLORS: Record<string, string> = {
  open:          'var(--danger)',
  investigating: 'var(--warning)',
  resolved:      'var(--accent)',
  closed:        'var(--fg-tertiary)',
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || 'var(--fg-tertiary)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color, fontWeight: 600, textTransform: 'capitalize' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {status}
    </span>
  )
}

// ── Incident detail drawer ────────────────────────────────────────────────────

function IncidentDrawer({ incident, open, onClose, onUpdated, onDeleted, onToast }: {
  incident: Incident
  open?: boolean
  onClose: () => void
  onUpdated: (i: Incident) => void
  onDeleted: (id: string) => void
  onToast?: (msg: string, kind: 'ok' | 'err') => void
}) {
  const navigate = useNavigate()
  const [tab, setTab]       = React.useState('details')
  const [status, setStatus] = React.useState(incident.status)
  const [severity, setSeverity] = React.useState(incident.severity)
  const [title, setTitle]     = React.useState(incident.title)
  const [description, setDescription] = React.useState(incident.description || '')
  const [notes, setNotes]   = React.useState(incident.notes || '')
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [err, setErr]       = React.useState('')

  async function handleSave() {
    setSaving(true)
    setErr('')
    try {
      const updated = await updateIncident(incident.id, {
        status,
        severity: incident.severity === severity ? undefined : severity,
        title: incident.title === title ? undefined : title,
        description: description || null,
        notes: notes || null,
      })
      onUpdated(updated)
      onToast?.('Incident updated', 'ok')
    } catch (_e) {
      setErr('Failed to save changes')
      onToast?.('Failed to save changes', 'err')
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!confirm('Delete this incident? This cannot be undone.')) return
    setDeleting(true)
    try {
      await deleteIncident(incident.id)
      onDeleted(incident.id)
      onToast?.('Incident deleted', 'ok')
      onClose()
    } catch (_e) {
      setErr('Delete failed')
      onToast?.('Delete failed', 'err')
      setDeleting(false)
    }
  }

    return (
    <Drawer
      open={open}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`dot-sev ${incident.severity} pulse`} style={{ marginTop: 8, width: 12, height: 12 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="crumbs" style={{ marginBottom: 4 }}>
              <span>Incident</span>
              <span className="sep">/</span>
              <span className="mono here">{incident.id.slice(0, 8)}…</span>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
              {incident.title}
            </div>
            <div className="row-tight" style={{ marginTop: 6, gap: 6, flexWrap: 'wrap' }}>
              <SevTag sev={incident.severity as 'crit' | 'high' | 'med' | 'low'} />
              <StatusBadge status={incident.status} />
              {incident.framework_id && <OwaspPill id={incident.framework_id} withName />}
            </div>
          </div>
        </div>
      }
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : <><Check w={13} /> Save changes</>}
          </button>
          <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={handleDelete} disabled={deleting}>
            <Trash2 w={13} /> Delete
          </button>
        </>
      }
    >
      <Tabs tabs={[
        { key: 'details', label: 'Details' },
        { key: 'linked request', label: 'Linked request' },
        { key: 'timeline', label: 'Timeline' },
      ]} activeKey={tab} onChange={setTab} />

      <div style={{ padding: '16px 20px' }}>
        {tab === 'details' && (
          <>
            <KV rows={[
              { label: 'app', value: incident.affected_app_name || '—' },
              { label: 'source ip', value: <span style={{ fontSize: 12 }}>{incident.source_ip || '—'}</span>, mono: true },
              { label: 'detector', value: <span style={{ fontSize: 12 }}>{incident.detector || '—'}</span>, mono: true },
              incident.confidence !== null && { label: 'confidence', value: `${(incident.confidence * 100).toFixed(0)}%`, mono: true },
              { label: 'created by', value: incident.created_by || '—' },
              { label: 'created', value: fmtAgeFromIso(incident.created_at) },
              incident.resolved_by && { label: 'resolved at', value: fmtAgeFromIso(incident.resolved_at) },
            ]} style={{ marginBottom: 16 }} />

            <div className="label-strong" style={{ marginBottom: 6 }}>Title</div>
            <input
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 4, background: 'var(--bg-surface)', color: 'var(--fg-primary)', fontSize: 12, boxSizing: 'border-box', fontFamily: 'var(--font-ui)' }}
              value={title} onChange={e => setTitle(e.target.value)} placeholder="Incident title"
            />

            <div className="label-strong" style={{ marginBottom: 6 }}>Severity</div>
            <select className="select" value={severity} onChange={e => setSeverity(e.target.value)} style={{ width: '100%', marginBottom: 14 }}>
              <option value="crit">Critical</option>
              <option value="high">High</option>
              <option value="med">Medium</option>
              <option value="low">Low</option>
            </select>

            <div className="label-strong" style={{ marginBottom: 6 }}>Description</div>
            <textarea
              style={{ width: '100%', height: 80, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 4, background: 'var(--bg-surface)', color: 'var(--fg-primary)', fontSize: 12, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'var(--font-ui)' }}
              value={description} onChange={e => setDescription(e.target.value)} placeholder="Add description…"
            />

            <div className="label-strong" style={{ marginBottom: 6 }}>Status</div>
            <select className="select" value={status} onChange={e => setStatus(e.target.value)} style={{ width: '100%', marginBottom: 14 }}>
              <option value="open">Open</option>
              <option value="investigating">Investigating</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>

            <div className="label-strong" style={{ marginBottom: 6 }}>Notes</div>
            <textarea
              style={{ width: '100%', height: 80, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 4, background: 'var(--bg-surface)', color: 'var(--fg-primary)', fontSize: 12, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'var(--font-ui)' }}
              value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add notes…"
            />

            {err && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{err}</div>}
          </>
        )}

        {tab === 'linked request' && (
          <>
            {incident.source_request_id ? (
              <>
                <div className="label-strong" style={{ marginBottom: 8 }}>Source request</div>
                <KV rows={[
                  { label: 'request id', value: <span style={{ fontSize: 11 }}>{incident.source_request_id}</span>, mono: true },
                  { label: 'app', value: incident.affected_app_name || '—' },
                  { label: 'source ip', value: incident.source_ip || '—', mono: true },
                  { label: 'detector', value: incident.detector || '—', mono: true },
                  incident.framework_id && { label: 'Framework', value: <OwaspPill id={incident.framework_id} /> },
                ]} style={{ marginBottom: 14 }} />
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%' }}
                  onClick={() => navigate('/ai-activities')}
                >
                  <ExternalLink w={13} /> View in Gateway Activity Log
                </button>
              </>
            ) : (
              <div style={{ color: 'var(--fg-tertiary)', fontSize: 12, textAlign: 'center', padding: '24px 0' }}>
                No linked request — this incident was created manually.
              </div>
            )}
          </>
        )}

        {tab === 'timeline' && (
          <Timeline
            events={[
              { label: 'Created', detail: `${fmtAgeFromIso(incident.created_at)}${incident.created_by ? ` · ${incident.created_by}` : ''}` },
              ...(incident.resolved_at ? [{ label: incident.status === 'closed' ? 'Closed' : 'Resolved', detail: `${fmtAgeFromIso(incident.resolved_at)}${incident.resolved_by ? ` · ${incident.resolved_by}` : ''}` }] : []),
            ]}
            variant="compact"
          />
        )}
      </div>
    </Drawer>
  )
}

// ── Create incident modal ─────────────────────────────────────────────────────

function CreateIncidentModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle]       = React.useState('')
  const [severity, setSeverity] = React.useState<'crit' | 'high' | 'med' | 'low'>('high')
  const [desc, setDesc]         = React.useState('')
  const [notes, setNotes]       = React.useState('')
  const [saving, setSaving]     = React.useState(false)
  const [err, setErr]           = React.useState('')

  async function handleCreate() {
    if (!title.trim()) { setErr('Title is required'); return }
    setSaving(true)
    try {
      const incident = await createIncident({ title: title.trim(), severity, description: desc || null, notes: notes || null })
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div className="label" style={{ marginBottom: 4 }}>Title *</div>
          <input style={{ width: '100%', height: 32, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 4, background: 'var(--bg-surface)', color: 'var(--fg-primary)', fontSize: 13, boxSizing: 'border-box' }} value={title} onChange={e => setTitle(e.target.value)} placeholder="Incident title…" />
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
          <textarea style={{ width: '100%', height: 72, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 4, background: 'var(--bg-surface)', color: 'var(--fg-primary)', fontSize: 12, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'var(--font-ui)' }} value={desc} onChange={e => setDesc(e.target.value)} placeholder="What happened?" />
        </div>

        <div>
          <div className="label" style={{ marginBottom: 4 }}>Notes</div>
          <textarea style={{ width: '100%', height: 64, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 4, background: 'var(--bg-surface)', color: 'var(--fg-primary)', fontSize: 12, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'var(--font-ui)' }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional context…" />
        </div>

        {err && <div className="caption" style={{ color: 'var(--danger)' }}>{err}</div>}
      </div>
    </FormModal>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const IncidentsPage: React.FC<IncidentsPageProps> = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('highlight')

  const [incidents, setIncidents]   = React.useState<Incident[]>([])
  const [loading, setLoading]       = React.useState(true)
  const [statusF, setStatusF]       = React.useState('all')
  const [sevF,    setSevF]          = React.useState('all')
  const [frameworkF,  setFrameworkF]        = React.useState('')
  const [selected, setSelected]     = React.useState<Incident | null>(null)
  const [createModal, setCreateModal] = React.useState(false)
  const [showHelp, setShowHelp]    = React.useState(false)
  const [toast,   setToast]        = React.useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)
  const [frameworks, setFrameworks] = React.useState<DetectionFramework[]>([])

  React.useEffect(() => {
    getAllDetectionFrameworks({ limit: 100 }).then(r => setFrameworks(r.data)).catch(() => {})
  }, [])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await getIncidents({
        status:         statusF !== 'all' ? statusF : undefined,
        severity:       sevF    !== 'all' ? sevF    : undefined,
        framework_id:   frameworkF  || undefined,
        limit: 200,
      })
      setIncidents(res.rows)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [statusF, sevF, frameworkF])

  React.useEffect(() => { load() }, [load])

  React.useEffect(() => {
    if (highlightId && incidents.length > 0) {
      const found = incidents.find(i => i.id === highlightId)
      if (found) setSelected(found)
    }
  }, [highlightId, incidents])

  function handleUpdated(updated: Incident) {
    setIncidents(prev => prev.map(i => i.id === updated.id ? updated : i))
    setSelected(updated)
    setToast({ msg: 'Incident updated', kind: 'ok' })
  }

  function handleDeleted(id: string) {
    setIncidents(prev => prev.filter(i => i.id !== id))
    setToast({ msg: 'Incident deleted', kind: 'ok' })
  }

  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const openCount = incidents.filter(i => i.status === 'open').length

  const columns: ColumnDef<Incident>[] = [
    { key: 'sev', label: '', width: 22, render: (inc) => <span className={`dot-sev ${inc.severity}`} /> },
    {
      key: 'title',
      label: 'Title',
      render: (inc) => (
        <div style={{ maxWidth: 250, wordWrap: 'break-word', overflowWrap: 'break-word' }}>
          <div style={{ fontWeight: 500, color: 'var(--fg-primary)', fontSize: 13 }}>{inc.title}</div>
          {inc.detector && <div className="mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>{inc.detector}</div>}
        </div>
      ),
    },
    { key: 'status', label: 'Status', width: 110, render: (inc) => <StatusBadge status={inc.status} /> },
    { key: 'severity', label: 'Severity', width: 80, render: (inc) => <SevTag sev={inc.severity as 'crit' | 'high' | 'med' | 'low'} /> },
    {
      key: 'framework',
      label: 'Framework',
      width: 90,
      render: (inc) => (
        <div style={{ maxWidth: 120, wordWrap: 'break-word', overflowWrap: 'break-word' }}>
          {inc.framework_id ? <OwaspPill id={inc.framework_id} /> : <span style={{ color: 'var(--fg-tertiary)' }}>—</span>}
        </div>
      ),
    },
    {
      key: 'app',
      label: 'App',
      render: (inc) => <span style={{ fontSize: 12 }}>{inc.affected_app_name || '—'}</span>,
    },
    {
      key: 'source_ip',
      label: 'Source IP',
      render: (inc) => (
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-secondary)' }}>
          {inc.source_ip || '—'}
        </span>
      ),
    },
    {
      key: 'created_by',
      label: 'Created by',
      render: (inc) => (
        <span style={{ fontSize: 12, color: 'var(--fg-secondary)' }}>
          {inc.created_by || '—'}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Created',
      width: 100,
      render: (inc) => (
        <div className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>
          {fmtAgeFromIso(inc.created_at)}
        </div>
      ),
    },
  ]

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="incidents" />
      <PageHeader title="Incidents" subtitle={<><span>Track and resolve confirmed attacks. Create from the Threats page, Live Traffic drawer, or manually below.</span><button className="icon-btn" onClick={() => setShowHelp(!showHelp)} title={showHelp ? 'Hide help' : 'Show how to create incidents'} style={{ padding: 2 }}><AlertO w={14} /></button></>}
        actions={<button className="btn btn-primary" onClick={() => setCreateModal(true)}><AlertTri w={13} /> New incident</button>} />

      {/* Help panel */}
      {showHelp && (
        <div className="card" style={{ marginBottom: 12, padding: 16 }}>
          <div className="row-tight" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span className="label">How to create an incident</span>
            <button className="icon-btn" onClick={() => setShowHelp(false)}><X w={12} /></button>
          </div>
          <ol style={{ paddingLeft: 18, margin: 0, fontSize: 13, lineHeight: 1.7, color: 'var(--fg-secondary)' }}>
            <li>From the <strong>Threats page</strong>: Flag a request, then click "Open incident" to auto-fill details from the flagged request.</li>
            <li>From <strong>Live Traffic</strong>: Click any flagged row → use the "Open incident" button in the detail drawer.</li>
            <li><strong>Manual creation</strong>: Use the "New incident" button above to start fresh (e.g., for incidents from external reports).</li>
          </ol>
        </div>
      )}

      {/* Filters */}
      <FilterBar mb={12}>
        <span className="label">Status</span>
        <div className="group">
          {['all', 'open', 'investigating', 'resolved', 'closed'].map(s => (
            <button key={s} className={`filter-chip ${statusF === s ? 'active' : ''}`} onClick={() => setStatusF(s)}>{s}</button>
          ))}
        </div>
        <span className="sep" />
        <span className="label">Severity</span>
        <div className="group">
          {['all', 'crit', 'high', 'med', 'low'].map(s => (
            <button key={s} className={`filter-chip ${sevF === s ? 'active' : ''}`} onClick={() => setSevF(s)}>{s}</button>
          ))}
        </div>
        <span className="sep" />
        <select className="select" value={frameworkF} onChange={e => setFrameworkF(e.target.value)} style={{ width: 160 }}>
          <option value="">All frameworks</option>
          {frameworks.map(f => <option key={f.id} value={f.id}>{f.framework_code} · {f.name}</option>)}
        </select>
      </FilterBar>

      <DataTable<Incident>
        columns={columns}
        data={incidents}
        rowKey={(inc) => inc.id}
        onRowClick={(inc) => setSelected(selected?.id === inc.id ? null : inc)}
        loading={loading}
        emptyState={
          <EmptyState
            icon={<AlertTri w={28} />}
            title="No incidents yet"
            subtitle="Incidents are created when you detect a confirmed attack."
            action={
              <div className="row-tight" style={{ justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => setCreateModal(true)}>Create incident manually</button>
                <button className="btn btn-ghost" onClick={() => navigate('/threats')}><ChevronL w={13} /> Go to Threats page</button>
              </div>
            }
          />
        }
        minWidth={640}
        rowClassName={(inc) => selected?.id === inc.id ? 'selected' : undefined}
        rowStyle={(inc) => inc.id === highlightId ? { background: 'var(--accent-bg, rgba(99,102,241,.06))' } : undefined}
      />

      {!loading && incidents.length > 0 && statusF === 'all' && openCount > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--fg-tertiary)' }}>
          Tip: filter by <button className="btn btn-ghost btn-sm" style={{ padding: '0 6px', height: 20, fontSize: 11 }} onClick={() => setStatusF('open')}>open</button> to see active incidents only.
        </div>
      )}

      {selected && (
        <IncidentDrawer incident={selected} onClose={() => setSelected(null)} onUpdated={handleUpdated} onDeleted={handleDeleted} onToast={(msg, kind) => setToast({ msg, kind })} />
      )}

      {createModal && <CreateIncidentModal onClose={() => setCreateModal(false)} onCreated={(id) => { setCreateModal(false); setSelected(incidents.find(i => i.id === id) || null); load() }} />}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 300, padding: '10px 16px', borderRadius: 8, background: toast.kind === 'ok' ? 'var(--ok-bg, rgba(118,180,0,0.12))' : 'var(--danger-bg)', color: toast.kind === 'ok' ? 'var(--ok, #76B400)' : 'var(--danger)', border: `1px solid ${toast.kind === 'ok' ? 'var(--ok, #76B400)' : 'var(--danger)'}`, fontSize: 13, fontWeight: 500, boxShadow: 'var(--shadow-2)' }}>{toast.msg}</div>
      )}
    </div>
  )
}

export default IncidentsPage
