import React from 'react'
import { X, Check, Pencil, Trash2 } from '../../components/ui/Icons'
import { setClassificationFeedback } from '../../api/logs'
import { getToolAudit } from '../../api/tools'
import type { ToolAuditRow } from '../../api/tools'
import type { TrafficRow } from '../../types'
import type { UIDetector } from '../../api/detectors'
import { fmtDateTime, fmtDateTimeStr } from '../../utils/format'
import { Drawer, LoadingState, OwaspPill, ShieldCheck, Chip, KV, Tabs } from '../../components/ui'
import JsonPayload from '../../components/ui/JsonPayload'
import { DetectorList, TimelineList, ThreatKnowledgeTab } from './AIActivitiesShared'
import { ScannerBadge } from '../../components/ui'

// ── Detail drawer ─────────────────────────────────────────────────────────────

export function RowDetail({ row, open, onClose, onDelete, onUpdateClassification, detectors }: {
  row: TrafficRow
  open?: boolean
  onClose: () => void
  onDelete?: () => void
  onUpdateClassification?: (id: string, correct: boolean | null, reason: string) => void
  detectors: UIDetector[]
}) {
  const [activeTab, setActiveTab] = React.useState('overview')
  const [showFeedbackModal, setShowFeedbackModal] = React.useState(false)
  const [feedbackCorrect, setFeedbackCorrect] = React.useState<boolean | null>(null)
  const [feedbackReason, setFeedbackReason] = React.useState('')
  const [toast, setToast] = React.useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)
  const [toolRows, setToolRows] = React.useState<ToolAuditRow[]>([])
  const [toolsLoading, setToolsLoading] = React.useState(false)

  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  React.useEffect(() => {
    if (activeTab !== 'tools') return
    setToolsLoading(true)
    getToolAudit({ requestId: row.id, limit: 50 })
      .then(r => setToolRows(r.data))
      .catch(() => setToolRows([]))
      .finally(() => setToolsLoading(false))
  }, [activeTab, row.id])

  async function handleFeedbackConfirm() {
    if (!row) return
    try {
      await setClassificationFeedback(row.id, feedbackCorrect, feedbackReason || undefined)
      onUpdateClassification?.(row.id, feedbackCorrect, feedbackReason)
      setToast({ msg: 'Classification updated', kind: 'ok' })
      setShowFeedbackModal(false)
    } catch { /* silent */ }
  }

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'payload', label: 'Payload' },
    { key: 'detectors', label: 'Detectors' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'threatknowledge', label: 'Threat Knowledge' },
    { key: 'tools', label: 'Tools' },
  ]

  return (
    <>
      <Drawer
        open={open}
        title={
          <>
            <div className="crumbs" style={{ marginBottom: 4 }}>
              <span>Request</span><span className="sep">/</span>
              <span className="mono here">{row.id}</span>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, letterSpacing: '-0.01em', marginBottom: 6 }}>
              {row.flag && row.threat ? row.threat.title : row.pipelineTrace ? 'Request passed all detectors' : row.action === 'blocked' ? (row.threatTitle ?? 'Request blocked') : 'Not evaluated'}
            </div>
            <div className="row-tight" style={{ gap: 6, flexWrap: 'wrap' }}>
              {row.flag && row.threat && <OwaspPill id={row.threat.framework_id} withName />}
              <Chip kind={row.code === 200 ? 'ok' : row.code >= 400 ? 'err' : 'warn'} mono>HTTP {row.code}</Chip>
              <Chip kind="muted" mono>{row.method}</Chip>
              <span className="caption">{fmtDateTime(row.ts)}</span>
            </div>
          </>
        }
        onClose={onClose}
        footer={
          <>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
            <div style={{ flex: 1 }} />
            {row.flag && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent)' }} onClick={() => { setShowFeedbackModal(true); setFeedbackCorrect(row.isClassificationCorrect ?? null); setFeedbackReason(row.correctionReason || '') }}>
              <Pencil w={13} /> Review
            </button>}
            {onDelete && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={onDelete}><Trash2 w={13} /> Delete</button>}
          </>
        }
      >
        <Tabs tabs={TABS} activeKey={activeTab} onChange={setActiveTab} />

        <div style={{ padding: '16px 20px' }}>
        {/* ── Overview ── */}
        {activeTab === 'overview' && (
          <>
            <div className="label-strong" style={{ marginBottom: 6 }}>Identity</div>
            <KV
              labelWidth={110}
              gap={7}
              style={{ marginBottom: 16 }}
              rows={[
                { label: 'Request ID', value: <span style={{ fontSize: 11 }}>{row.id}</span>, mono: true },
                { label: 'App', value: row.appName },
                { label: 'Model', value: <span style={{ fontSize: 12 }}>{row.model || '—'}</span>, mono: true },
                { label: 'LLM provider', value: <span style={{ fontSize: 12 }}>{row.upstreamProviderName || '—'}</span>, mono: true },
                { label: 'Classifier', value: classifierCell(row) },
                { label: 'Source IP', value: <span style={{ fontSize: 12 }}>{row.src || '—'}</span>, mono: true },
                { label: 'User Agent', value: <span style={{ fontSize: 12, wordBreak: 'break-word' }}>{row.userAgent || '—'}</span>, mono: true },
                { label: 'API key', value: <span style={{ fontSize: 12 }}>{row.appApiKey ? row.appApiKey.slice(0, 12) + '…' : '—'}</span>, mono: true },
                { label: 'Path', value: <span style={{ fontSize: 12 }}>{row.path}</span>, mono: true },
                { label: 'Tokens', value: <span style={{ fontSize: 12 }}>{fmtTokensIn(row.tokensIn)} in · {fmtTokensOut(row.tokensOut)} out</span>, mono: true },
                { label: 'Duration', value: <span style={{ fontSize: 12 }}>{fmtMs(row.ms)}</span>, mono: true },
                { label: 'Time', value: <span style={{ fontSize: 12 }}>{fmtAgeFromTs(row.ts)}</span>, mono: true },
                { label: 'Gateway', value: <span style={{ fontSize: 12 }}>{row.gatewayName ?? row.gatewayInstanceId ?? '—'}</span>, mono: true },
              ]}
            />

            <div className="label-strong" style={{ marginBottom: 6 }}>Verdict</div>
            {row.flag && row.threat ? (
              <div className="card" style={{ padding: 14, borderColor: 'var(--danger)', borderWidth: 1, background: 'var(--danger-bg)', marginBottom: 16 }}>
                <div className="row-tight" style={{ marginBottom: 8 }}>
                  <span className="dot-sev crit" />
                  <span style={{ fontWeight: 600 }}>{row.blockedStage === 't2_intent' && row.t2Reason ? 'Blocked — T2 Intent Analysis' : row.threat.title}</span>
                </div>
                <div className="row-tight" style={{ flexWrap: 'wrap', gap: 6, marginBottom: row.threat.excerpt ? 10 : 0 }}>
                  <ScannerBadge row={row} />
                  <OwaspPill id={row.threat.framework_id} withName />
                  {row.threat.detector && <Chip kind="muted" mono>{row.threat.detector}</Chip>}
                  {row.confidence !== null
                    ? <Chip kind="muted" mono>conf {(row.confidence * 100).toFixed(0)}%</Chip>
                    : row.blockedStage !== 'semantic_llm' && row.blockedStage !== 't2_intent'
                      ? <Chip kind="muted" mono>rule match</Chip>
                      : null}
                  <Chip kind="muted" mono>{row.threat.action}</Chip>
                </div>
                {row.threat.excerpt && (
                  <pre style={{ margin: '8px 0 0', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--fg-secondary)' }}>
                    {row.threat.excerpt}
                  </pre>
                )}
              </div>
            ) : row.pipelineTrace && !row.flag ? (
              <div className="card" style={{ padding: 14, borderColor: 'var(--accent)', background: 'var(--success-bg)', marginBottom: 16 }}>
                <div className="row-tight">
                  <ShieldCheck w={15} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontWeight: 600 }}>Allowed · {row.pipelineTrace.stages.length} detector{row.pipelineTrace.stages.length !== 1 ? 's' : ''} checked</span>
                </div>
                <div className="caption" style={{ marginTop: 4 }}>
                  No matches across keyword, semantic, and classifier layers.
                  {row.upstreamProviderName && ` Forwarded to ${row.upstreamProviderName}.`}
                </div>
              </div>
            ) : (
              <div className="card" style={{ padding: 14, borderColor: row.flag ? 'var(--danger)' : 'var(--border-subtle)', background: row.flag ? 'var(--danger-bg)' : 'var(--bg-secondary)', marginBottom: 16 }}>
                <div className="row-tight">
                  <ShieldCheck w={15} style={{ color: row.flag ? 'var(--danger)' : 'var(--fg-tertiary)' }} />
                  <span style={{ fontWeight: 600 }}>{row.flag ? `Blocked — ${row.threatTitle ?? 'request blocked'}` : 'Not evaluated · no detection data recorded'}</span>
                </div>
                <div className="caption" style={{ marginTop: 4 }}>
                  {row.flag
                    ? row.pipelineTrace ? 'Request was evaluated and blocked by detection pipeline.' : 'Request did not reach the detection pipeline; no detectors ran.'
                    : 'No pipeline trace was recorded for this request.'}
                </div>
              </div>
            )}

            {row.classificationReason && (
              <div style={{ marginTop: -8, marginBottom: 16, padding: '10px 12px', borderRadius: 6, background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', fontSize: 12 }}>
                <div className="label" style={{ marginBottom: 4 }}>T1 classification reason</div>
                <div style={{ color: 'var(--fg-secondary)', lineHeight: 1.5 }}>{row.classificationReason}</div>
              </div>
            )}
            {row.t2Reason && (
              <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 6, background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', fontSize: 12 }}>
                <div className="label" style={{ marginBottom: 4 }}>T2 intent analysis reason</div>
                <div style={{ color: 'var(--fg-secondary)', lineHeight: 1.5 }}>{row.t2Reason}</div>
              </div>
            )}

            {row.flag && (
              <div style={{ marginTop: 4 }}>
                <div className="label-strong" style={{ marginBottom: 6 }}>Classification review</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 6, background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ flex: 1, fontSize: 12 }}>{classificationFeedbackCell(row)}</div>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setShowFeedbackModal(true); setFeedbackCorrect(row.isClassificationCorrect ?? null); setFeedbackReason(row.correctionReason || '') }}>
                    <Pencil w={12} /> Review
                  </button>
                </div>
                {row.correctionReason && (
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--fg-secondary)', padding: '6px 8px', borderRadius: 4, background: 'var(--bg-sunken)' }}>
                    {row.correctionReason}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Payload ── */}
        {activeTab === 'payload' && (
          <>
            <div className="label-strong" style={{ marginBottom: 6 }}>Input (extracted text)</div>
            {row.userPrompt
              ? <pre style={{ margin: '0 0 16px', padding: '10px 12px', borderRadius: 6, background: 'var(--bg-sunken)', fontSize: 12, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--fg-secondary)', border: '1px solid var(--border-subtle)', lineHeight: 1.6 }}>{row.userPrompt}</pre>
              : <div className="caption" style={{ marginBottom: 16 }}>—</div>}

            <JsonPayload data={row.rawInputPayload} label="Raw Input Payload" />

            <div className="label-strong" style={{ marginBottom: 6 }}>Response</div>
            {row.flag && row.threat
              ? <pre style={{ margin: 0, padding: '10px 12px', borderRadius: 6, background: 'var(--danger-bg)', fontSize: 12, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--danger)', border: '1px solid var(--danger)' }}>{'// response replaced by gateway — ' + (row.threat.detector || 'blocked')}</pre>
              : row.responseBody
                ? <pre style={{ margin: 0, padding: '10px 12px', borderRadius: 6, background: 'var(--bg-sunken)', fontSize: 12, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--fg-secondary)', border: '1px solid var(--border-subtle)', lineHeight: 1.6 }}>{row.responseBody}</pre>
                : <div className="caption">—</div>}

            <JsonPayload data={row.rawOutputPayload} label="Raw Output Payload" />
          </>
        )}

        {/* ── Detectors ── */}
        {activeTab === 'detectors' && <DetectorList row={row} detectors={detectors} />}

        {/* ── Timeline ── */}
        {activeTab === 'timeline' && <TimelineList row={row} />}

        {/* ── Threat Knowledge ── */}
        {activeTab === 'threatknowledge' && <ThreatKnowledgeTab row={row} />}

        {/* ── Tools ── */}
        {activeTab === 'tools' && (
          <>
            <div className="label-strong" style={{ marginBottom: 6 }}>Tool use audit</div>
            {toolsLoading ? (
              <LoadingState size="sm" />
            ) : toolRows.length === 0 ? (
              <div className="caption">No tool use recorded for this request.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, color: 'var(--fg-secondary)' }}>Tool Name</th>
                    <th style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 600, color: 'var(--fg-secondary)' }}>Invocations</th>
                    <th style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 600, color: 'var(--fg-secondary)' }}>Violation</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600, color: 'var(--fg-secondary)' }}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {toolRows.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)', background: r.violation_flag ? 'var(--warn-bg, rgba(245,158,11,0.08))' : undefined }}>
                      <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{r.tool_name}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--fg-secondary)' }}>{r.invocation_count}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        {r.violation_flag
                          ? <Chip kind="warn" mono>blocked</Chip>
                          : <Chip kind="ok" mono>allowed</Chip>}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--fg-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{fmtDateTimeStr(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
        </div>
      </Drawer>

      {showFeedbackModal && (
        <ClassificationFeedbackModal
          isOpen={showFeedbackModal}
          correct={feedbackCorrect}
          reason={feedbackReason}
          onChangeCorrect={v => setFeedbackCorrect(v)}
          onChangeReason={r => setFeedbackReason(r)}
          onConfirm={handleFeedbackConfirm}
          onCancel={() => setShowFeedbackModal(false)}
        />
      )}
      {toast && <Toast msg={toast.msg} kind={toast.kind} />}
    </>
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
  return (
    <Drawer
      open={isOpen}
      title="Classification feedback"
      onClose={onCancel}
      width={420}
      zIndex={210}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={onConfirm} disabled={correct === null}>
            Save feedback
          </button>
        </div>
      }
    >
      <p style={{ marginBottom: 12, fontSize: 12, color: 'var(--fg-secondary)', lineHeight: 1.5 }}>
        Was the classification correct? This helps improve the model.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className={`btn ${correct === true ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onChangeCorrect(true)} style={{ flex: 1 }}>
          <Check w={12} /> Correct
        </button>
        <button className={`btn ${correct === false ? 'btn-danger' : 'btn-secondary'}`}
          onClick={() => onChangeCorrect(false)} style={{ flex: 1 }}>
          <X w={12} /> Incorrect
        </button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div className="label" style={{ marginBottom: 4 }}>Reason (optional)</div>
        <textarea value={reason} onChange={e => onChangeReason(e.target.value)}
          placeholder="Explain your feedback…"
          style={{ width: '100%', minHeight: 80, padding: 8, borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'var(--bg-sunken)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
        />
      </div>
    </Drawer>
  )
}

// ── Inline imports needed by RowDetail ────────────────────────────────────────

import { fmtAgeFromTs } from '../../utils/format'
import { fmtMs, fmtTokens } from './AIActivitiesShared'

function fmtTokensIn(n: number): string { return fmtTokens(n) }
function fmtTokensOut(n: number): string { return fmtTokens(n) }

// RowDetail needs these helper functions — import from shared file
import { classifierCell, classificationFeedbackCell } from './AIActivitiesShared'
import { Toast } from './ProviderShared'
