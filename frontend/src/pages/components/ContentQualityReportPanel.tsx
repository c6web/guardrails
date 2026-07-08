import React from 'react'
import { Chip, LoadingState, SegmentedBar } from '../../components/ui'
import type { ContentQualityStats } from '../../api/stats'

interface Props {
  stats: ContentQualityStats | null
  loading: boolean
}

const ContentQualityReportPanel: React.FC<Props> = ({ stats, loading }) => {
  const maxByApp = stats ? Math.max(...stats.by_app.map(a => a.scanned)) || 1 : 1

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-hdr">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3>Content Quality Scan · 24h</h3>
          <Chip kind="info" mono>groundedness/relevance</Chip>
        </div>
        <div className="right">
          <span className="meta">post-generation quality judgment · TruLens</span>
        </div>
      </div>

      <div style={{ padding: '14px 16px 16px' }}>
        {loading ? (
          <LoadingState message="Loading content quality data…" size="sm" />
        ) : !stats || stats.scanned === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--fg-tertiary)', fontSize: 13 }}>
            No content quality scans in the last 24 hours. Enable Content Quality Scan on an app and configure a Content Quality Provider to activate.
          </div>
        ) : (
          <>
            {/* KPI strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
              <div style={{ background: 'var(--bg-sunken)', borderRadius: 6, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 4 }}>Scanned</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{stats.scanned.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2 }}>responses scored</div>
              </div>
              <div style={{ background: 'var(--bg-sunken)', borderRadius: 6, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 4 }}>Flagged</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: stats.flagged > 0 ? 'var(--warning)' : 'inherit' }}>
                  {stats.flagged.toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2 }}>flag rate {(stats.flag_rate * 100).toFixed(1)}%</div>
              </div>
              <div style={{ background: 'var(--bg-sunken)', borderRadius: 6, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 4 }}>Avg groundedness</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  {stats.avg_groundedness !== null ? `${(stats.avg_groundedness * 100).toFixed(0)}%` : '—'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2 }}>across scanned responses</div>
              </div>
              <div style={{ background: 'var(--bg-sunken)', borderRadius: 6, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 4 }}>Avg relevance</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  {stats.avg_relevance !== null ? `${(stats.avg_relevance * 100).toFixed(0)}%` : '—'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2 }}>across scanned responses</div>
              </div>
            </div>

            {/* By app */}
            <div>
              <div className="label" style={{ marginBottom: 8, fontSize: 11 }}>By app</div>
              <div className="stack" style={{ gap: 6 }}>
                {stats.by_app.map(a => (
                  <div key={a.app_name} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center', fontSize: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.app_name}</div>
                      <div style={{ marginTop: 3 }}>
                        <SegmentedBar
                          segments={[
                            { value: Math.max(0, a.scanned - a.flagged), color: 'var(--info)' },
                            ...(a.flagged > 0 ? [{ value: a.flagged, color: 'var(--warning)' }] : []),
                          ]}
                          max={maxByApp}
                          height={4}
                        />
                      </div>
                    </div>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{a.scanned}</span>
                    <span className="mono" style={{ fontSize: 11, color: a.flagged > 0 ? 'var(--warning)' : 'var(--fg-tertiary)' }}>
                      {a.flagged > 0 ? `${a.flagged} flag` : '—'}
                    </span>
                  </div>
                ))}
                {stats.by_app.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>No per-app data</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default ContentQualityReportPanel
