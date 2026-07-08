import React from 'react'
import { Copy, Check } from '../../components/ui/Icons'
import type { PipelineStage, TrafficRow } from '../../types'

// ── Formatting helpers ────────────────────────────────────────────────────────

export function fmtMs(ms: number): string {
  if (!ms) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`
}

export function fmtTokens(n: number): string {
  if (!n) return '—'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

// ── Status code chip ──────────────────────────────────────────────────────────

import { Chip, Badge, ScannerBadge, Timeline } from '../../components/ui'

export function statusChip(code: number): React.ReactNode {
  const ok = code >= 200 && code < 300
  const err = code >= 400
  if (ok) return <Badge kind="ok">{code}</Badge>
  if (err) return <Badge kind="err">{code}</Badge>
  return <Badge kind="muted">{code}</Badge>
}

// ── Copy button ───────────────────────────────────────────────────────────────

import { copyToClipboard } from '../../utils/format'

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false)
  function handleCopy() {
    copyToClipboard(text).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }
  return (
    <button className="icon-btn" style={{ gap: 4, fontSize: 11 }} onClick={handleCopy}>
      {copied ? <><Check w={11} /> Copied</> : <><Copy w={11} /></>}
    </button>
  )
}

// ── Pagination (re-exported from ui for backward compat) ──────────────────────

export { Pagination } from '../../components/ui'

// ── Threat Knowledge tab (threat knowledge matches) ──────────────────────────

export function ThreatKnowledgeTab({ row }: { row: TrafficRow }) {
  const matches = row.threatKnowledgeMatches ?? null
  const threshold = row.semanticThreshold ?? null
  const isFalsePositive = row.falsePositiveCandidate

  if (!matches || matches.length === 0) {
    return (
      <div className="caption" style={{ padding: '24px 0', textAlign: 'center', color: 'var(--fg-tertiary)' }}>
        No threat knowledge matches recorded for this request
      </div>
    )
  }

  return (
    <div>
      {isFalsePositive && (
        <div style={{
          padding: '10px 14px',
          marginBottom: 12,
          borderRadius: 6,
          border: '1px solid var(--warning)',
          background: 'var(--warning-bg)',
          fontSize: 12,
          color: 'var(--warning)',
        }}>
          <strong>⚠ False Positive Candidate:</strong> Semantic search matched threat patterns but the classifier determined this request was safe. Review manually.
        </div>
      )}

      <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--fg-secondary)' }}>
        Embedding threshold used: <span className="mono">{threshold !== null ? `${(threshold * 100).toFixed(1)}%` : '—'}</span>
      </div>

      <table className="t" style={{ fontSize: 12 }}>
        <thead>
          <tr>
            <th>Entry</th>
            <th>ID</th>
            <th>Similarity</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m, i) => (
            <tr key={i}>
              <td style={{ fontSize: 12 }}>{m.name}</td>
              <td className="mono" style={{ fontSize: 11 }}>{m.id}</td>
              <td className="mono">{(m.similarity * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export { ScannerBadge }

// ── Provider display helpers ──────────────────────────────────────────────────

export function classifierCell(row: TrafficRow): React.ReactNode {
  if (row.detector === 'classifier') {
    return <span className="mono" style={{ fontSize: 12 }}>{row.classifierProviderName || '—'}</span>
  }
  if (row.detector) {
    return <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>Not used · blocked by keyword</span>
  }
  if (row.classifierProviderName) {
    return <span className="mono" style={{ fontSize: 12 }}>{row.classifierProviderName}</span>
  }
  return <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>—</span>
}

export function classificationFeedbackCell(row: TrafficRow): React.ReactNode {
  if (row.isClassificationCorrect === true) {
    return <Badge kind="ok">Correct</Badge>
  }
  if (row.isClassificationCorrect === false) {
    return <Badge kind="err">Incorrect</Badge>
  }
  return <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>Not reviewed</span>
}

// ── Detector list (detectors tab) ────────────────────────────────────────────

import type { UIDetector } from '../../api/detectors'

export function DetectorList({ row, detectors }: { row: TrafficRow; detectors: UIDetector[] }) {
  const hitName  = row.detector || null

  if (!row.pipelineTrace) {
    return (
      <div className="caption" style={{ padding: '24px 0', textAlign: 'center', color: 'var(--fg-tertiary)' }}>
        {row.action === 'blocked'
          ? 'No detectors ran — request blocked before reaching the detection pipeline.'
          : 'No detector trace recorded for this request.'}
      </div>
    )
  }

  if (detectors.length === 0) {
    return <div className="caption" style={{ padding: '24px 0', textAlign: 'center', color: 'var(--fg-tertiary)' }}>No detector data available</div>
  }

  return (
    <div className="t-wrap">
      <table className="t" style={{ fontSize: 12 }}>
        <thead>
          <tr>
            <th>Detector</th>
            <th>Category</th>
            <th>Mode</th>
            <th>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {detectors.map(d => {
            const isHit = d.name === hitName
            return (
              <tr key={d.id} style={isHit ? { background: 'var(--danger-bg)' } : {}}>
                <td className="mono" style={{ fontSize: 11 }}>{d.name}</td>
                <td>
                  {d.category
                    ? <Chip kind="warn" mono>{d.category}</Chip>
                    : d.frameworkIds.length > 0
                      ? <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>LLM</span>
                      : <span style={{ color: 'var(--fg-tertiary)' }}>—</span>}
                </td>
                <td>
                  <span style={{ fontSize: 10, color: d.mode === 'block' ? 'var(--danger)' : 'var(--warning, #D9A32E)', fontWeight: 600, textTransform: 'uppercase' }}>
                    {d.mode}
                  </span>
                </td>
                <td>
                  {isHit
                    ? <Chip kind="err" dot>hit</Chip>
                    : <Chip kind="ok" dot>pass</Chip>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Timeline (timeline tab) ───────────────────────────────────────────────────

export const STAGE_LABELS: Record<string, string> = {
  acl:                'Network ACL',
  keyword_regex:      'T1 · Keyword / Regex',
  semantic:           'T1 · Semantic',
  llm_classify:       'T1 · LLM Classifier',
  t2_intent_analysis: 'T2 · Intent Analysis',
  output_scan:        'Output Scan',
  bypass:             'Bypass',
}
const HIT_DECISIONS = new Set(['attack', 'hit', 'block', 'blocked', 'redact', 'flagged', 'monitored', 'match'])

export function stageNote(s: PipelineStage): string {
  const parts: string[] = [s.decision.replace(/_/g, ' ')]
  if (s.provider) parts.push(`via ${s.provider}`)
  if (typeof s.threshold === 'number') parts.push(`threshold ${s.threshold.toFixed(2)}`)
  if (s.reason) parts.push(`— ${s.reason}`)
  return parts.join(' · ')
}

export function TimelineList({ row }: { row: TrafficRow }) {
  const blocked  = row.flag && row.threat
  const action   = row.threat?.action || (row.flag ? 'flagged' : 'forwarded')

  interface Step { time: string; label: string; detail: string; hit?: boolean; err?: boolean }
  const steps: Step[] = [
    { time: '+0ms',  label: 'Ingress',   detail: `${row.method} ${row.path} · src ${row.src || '—'}` },
    { time: '+~2ms', label: 'Auth',      detail: `api-key ${row.appApiKey ? row.appApiKey.slice(0, 12) + '…' : '—'} · app "${row.appName}"` },
  ]

  if (row.tokensIn > 0) {
    steps.push({ time: '+~4ms', label: 'Token Check', detail: `${row.tokensIn.toLocaleString()} input tokens counted` })
  }

  const stages = row.pipelineTrace?.stages ?? []
  const noTrace = stages.length === 0
  if (stages.length > 0) {
    for (const s of stages) {
      steps.push({
        time: s.ms !== null ? `${s.ms}ms` : '—',
        label: STAGE_LABELS[s.stage] ?? s.stage.replace(/_/g, ' '),
        detail: stageNote(s),
        hit: HIT_DECISIONS.has(s.decision.toLowerCase()),
        err: s.decision.toLowerCase() === 'error',
      })
    }
  } else if (row.action === 'blocked') {
    steps.push({ time: '+~2ms', label: 'Blocked', hit: true, detail: row.threatTitle ?? 'blocked before reaching the detection pipeline' })
  } else {
    steps.push({ time: '—', label: 'No Trace', err: true, detail: 'no pipeline trace was recorded for this request' })
  }

  if (blocked && row.threat) {
    steps.push({
      time: '+~40ms', label: action.toUpperCase(), hit: true,
      detail: `${row.threat.detector || 'detector'} → ${row.threat.title || row.framework_id || 'threat detected'}`,
    })
    steps.push({
      time: `+~${Math.max(row.ms - 5, 45)}ms`, label: 'Response',
      detail: `gateway returned safe response (${row.code})`,
    })
  } else if (!noTrace || row.action !== 'blocked') {
    steps.push({
      time: '+~45ms', label: 'Upstream',
      detail: row.upstreamProviderName
        ? `routed to ${row.upstreamProviderName}`
        : 'forwarded to upstream provider',
    })
    if (row.tokensOut > 0) {
      steps.push({
        time: `+~${Math.max(row.ms - 10, 50)}ms`, label: 'Response',
        detail: `${row.tokensOut.toLocaleString()} output tokens received`,
      })
    }
  }

  steps.push({
    time: `+${row.ms}ms`, label: 'Egress',
    detail: `HTTP ${row.code} · ${fmtMs(row.ms)} total`,
  })

  return <Timeline events={steps} variant="detailed" timeWidth={72} />
}
