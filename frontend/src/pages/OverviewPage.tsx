import React from 'react'
import { useNavigate } from 'react-router-dom'
import { fmtAge, fmtTs, getTzLabel } from '../utils/format'

const TZ_LABEL = (() => { try { return getTzLabel() } catch { return 'UTC' } })()
import { PageHeader, Breadcrumbs, Sparkline, MicroBars, ActionChip, Heatmap, Chip, StatCard, LoadingState, DataTable, SegmentedBar, type ColumnDef, type Segment } from '../components/ui'
import { Refresh, Download, Plus, ArrowUR, Play, Pause } from '../components/ui/Icons'
import { getApps } from '../api/apps'
import { getThreatEvents, getTrafficLogs } from '../api/logs'
import { getOverviewStats, getHeatmapStats, getAppStats, getFrameworkCounts, getT2Stats, getContentQualityStats, type AppStats, type FrameworkCount, type T2Stats, type ContentQualityStats, type OverviewStats } from '../api/stats'
import T2ReportPanel from './components/T2ReportPanel'
import ContentQualityReportPanel from './components/ContentQualityReportPanel'
import { getGateways } from '../api/gateways'
import { getAllDetectionFrameworks } from '../api/detectionFrameworks'
import type { TweakValues, App, ThreatEvent } from '../types'

interface OverviewPageProps {
  tweaks: TweakValues;
}

function VolumeChart({ bars, flaggedBars, errorBars, blockedBars, labels }: { bars: number[]; flaggedBars?: number[]; errorBars?: number[]; blockedBars?: number[]; labels?: string[] }) {
  const max = Math.max(...bars) || 1
  const xLabels = labels && labels.length > 0 ? labels : ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', 'now']
  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${bars.length}, 1fr)`, gap: 2, alignItems: "end", height: 156 }}>
        {bars.map((v, i) => {
          const blocked = blockedBars?.[i] || 0
          const error = errorBars?.[i] || 0
          const flagged = flaggedBars?.[i] || 0
          const allowed = Math.max(0, v - blocked - error - flagged)
          const allowedH = (allowed / max) * 100
          const flaggedH = (flagged / max) * 100
          const errorH = (error / max) * 100
          const blockedH = (blocked / max) * 100
          return (
            <div key={i} style={{ position: "relative", height: "100%" }} title={`allow: ${allowed.toLocaleString()} · flag: ${flagged.toLocaleString()} · error: ${error.toLocaleString()} · block: ${blocked.toLocaleString()} · total: ${v.toLocaleString()}`}>
              {v > 0 && <div style={{ position: "absolute", top: -14, left: 0, right: 0, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-secondary)", lineHeight: 1 }}>{v.toLocaleString()}</div>}
              {allowedH > 0 && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${allowedH}%`, background: "var(--accent)", opacity: 0.72 }} />}
              {flaggedH > 0 && <div style={{ position: "absolute", bottom: `${allowedH}%`, left: 0, right: 0, height: `${flaggedH}%`, background: "var(--warning)" }} />}
              {errorH > 0 && <div style={{ position: "absolute", bottom: `${allowedH + flaggedH}%`, left: 0, right: 0, height: `${errorH}%`, background: "var(--fg-tertiary)" }} />}
              {blockedH > 0 && <div style={{ position: "absolute", bottom: `${allowedH + flaggedH + errorH}%`, left: 0, right: 0, height: `${blockedH}%`, background: "var(--danger)" }} />}
            </div>
          )
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-tertiary)", letterSpacing: 0.06 }}>
        {xLabels.map((l, i) => <span key={i}>{l}</span>)}
      </div>
    </div>
  )
}

function FrameworkPill({ fw_id }: { fw_id: string }) {
  const [fw, setFw] = React.useState<{ code: string; name: string } | null>(null)

  React.useEffect(() => {
    getAllDetectionFrameworks({ limit: 100 }).then(res => {
      const found = res.data.find((f: { id: string; framework_code: string; name: string }) => f.id === fw_id)
      if (found) setFw({ code: found.framework_code, name: found.name })
    }).catch(() => {})
  }, [fw_id])

  if (!fw) return <Chip kind="muted" mono>{fw_id}</Chip>
  return <Chip kind="warn" mono>{fw.code}</Chip>
}

