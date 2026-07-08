import React from 'react'
import { Chip, LoadingState, MiniBarChart, SegmentedBar } from '../../components/ui'
import type { T2Stats } from '../../api/stats'

interface Props {
  stats: T2Stats | null
  loading: boolean
}

function buildHourLabels(bars: { hour: string }[]): (string | null)[] {
  return bars.map((b, i) => {
    if (i === bars.length - 1) return 'now'
    if (i % 6 === 0) {
      const d = new Date(b.hour)
      const h = d.getUTCHours()
      return h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
    }
    return null
  })
}

const T2ReportPanel: React.FC<Props> = ({ stats, loading }) => {
  const maxByApp = stats ? Math.max(...stats.by_app.map(a => a.t2_scanned)) || 1 : 1

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-hdr">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3>T2 Intent Analysis · 24h</h3>
          <Chip kind="warn" mono>tier-2</Chip>
        </div>
        <div className="right">
          <span className="meta">second-opinion LLM scan · post-T1 allow</span>
        </div>
      </div>

      <div style={{ padding: '14px 16px 16px' }}>
        {loading ? (
          <LoadingState message="Loading T2 data…" size="sm" />
        ) : !stats || stats.t2_scanned === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--fg-tertiary)', fontSize: 13 }}>
            No T2 scans in the last 24 hours. Enable T2 on an app to activate intent analysis.
          </div>
        ) : (
          <>
            {/* KPI strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
              <div style={{ background: 'var(--bg-sunken)', borderRadius: 6, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 4 }}>Scanned</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{stats.t2_scanned.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2 }}>prompts analysed</div>
              </div>
              <div style={{ background: 'var(--bg-sunken)', borderRadius: 6, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 4 }}>Flagged</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: stats.t2_flagged > 0 ? 'var(--warning)' : 'inherit' }}>
                  {stats.t2_flagged.toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2 }}>flag rate {(stats.t2_flag_rate * 100).toFixed(1)}%</div>
              </div>
              <div style={{ background: 'var(--bg-sunken)', borderRadius: 6, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 4 }}>Blocked</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: stats.blocked_by_t2 > 0 ? 'var(--danger)' : 'inherit' }}>
                  {stats.blocked_by_t2.toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2 }}>by T2 (guard mode)</div>
              </div>
              <div style={{ background: 'var(--bg-sunken)', borderRadius: 6, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 4 }}>Avg confidence</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  {stats.avg_t2_confidence !== null ? `${(stats.avg_t2_confidence * 100).toFixed(0)}%` : '—'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2 }}>on flagged prompts</div>
              </div>
            </div>

            {/* Chart + per-app */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <div className="label" style={{ marginBottom: 8, fontSize: 11 }}>Hourly scan trend · 24h</div>
                <MiniBarChart values={stats.hourly_bars.map(b => b.scanned)} secondaryValues={stats.hourly_bars.map(b => b.flagged)} height={48} color="var(--info)" secondaryColor="var(--danger)" labels={buildHourLabels(stats.hourly_bars)} />
                <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11, color: 'var(--fg-secondary)' }}>
                  <span><i style={{ display: 'inline-block', width: 10, height: 6, background: 'var(--info)', opacity: 0.45, marginRight: 4, borderRadius: 1, verticalAlign: 'middle' }} />Scanned</span>
                  <span><i style={{ display: 'inline-block', width: 10, height: 6, background: 'var(--danger)', marginRight: 4, borderRadius: 1, verticalAlign: 'middle' }} />Flagged</span>
                </div>
              </div>

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
                              { value: Math.max(0, a.t2_scanned - a.t2_flagged), color: 'var(--info)' },
                              ...(a.t2_flagged > 0 ? [{ value: a.t2_flagged, color: 'var(--danger)' }] : []),
                            ]}
                            max={maxByApp}
                            height={4}
                          />
                        </div>
                      </div>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{a.t2_scanned}</span>
                      <span className="mono" style={{ fontSize: 11, color: a.t2_flagged > 0 ? 'var(--danger)' : 'var(--fg-tertiary)' }}>
                        {a.t2_flagged > 0 ? `${a.t2_flagged} flag` : '—'}
                      </span>
                    </div>
                  ))}
                  {stats.by_app.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>No per-app data</div>
                  )}
                </div>
              </div>
            </div>

            {/* Top reasons */}
            {stats.top_reasons.length > 0 && (
              <div>
                <div className="label" style={{ marginBottom: 8, fontSize: 11 }}>Top intent flags · reason</div>
                <div className="stack" style={{ gap: 4 }}>
                  {stats.top_reasons.map((r, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'start', padding: '6px 10px', background: 'var(--bg-sunken)', borderRadius: 4 }}>
                      <span className="mono" style={{ fontSize: 10, color: 'var(--fg-tertiary)', paddingTop: 1 }}>#{i + 1}</span>
                      <span style={{ fontSize: 12, color: 'var(--fg-secondary)', lineHeight: 1.4 }}>{r.reason}</span>
                      <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--warning)', whiteSpace: 'nowrap' }}>{r.count}×</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default T2ReportPanel
