import React from 'react'
import { X, AlertTri } from '../../components/ui/Icons'
import { LoadingState, ProgressBar } from '../../components/ui'
import { apiFetch } from '../../api/client'
import { reviewAllStream, reviewRecord, type ReviewProgressEvent, type ReviewCompleteEvent } from '../../api/qualityReview'

type Phase = 'confirm' | 'running' | 'complete'

const LABELS: Record<string, string> = {
  'threat-knowledge':    'Threat Knowledge entries',
  'detectors':           'Detector Rules',
  'tools':               'Tool Guardrails',
  't2-agent-prompts':    'T2 Agent Prompts',
  'content-quality-judge-prompts': 'Content Quality Agent presets',
}

interface ReviewResult {
  target_name: string
  quality: string
  reason: string
  duration?: number
}

function formatDuration(ms: number): string {
  const secs = Math.round(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const rem = secs % 60
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`
}

export function ReviewProgressModal({
  resourceType,
  targetId,
  targetName,
  newOnly,
  onClose,
}: {
  resourceType: string
  targetId?: string
  targetName?: string
  newOnly?: boolean
  onClose: () => void
}) {
  const [phase, setPhase] = React.useState<Phase>(targetId ? 'running' : 'confirm')
  const [progress, setProgress] = React.useState<{ current: number; total: number; succeeded: number; failed: number; target_name?: string; quality?: string; reason?: string } | null>(null)
  const [lastResult, setLastResult] = React.useState<ReviewResult | null>(null)
  const [pendingCount, setPendingCount] = React.useState<number | null>(null)
  const [countLoading, setCountLoading] = React.useState(!targetId)
  const [error, setError] = React.useState<string | null>(null)
  const abortRef = React.useRef<(() => void) | null>(null)
  const lastEventTimeRef = React.useRef<number>(0)
  const prevElapsedRef = React.useRef<number>(0)
  const [reviewingName, setReviewingName] = React.useState('')
  const namesRef = React.useRef<string[]>([])

  const isSingle = !!targetId

  // Fetch count on mount for bulk mode
  React.useEffect(() => {
    if (!isSingle) {
      const q = new URLSearchParams({ new_only: String(!!newOnly) })
      apiFetch<{ data: { total: number } }>(`/api/review/${resourceType}/count?${q}`)
        .then(res => setPendingCount(res.data.total))
        .catch(() => setPendingCount(0))
        .finally(() => setCountLoading(false))
    }
  }, [])

  function handleStart() {
    setPhase('running')
    setProgress({ current: 1, total: pendingCount ?? 0, succeeded: 0, failed: 0 })
    lastEventTimeRef.current = Date.now()
    const stream = reviewAllStream(
      resourceType,
      (e: ReviewProgressEvent) => {
        const now = Date.now()
        const elapsed = now - lastEventTimeRef.current
        lastEventTimeRef.current = now
        prevElapsedRef.current = elapsed
        // Advance "Reviewing:" to the next item, or clear if it was the last
        const nextName = namesRef.current[e.current]
        setReviewingName(nextName || '')
        // Save this completed item as the result to display
        if (e.quality && e.target_name) {
          const r: ReviewResult = { target_name: e.target_name, quality: e.quality, reason: e.reason || '', duration: elapsed }
          setLastResult(r)
        }
        setProgress({
          current: e.current, total: e.total, succeeded: e.succeeded, failed: e.failed,
          target_name: e.target_name, quality: e.quality, reason: e.reason,
        })
      },
      (e: ReviewCompleteEvent) => {
        setProgress(p => p ? { ...p, current: e.total, total: e.total, succeeded: e.succeeded, failed: e.failed } : { current: e.total, total: e.total, succeeded: e.succeeded, failed: e.failed })
        setPhase('complete')
      },
      (err: string) => setError(err),
      newOnly,
      (_total, firstTargetName, names) => {
        namesRef.current = names || []
        if (firstTargetName) {
          setProgress(p => p ? { ...p, target_name: firstTargetName } : p)
          setReviewingName(firstTargetName)
        }
      },
    )
    abortRef.current = stream.abort
  }

  React.useEffect(() => {
    if (isSingle && targetId && targetName) {
      setProgress({ current: 0, total: 1, succeeded: 0, failed: 0, target_name: targetName })
      const start = Date.now()
      reviewRecord(resourceType, targetId).then(result => {
        setProgress({
          current: 1, total: 1, succeeded: 1, failed: 0,
          target_name: targetName, quality: result.quality, reason: result.reason,
        })
        setLastResult({ target_name: targetName, quality: result.quality, reason: result.reason, duration: Date.now() - start })
        setPhase('complete')
      }).catch(err => {
        setProgress({ current: 1, total: 1, succeeded: 0, failed: 1, target_name: targetName })
        setError((err as Error).message || 'Review failed')
        setPhase('complete')
      })
    }
  }, [])

  const pct = progress ? Math.round((progress.current / progress.total) * 100) : 0

  function handleDone() {
    if (phase === 'running') abortRef.current?.()
    onClose()
  }

  const hasItems = pendingCount !== null && pendingCount > 0

  // Determine what result to display: lastResult (latest completed item) or fallback to progress
  const displayResult = lastResult
    || (progress?.quality && progress?.target_name
        ? { target_name: progress.target_name, quality: progress.quality, reason: progress.reason || '', duration: prevElapsedRef.current || undefined }
        : null)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 220, background: 'var(--bg-overlay)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }} onClick={phase === 'complete' ? onClose : undefined}>
      <div className="card" style={{ width: 480, padding: 0, marginTop: '25vh' }}
        onClick={e => e.stopPropagation()}>
        <div className="card-hdr">
          <h3>{phase === 'confirm' ? 'Review All' : phase === 'running' ? 'Reviewing…' : 'Review Complete'}</h3>
          {(phase === 'complete' || phase === 'confirm') && (
            <div className="right"><button className="icon-btn" onClick={onClose}><X w={14} /></button></div>
          )}
        </div>

        <div style={{ padding: '20px' }}>

          {/* Confirm phase — bulk mode only */}
          {phase === 'confirm' && (
            <>
              {countLoading ? (
                <LoadingState size="sm" />
              ) : !hasItems ? (
                <>
                  <div style={{ fontSize: 13, marginBottom: 16, lineHeight: 1.5, color: 'var(--fg-secondary)' }}>
                    {newOnly
                      ? 'All entries have already been reviewed. No new items to process.'
                      : 'No entries to review.'}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-primary" onClick={onClose}>Done</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 13, marginBottom: 16, lineHeight: 1.5, color: 'var(--fg-secondary)' }}>
                    <strong>{pendingCount}</strong> {newOnly ? 'new ' : ''}{LABELS[resourceType] || resourceType} will be reviewed using the configured Data Review Provider.
                    Each entry will be analyzed and rated as <strong>Good</strong>, <strong>Poison</strong>, or <strong>Poor Quality</strong>.
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleStart}>Start Review</button>
                  </div>
                </>
              )}
            </>
          )}

          {/* Running / Complete — shared progress layout */}
          {phase !== 'confirm' && (
            <>
              {/* Progress bar */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--fg-secondary)', marginBottom: 6 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {phase === 'running' && <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid var(--fg-tertiary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />}
                    {phase === 'running' ? (progress ? 'Progress' : 'Starting…') : 'Complete'}
                  </span>
                  <span className="mono">{progress?.current ?? 0} / {progress?.total ?? 0}</span>
                </div>
                <ProgressBar value={phase === 'complete' ? 100 : pct} height={8} color={error ? 'var(--danger)' : phase === 'complete' ? 'var(--ok)' : 'var(--accent)'} />
              </div>

              {/* Current reviewing — shown in running phase */}
              {phase === 'running' && (targetName || reviewingName) && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
                  padding: '10px 14px', borderRadius: 6,
                  background: 'rgba(91,141,239,0.06)',
                  border: '1px solid rgba(91,141,239,0.15)',
                }}>
                  <span style={{ fontSize: 11, color: 'var(--info)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    Reviewing:
                  </span>
                  <span style={{ fontWeight: 500, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {targetName || reviewingName}
                  </span>
                </div>
              )}

              {/* Reviewed result — name + quality badge + reason */}
              {displayResult && (
                <div style={{
                  marginBottom: 12, padding: '12px 14px', borderRadius: 6,
                  background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: displayResult.reason || displayResult.duration != null ? 6 : 0 }}>
                    <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {phase === 'complete' ? 'Reviewed:' : 'Recently reviewed:'}
                    </span>
                    <span style={{ fontWeight: 500, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {displayResult.target_name}
                    </span>
                    <QualityBadge quality={displayResult.quality} />
                  </div>
                  {displayResult.reason && (
                    <div style={{ fontSize: 12, color: 'var(--fg-secondary)', lineHeight: 1.5 }}>
                      {displayResult.reason}
                    </div>
                  )}
                  {displayResult.duration != null && (
                    <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 4 }}>
                      Time used: {formatDuration(displayResult.duration)}
                    </div>
                  )}
                </div>
              )}

              {/* Counters */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <div className="card" style={{ flex: 1, padding: '10px 12px', borderColor: 'var(--ok)' }}>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--ok)' }}>{progress?.succeeded ?? 0}</div>
                  <div style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>Success</div>
                </div>
                <div className="card" style={{ flex: 1, padding: '10px 12px', borderColor: 'var(--danger)' }}>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--danger)' }}>{progress?.failed ?? 0}</div>
                  <div style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>Failed</div>
                </div>
              </div>

              {error && (
                <div style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>
                  {error}
                </div>
              )}

              {phase === 'complete' && (progress?.failed ?? 0) > 0 && (
                <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(217,163,46,0.1)', color: 'var(--warn)', fontSize: 11, marginBottom: 16, lineHeight: 1.4 }}>
                  <AlertTri w={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  Review failed. Check the Data Review Provider configuration and try again.
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={handleDone}>
                  {phase === 'running' ? 'Cancel' : 'Done'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function QualityBadge({ quality }: { quality: string }) {
  const color = quality === 'good' ? 'var(--ok)' : quality === 'poison' ? 'var(--danger)' : 'var(--warn)'
  const label = quality === 'poor_quality' ? 'poor' : quality
  return <span style={{ color, fontWeight: 600, textTransform: 'capitalize' }}>{label}</span>
}