function LiveTickerMini() {
  const [rows, setRows] = React.useState<unknown[]>([])
  const [paused, setPaused] = React.useState(false)

  React.useEffect(() => {
    getTrafficLogs({ limit: 8 }).then(r => { if (r.rows.length) setRows(r.rows) }).catch(() => {})
  }, [])

  React.useEffect(() => {
    if (paused) return
    const t = setInterval(() => {
      getTrafficLogs({ limit: 3 }).then(r => {
        setRows(prev => {
          const ids = new Set(prev.map((x: unknown) => (x as { id: string }).id))
          const fresh = r.rows.filter((x: unknown) => !ids.has((x as { id: string }).id))
          return [...fresh, ...prev].slice(0, 8)
        })
      }).catch(() => {})
    }, 4000)
    return () => clearInterval(t)
  }, [paused])

  return (
    <div className="ticker">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
        <span style={{ fontSize: 10, color: "var(--fg-tertiary)", letterSpacing: 0.08, textTransform: "uppercase", fontWeight: 600 }}>Live stream</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setPaused(p => !p)}>
          {paused ? <><Play w={11} /> Resume</> : <><Pause w={11} /> Pause</>}
        </button>
      </div>
      <div className="t-wrap">
        <table className="t" style={{ fontFamily: "var(--font-mono)", fontSize: 11, minWidth: 480 }}>
          <thead>
            <tr>
              <th style={{ width: 76, textAlign: "left" }}>Time</th>
              <th style={{ width: 56, textAlign: "left" }}>method</th>
              <th style={{ width: 140, textAlign: "left" }}>app</th>
              <th style={{ width: 120, textAlign: "left" }}>path</th>
              <th className="r">verdict</th>
              <th className="r hide-mobile">status</th>
              <th className="r hide-mobile">latency</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: unknown) => (
              <tr key={(r as { id: string }).id} className={(r as { flag: boolean }).flag ? "flag" : ""}>
                <td style={{ color: "var(--fg-tertiary)" }}>{fmtTs((r as { ts: number }).ts)}</td>
                <td><span className={`m ${(r as { method: string }).method}`} style={{ fontWeight: 600 }}>{(r as { method: string }).method}</span></td>
                <td style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(r as { appName: string }).appName}</td>
                <td style={{ color: "var(--fg-secondary)" }}>{(r as { path: string }).path}</td>
                <td className="r">{(r as { flag: boolean }).flag && (r as { threat: { framework_id: string } }).threat ? <FrameworkPill fw_id={(r as { threat: { framework_id: string } }).threat.framework_id} /> : (r as { code: number }).code >= 400 ? <Chip kind="err" mono>error</Chip> : <Chip kind="ok" mono>pass</Chip>}</td>
                <td className="r hide-mobile"><span className={`code-${(r as { code: number }).code}`}>{(r as { code: number }).code}</span></td>
                <td className="r hide-mobile" style={{ color: "var(--fg-tertiary)" }}>{(r as { ms: number }).ms}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const OverviewPage: React.FC<OverviewPageProps> = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [lastRefresh, setLastRefresh] = React.useState<Date>(new Date())
  const [apps, setApps] = React.useState<App[]>([])
  const [recent, setRecent] = React.useState<ThreatEvent[]>([])
  const [allThreatEvents, setAllThreatEvents] = React.useState<ThreatEvent[]>([])
  const [gateways, setGateways] = React.useState<{ name: string; location: string | null }[]>([])
  const [stats, setStats] = React.useState<OverviewStats | null>(null)
  const [heatmap, setHeatmap] = React.useState<{ cells: { fw_id: string; hour_bucket: string; threats: number }[]; frameworks: { fw_id: string; framework_code: string; fw_name: string; display_order: number }[] } | null>(null)
  const [appStats, setAppStats] = React.useState<AppStats[]>([])
  const [frameworkCounts, setFrameworkCounts] = React.useState<FrameworkCount[]>([])
  const [frameworks, setFrameworks] = React.useState<{ id: string; framework_code: string; name: string; description: string }[]>([])
  const [t2Stats, setT2Stats] = React.useState<T2Stats | null>(null)
  const [contentQualityStats, setContentQualityStats] = React.useState<ContentQualityStats | null>(null)

  const refreshAll = React.useCallback(async () => {
    setRefreshing(true)
    setLastRefresh(new Date())
    try {
      const [appsData, appStatsData, recentData, allThreatsData, gatewaysData, statsData, heatmapData, countsData, frameworksData, t2Data, cqData] = await Promise.all([
        getApps().catch(() => [] as App[]),
        getAppStats().catch(() => [] as AppStats[]),
        getThreatEvents({ limit: 7 }).catch(() => ({ events: [] as ThreatEvent[] })),
        getThreatEvents({ limit: 10000, since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }).catch(() => ({ events: [] as ThreatEvent[] })),
        getGateways().catch(() => []),
        getOverviewStats().catch(() => null),
        getHeatmapStats().catch(() => ({ cells: [], frameworks: [] as { fw_id: string; framework_code: string; fw_name: string; display_order: number }[] })),
        getFrameworkCounts().catch(() => [] as FrameworkCount[]),
        getAllDetectionFrameworks({ limit: 100 }).catch(() => ({ data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 1 } })),
        getT2Stats().catch(() => null),
        getContentQualityStats().catch(() => null),
      ])

      setApps(appsData)
      setAppStats(appStatsData)
      setRecent(recentData.events)
      setAllThreatEvents(allThreatsData.events)
      setGateways(gatewaysData.map((gw: { name: string; location: string | null }) => ({ name: gw.name, location: gw.location })))
      setStats(statsData)
      setHeatmap(heatmapData)
      setFrameworkCounts(countsData)
      setFrameworks(frameworksData.data.map((fw: { id: string; framework_code: string; name: string; description: string; display_order: number }) => ({ id: fw.id, framework_code: fw.framework_code, name: fw.name, description: fw.description })))
      setT2Stats(t2Data)
      setContentQualityStats(cqData)
    } catch (_err) {
      // ignore
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  React.useEffect(() => {
    refreshAll()
  }, [])

  const volBars = React.useMemo(() => {
    if (!stats?.volume_bars?.length) return []
    return stats.volume_bars.map(b => b.total)
  }, [stats])

  const volBlockedBars = React.useMemo(() => {
    if (!stats?.volume_bars?.length) return []
    return stats.volume_bars.map(b => b.blocked)
  }, [stats])

  const volFlaggedBars = React.useMemo(() => {
    if (!stats?.volume_bars?.length) return []
    return stats.volume_bars.map(b => b.flagged)
  }, [stats])

  const volErrorBars = React.useMemo(() => {
    if (!stats?.volume_bars?.length) return []
    return stats.volume_bars.map(b => b.error)
  }, [stats])

  const volLabels = React.useMemo(() => {
    if (!stats?.volume_bars?.length) return undefined
    const n = stats.volume_bars.length
    const labels: string[] = []
    const labelCount = 6
    for (let k = 0; k < labelCount; k++) {
      const i = Math.floor((k / labelCount) * (n - 1))
      const d = new Date(stats.volume_bars[i].hour)
      labels.push(`${String(d.getHours()).padStart(2, '0')}:00`)
    }
    labels.push('now')
    return labels
  }, [stats])

  const sparkRequests = React.useMemo(() => stats?.volume_bars?.map(b => b.total) ?? [], [stats])
  const sparkBlocked  = React.useMemo(() => stats?.volume_bars?.map(b => b.blocked) ?? [], [stats])
  const sparkTokens   = React.useMemo(() => stats?.volume_bars?.map(b => b.tokens ?? 0) ?? [], [stats])

  const heat = React.useMemo(() => {
    const fwList = heatmap?.frameworks ?? []
    if (fwList.length === 0) return []
    // Build 24 display columns: displayIdx 0 = 23h ago, displayIdx 23 = current hour
    const now = Date.now()
    const colTimes = Array.from({ length: 24 }, (_, displayIdx) => {
      const hoursAgo = 23 - displayIdx
      return new Date(now - hoursAgo * 3_600_000)
    })
    // Map each ISO hour_bucket to the matching display column (same UTC year/month/day/hour)
    const buckets: Record<string, number[]> = {}
    for (const fw of fwList) buckets[fw.fw_id] = Array(24).fill(0)
    if (heatmap?.cells?.length) {
      for (const c of heatmap.cells) {
        const cellTime = new Date(c.hour_bucket)
        const displayIdx = colTimes.findIndex(t =>
          t.getUTCFullYear() === cellTime.getUTCFullYear() &&
          t.getUTCMonth()    === cellTime.getUTCMonth()    &&
          t.getUTCDate()     === cellTime.getUTCDate()     &&
          t.getUTCHours()    === cellTime.getUTCHours()
        )
        if (displayIdx === -1) continue
        const row = buckets[c.fw_id]
        if (!row) continue
        row[displayIdx] = Number(c.threats)
      }
    }
    return fwList.map(fw => buckets[fw.fw_id])
  }, [heatmap])

  const byCat = React.useMemo(() => {
    return frameworkCounts
      .map(fc => ({ id: fc.fw_id, framework_code: fc.framework_code, name: fc.fw_name, count: fc.count }))
      .sort((a, b) => b.count - a.count)
  }, [frameworkCounts])
  const maxCat = Math.max(...byCat.map(b => b.count)) || 1

  const topFrameworks = React.useMemo(() => {
    if (byCat.length < 2) return []
    const sorted = [...byCat].sort((a, b) => b.count - a.count)
    return sorted.slice(0, 3).map(f => ({ name: f.name, count: f.count }))
  }, [byCat])

  const sevSegments = React.useMemo(() => {
    const m = { crit: 0, high: 0, med: 0, low: 0 }
    allThreatEvents.forEach(e => { m[e.sev as keyof typeof m]++ })
    const segments: Segment[] = []
    if (m.crit > 0) segments.push({ value: m.crit, color: 'var(--danger)', label: 'Crit' })
    if (m.high > 0) segments.push({ value: m.high, color: 'var(--vermilion-600)', label: 'High' })
    if (m.med > 0) segments.push({ value: m.med, color: 'var(--warning)', label: 'Med' })
    if (m.low > 0) segments.push({ value: m.low, color: 'var(--info)', label: 'Low' })
    return { segments, total: m.crit + m.high + m.med + m.low, crit: m.crit }
  }, [allThreatEvents])

  const fmtRequests = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return n.toLocaleString()
  }

  const columns: ColumnDef<App>[] = [
    { key: 'app', label: 'App', width: 180, render: (a) => <b>{a.name}</b> },
    { key: 'team', label: 'Team', width: 120, render: (a) => <span className="caption">{a.team}</span> },
    { key: 'mode', label: 'Mode', width: 90, render: (a) => (
      <>
        {a.mode === 'guard'   && <Chip kind="ok"  >🛡️ guard</Chip>}
        {a.mode === 'soft'    && <Chip kind="ok"  >🛡️ soft</Chip>}
        {a.mode === 'monitor' && <Chip kind="warn">👁️ monitor</Chip>}
        {a.mode === 'bypass'  && <Chip kind="muted">⚡ bypass</Chip>}
      </>
    )},
    { key: 'req', label: 'Req (24h)', width: 90, align: 'right', render: (a) => {
      const stat = appStats.find(s => s.app_id === a.id || s.app_name === a.name)
      return <span className="mono" style={{ fontSize: 11 }}>{(stat?.requests_24h ?? 0).toLocaleString()}</span>
    }},
    { key: 'blocked', label: 'Blocked', width: 80, align: 'right', render: (a) => {
      const stat = appStats.find(s => s.app_id === a.id || s.app_name === a.name)
      const n = stat?.blocked_24h ?? 0
      return <span className="mono" style={{ fontSize: 11, color: n > 0 ? 'var(--danger)' : 'inherit' }}>{n.toLocaleString()}</span>
    }},
    { key: 'trend', label: 'Trend · 24h', width: 130, render: (a) => {
      const stat = appStats.find(s => s.app_id === a.id || s.app_name === a.name)
      return stat?.hourly_bars && stat.hourly_bars.some(v => v > 0)
        ? <MicroBars data={stat.hourly_bars} width={108} height={20} color="var(--accent)" />
        : <span style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>no data</span>
    }},
    { key: 'status', label: 'Status', width: 90, render: (a) => (
      <>
        {a.status === 'enable'  && <Chip kind="ok"    dot>enabled</Chip>}
        {a.status === 'disable' && <Chip kind="muted" dot>disabled</Chip>}
      </>
    )},
  ]

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="overview" />
      <PageHeader title="Gateway overview" subtitle={<><span>Monitor real-time gateway traffic, threat volume, and system health at a glance. View request volume charts, review flagged threats, and drill into per-app stats.<br />All AI traffic for </span><b>{loading || gateways.length === 0 ? '—' : gateways[0].name}</b><span> · last 24 hours · refreshed </span><span className="mono">{lastRefresh.toLocaleTimeString()}</span>.</>}
        actions={<><button className="btn btn-ghost" onClick={refreshAll} disabled={refreshing}><Refresh w={13} /> {refreshing ? 'Refreshing…' : 'Refresh'}</button><button className="btn btn-secondary" onClick={() => window.print()}><Download w={13} /> Export</button><button className="btn btn-primary" onClick={() => navigate('/apps')}><Plus w={13} /> Connect AI app</button></>} />

      {/* KPI row */}
      <div className="kpi-row">
        <StatCard
          label="Requests · 24h"
          tag="prod"
          loading={loading}
          value={fmtRequests(stats?.requests_24h || 0)}
          caption={`avg latency ${stats?.avg_latency_ms ?? '—'} ms`}
          spark={sparkRequests.length > 0 && <Sparkline data={sparkRequests} color="var(--accent)" />}
        />
        <StatCard
          label="Threats blocked"
          tag="live"
          tone="danger"
          loading={loading}
          value={(stats?.blocked_24h ?? 0).toLocaleString()}
          caption={`threat rate ${stats ? (stats.threat_rate * 100).toFixed(1) : '—'}%`}
          spark={sparkBlocked.length > 0 && <Sparkline data={sparkBlocked} color="var(--danger)" />}
        />
        <StatCard
          label="Tokens · 24h"
          tone="warning"
          loading={loading}
          value={fmtRequests((stats?.tokens_in_24h ?? 0) + (stats?.tokens_out_24h ?? 0))}
          caption={`in ${fmtRequests(stats?.tokens_in_24h ?? 0)} · out ${fmtRequests(stats?.tokens_out_24h ?? 0)}`}
          spark={sparkTokens.length > 0 && <Sparkline data={sparkTokens} color="var(--warning)" />}
        />
      </div>

      {/* Row: volume + threat severity */}
      <div className="grid-2-1 stack" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-hdr">
            <h3>Traffic volume · 24h</h3>
            <div className="right">
              <span className="health-pill"><span className="dot" /> allow · {loading ? '—' : `${((1 - (stats?.threat_rate || 0) - (stats?.flag_rate || 0) - (stats?.error_rate || 0)) * 100).toFixed(2)}%`}</span>
              <span className="health-pill warn"><span className="dot" /> flag · {loading ? '—' : `${((stats?.flag_rate || 0) * 100).toFixed(2)}%`}</span>
              <span className="health-pill"><span className="dot" style={{ background: "var(--fg-tertiary)" }} /> error · {loading ? '—' : `${((stats?.error_rate || 0) * 100).toFixed(2)}%`}</span>
              <span className="health-pill err"><span className="dot" /> block · {loading ? '—' : `${((stats?.threat_rate || 0) * 100).toFixed(2)}%`}</span>
              <span className="meta">hourly bins · {TZ_LABEL}</span>
            </div>
          </div>
          <div style={{ padding: "14px 16px 16px" }}>
            {loading ? <LoadingState message="Loading traffic data…" size="sm" /> : <VolumeChart bars={volBars} flaggedBars={volFlaggedBars} errorBars={volErrorBars} blockedBars={volBlockedBars} labels={volLabels} />}
          </div>
        </div>
        <div className="card">
          <div className="card-hdr">
            <h3>By severity · 24h</h3>
            <span className="meta">events</span>
          </div>
          <div style={{ padding: "10px 14px 14px" }}>
            {sevSegments.total === 0 ? (
              <div className="caption" style={{ padding: "20px 0", textAlign: "center" }}>No threat events</div>
            ) : (
              <>
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                  <span className="mono" style={{ fontSize: 11, color: "var(--fg-tertiary)" }}>{sevSegments.total.toLocaleString()} events</span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--fg-tertiary)" }}>{sevSegments.crit} crit</span>
                </div>
                <SegmentedBar segments={sevSegments.segments} height={10} showLegend />
              </>
            )}
            <div style={{ borderTop: "1px solid var(--border-subtle)", margin: "12px 0 10px" }} />
            <div className="label" style={{ marginBottom: 8 }}>By framework</div>
            <div className="stack" style={{ gap: 4 }}>
              {byCat.map(b => (
                <div className="bar-row" key={b.id} style={{ color: "var(--info)" }}>
                  <span className="lb">{b.framework_code}</span>
                  <span className="bar"><i style={{ width: `${(b.count / maxCat) * 100}%` }} /></span>
                  <span className="vv">{b.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Heatmap */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-hdr">
          <h3>Detection frameworks · severity by hour</h3>
          <div className="right">
            <div className="row-tight" style={{ fontSize: 10, color: "var(--fg-tertiary)", letterSpacing: 0.08 }}>
              <span>low</span>
              <span style={{ display: "inline-flex", gap: 2 }}>
                <i style={{ width: 14, height: 8, background: "var(--bg-sunken)", border: "1px solid var(--border-subtle)" }} />
                <i style={{ width: 14, height: 8, background: "rgba(118,180,0,0.6)" }} />
                <i style={{ width: 14, height: 8, background: "rgba(184,134,11,0.6)" }} />
                <i style={{ width: 14, height: 8, background: "rgba(179,50,31,0.85)" }} />
              </span>
              <span>crit</span>
            </div>
            <span className="meta">last 24 hours · {TZ_LABEL}</span>
          </div>
        </div>
        <div style={{ padding: "14px 16px 16px" }}>
          {loading ? <LoadingState message="Loading heatmap data…" size="sm" /> : <Heatmap grid={heat} rows={(heatmap?.frameworks ?? []).map(fw => ({ code: fw.framework_code }))} />}
          <div className="caption" style={{ marginTop: 10, fontSize: 11 }}>
            {topFrameworks.length > 0 ? (
              <>Hot bands:{' '}
                {topFrameworks.map((f, i) => (
                  <span key={f.name}>
                    <b>{f.name}</b>
                    {i < topFrameworks.length - 1 && ', '}
                  </span>
                ))}
              </>
            ) : (
              'No threat data yet'
            )}
            <a href="#" onClick={(e) => { e.preventDefault(); navigate('/threats') }} style={{ marginLeft: 8 }}>Open in Threats →</a>
          </div>
        </div>
      </div>

      <T2ReportPanel stats={t2Stats} loading={loading} />

      <ContentQualityReportPanel stats={contentQualityStats} loading={loading} />

      {/* Row: Live ticker + recent threats */}
      <div className="grid-2-1 stack" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-hdr">
            <h3>Live request stream</h3>
            <div className="right">
              <span className="health-pill"><span className="dot" /> streaming · ws/443</span>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/traffic')}><ArrowUR w={11} /> Open inspector</button>
            </div>
          </div>
          <LiveTickerMini />
        </div>

        <div className="card">
          <div className="card-hdr">
            <h3>Recent threats</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/threats')}>All →</button>
          </div>
          <div>
            {recent.map(e => (
              <div key={e.id} style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)", display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "start" }}>
                <span className={`dot-sev ${e.sev}`} style={{ marginTop: 5 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {(() => {
                      const fw = frameworks.find(f => f.id === e.framework_id)
                      return fw ? <Chip kind="warn" mono>{fw.framework_code}</Chip> : <Chip kind="muted" mono>{e.detector || 'unknown'}</Chip>
                    })()}
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{e.title}</span>
                  </div>
                  <div className="caption" style={{ fontSize: 11, marginTop: 2 }}>
                    <span className="mono" style={{ color: "var(--fg-tertiary)" }}>{e.appName}</span>
                    <span style={{ margin: "0 6px", color: "var(--fg-tertiary)" }}>·</span>
                    <span className="mono" style={{ color: "var(--fg-tertiary)" }}>{e.src}</span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <ActionChip action={e.action} />
                  <div className="mono" style={{ fontSize: 10, color: "var(--fg-tertiary)", marginTop: 4 }}>{fmtAge(e.age)} ago</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI apps health */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-hdr">
          <h3>Connected AI apps</h3>
          <div className="right">
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/apps')}>All apps →</button>
          </div>
        </div>
        <DataTable card={false} columns={columns} data={apps} rowKey={(a) => a.id} minWidth={780} />
      </div>

      <div className="caption" style={{ marginTop: 16, fontSize: 11 }}>
        Showing <b>{loading || gateways.length === 0 ? '—' : gateways[0].name}</b> · all timestamps in {Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'} · live detection framework data.
      </div>
    </div>
  )
}

export default OverviewPage
