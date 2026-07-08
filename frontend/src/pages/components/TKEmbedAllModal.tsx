import React from 'react'
import { X, AlertTri } from '../../components/ui/Icons'
import { ProgressBar } from '../../components/ui'
import { embedAllThreatKnowledgeStream, type EmbedProgressEvent, type EmbedCompleteEvent } from '../../api/threatKnowledge'

type Phase = 'confirm' | 'running' | 'complete'

export function EmbedAllProgressModal({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = React.useState<Phase>('confirm')
  const [progress, setProgress] = React.useState<EmbedProgressEvent | null>(null)
  const [complete, setComplete] = React.useState<EmbedCompleteEvent | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [abort, setAbort] = React.useState<(() => void) | null>(null)

  function handleStart() {
    setPhase('running')
    setError(null)
    const stream = embedAllThreatKnowledgeStream(
      true,
      (e: EmbedProgressEvent) => setProgress(e),
      (e: EmbedCompleteEvent) => {
        setComplete(e)
        setPhase('complete')
      },
      (err: string) => setError(err),
    )
    setAbort(() => stream.abort)
  }

  function handleCancel() {
    abort?.()
    onClose()
  }

  const pct = progress
    ? Math.round((progress.current / progress.total) * 100)
    : 0

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 220, background: 'var(--bg-overlay)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }} onClick={phase === 'complete' ? onClose : undefined}>
      <div className="card" style={{ width: 480, padding: 0, marginTop: '30vh' }}
        onClick={e => e.stopPropagation()}>
        <div className="card-hdr">
          <h3>{phase === 'running' ? 'Embedding Threat Knowledge' : phase === 'complete' ? 'Embedding Complete' : 'Re-embed All Entries'}</h3>
          <div className="right">
            {(phase === 'complete' || phase === 'confirm') && (
              <button className="icon-btn" onClick={onClose}><X w={14} /></button>
            )}
          </div>
        </div>

        <div style={{ padding: '20px' }}>
          {phase === 'confirm' && (
            <>
              <div style={{ fontSize: 13, marginBottom: 16, lineHeight: 1.5, color: 'var(--fg-secondary)' }}>
                This will re-embed all threat knowledge entries that have a threat context.
                Existing embeddings will be replaced. The gateway cache will be reloaded after completion.
              </div>
              {error && (
                <div style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>
                  {error}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary" onClick={handleStart}>Start Embedding</button>
              </div>
            </>
          )}

          {phase === 'running' && (
            <>
              {/* Progress bar */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--fg-secondary)', marginBottom: 6 }}>
                  <span>Processing…</span>
                  <span className="mono">{progress?.current ?? 0} / {progress?.total ?? 0}</span>
                </div>
                <ProgressBar value={pct} height={8} color={error ? 'var(--danger)' : 'var(--accent)'} />
                <div className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 4 }}>{pct}%</div>
              </div>

              {/* Current entry */}
              {progress && (
                <div style={{ fontSize: 12, color: 'var(--fg-secondary)', marginBottom: 12, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {progress.skipped
                    ? <>Skipped (already valid): <strong>{progress.entry_name}</strong></>
                    : progress.success
                      ? <>Embedded: <strong>{progress.entry_name}</strong></>
                      : <>Failed: <strong>{progress.entry_name}</strong></>}
                  {progress.error && <span style={{ color: 'var(--danger)', marginLeft: 6 }}>{progress.error}</span>}
                </div>
              )}

              {/* Counters */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div className="card" style={{ flex: 1, padding: '10px 14px', borderColor: 'var(--ok)' }}>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--ok)' }}>{progress?.succeeded ?? 0}</div>
                  <div style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>Succeeded</div>
                </div>
                <div className="card" style={{ flex: 1, padding: '10px 14px', borderColor: 'var(--danger)' }}>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--danger)' }}>{progress?.failed ?? 0}</div>
                  <div style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>Failed</div>
                </div>
              </div>

              {error && (
                <div style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={handleCancel}>Cancel</button>
              </div>
            </>
          )}

          {phase === 'complete' && complete && (
            <>
              {/* Complete bar */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--fg-secondary)', marginBottom: 6 }}>
                  <span>Complete</span>
                  <span className="mono">{complete.total} / {complete.total}</span>
                </div>
                <ProgressBar value={100} height={8} color={complete.failed > 0 && complete.succeeded === 0 ? 'var(--danger)' : 'var(--ok)'} />
              </div>

              {/* Summary stats */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <div className="card" style={{ flex: 1, padding: '12px 14px', minWidth: 100 }}>
                  <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--ok)' }}>{complete.succeeded}</div>
                  <div style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>Succeeded</div>
                </div>
                <div className="card" style={{ flex: 1, padding: '12px 14px', minWidth: 100 }}>
                  <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--danger)' }}>{complete.failed}</div>
                  <div style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>Failed</div>
                </div>
                <div className="card" style={{ flex: 1, padding: '12px 14px', minWidth: 100 }}>
                  <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>{complete.regenerated}</div>
                  <div style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>Regenerated</div>
                </div>
              </div>

              {complete.triggered_reload && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 6, background: 'rgba(118,180,0,0.08)', color: 'var(--ok)', fontSize: 12, marginBottom: 16 }}>
                  <span style={{ fontSize: 14 }}>↻</span> Gateway cache reload triggered
                </div>
              )}

              {error && (
                <div style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>
                  {error}
                </div>
              )}

              {complete.failed > 0 && (
                <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(217,163,46,0.1)', color: 'var(--warn)', fontSize: 11, marginBottom: 16, lineHeight: 1.4 }}>
                  <AlertTri w={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  {complete.failed} entr{complete.failed === 1 ? 'y' : 'ies'} failed. Check the embedding provider configuration and try again.
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={onClose}>Done</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
