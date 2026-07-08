import { useEffect, useState } from 'react'
import { RefreshCw, AlertTri, Activity, Info } from '../components/ui/Icons'
import { PageHeader, Breadcrumbs, StatCard, StatRow, LoadingState, Drawer, MiniBarChart, ProgressBar } from '../components/ui'
import { Toast, ConfirmModal } from './components/ProviderShared'
import { MeterDrawer, StateChip, meterDrawerStateFromSummary, type MeterDrawerState } from './components/MeterDrawer'
import { getMeteringSummary, getProviderDailyUsage, updateProviderMetering, resetProviderMeter } from '../api/providerMetering'
import type { ProviderMeterSummaryItem } from '../types'
import type { ProviderDailyRow } from '../api/providerMetering'
import type { TweakValues } from '../types'

interface ProviderUsagePageProps { tweaks?: TweakValues }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function fmtCost(n: number): string {
  if (n === 0) return '$0.00'
  if (n < 0.01) return `$${n.toFixed(5)}`
  return `$${n.toFixed(4)}`
}

function usedLabel(item: ProviderMeterSummaryItem): string {
  const m = item.config.metric
  if (m === 'tokens') return fmtNum(item.usage.used)
  if (m === 'cost') return fmtCost(item.usage.used)
  return fmtNum(item.usage.used)
}

function metricLabel(m: string): string {
  if (m === 'tokens') return 'tokens'
  if (m === 'cost') return 'USD'
  return 'requests'
}


// ── Daily usage detail panel ───────────────────────────────────────────────────

function DailyPanel({ item, onClose, open }: { item: ProviderMeterSummaryItem; onClose: () => void; open?: boolean }) {
  const [rows, setRows] = useState<ProviderDailyRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getProviderDailyUsage(item.id).then(r => { setRows(r); setLoading(false) }).catch(() => setLoading(false))
  }, [item.id])

  const totalReq = rows.reduce((a, r) => a + r.requests, 0)
  const totalTok = rows.reduce((a, r) => a + r.tokens_in + r.tokens_out, 0)
  const totalCost = rows.reduce((a, r) => a + r.est_cost, 0)

  return (
    <Drawer
      open={open}
      icon={<Activity w={14} style={{ color: 'var(--accent)' }} />}
      title={item.name}
      subtitle="Daily usage — last 30 days"
      width={560}
      onClose={onClose}
    >
      <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
        {loading ? (
          <LoadingState size="sm" />
        ) : (
          <>
            <StatRow mb={16}>
              <StatCard variant="compact" label="Total Requests" value={fmtNum(totalReq)} />
              <StatCard variant="compact" label="Total Tokens" value={fmtNum(totalTok)} />
              <StatCard variant="compact" label="Est. Cost" value={fmtCost(totalCost)} accent={totalCost > 0 ? '#D9A32E' : undefined} />
            </StatRow>
            <div className="t-wrap">
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr style={{ color: 'var(--fg-tertiary)', textAlign: 'left' }}>
                  <th style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-subtle)' }}>Day</th>
                  <th style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-subtle)' }}>Type</th>
                  <th style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'right' }}>Requests</th>
                  <th style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'right' }}>Tokens In</th>
                  <th style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'right' }}>Tokens Out</th>
                  <th style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'right' }}>Est Cost</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '4px 8px' }}>{r.day}</td>
                    <td style={{ padding: '4px 8px', color: 'var(--fg-secondary)' }}>{r.call_type}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{fmtNum(r.requests)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{fmtNum(r.tokens_in)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{fmtNum(r.tokens_out)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: r.est_cost > 0 ? '#D9A32E' : 'inherit' }}>{fmtCost(r.est_cost)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 16, textAlign: 'center', color: 'var(--fg-tertiary)' }}>No usage recorded yet.</td></tr>
                )}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>
    </Drawer>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ProviderUsagePage(_: ProviderUsagePageProps) {
  const [items, setItems] = useState<ProviderMeterSummaryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)
  const [meterTarget, setMeterTarget] = useState<MeterDrawerState | null>(null)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [detailItem, setDetailItem] = useState<ProviderMeterSummaryItem | null>(null)
  const [dailyData, setDailyData] = useState<Record<string, ProviderDailyRow[]>>({})
  const [confirmReset, setConfirmReset] = useState(false)

  function notify(msg: string, kind: 'ok' | 'err') {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 3500)
  }

  async function load() {
    setLoading(true)
    try {
      const data = await getMeteringSummary()
      setItems(data)
      // Prefetch 14-day bars for all providers
      const bars: Record<string, ProviderDailyRow[]> = {}
      await Promise.all(data.map(async item => {
        try {
          const from = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10)
          bars[item.id] = await getProviderDailyUsage(item.id, from)
        } catch { bars[item.id] = [] }
      }))
      setDailyData(bars)
    } catch {
      notify('Failed to load provider usage', 'err')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openDrawer(item: ProviderMeterSummaryItem) {
    setMeterTarget(meterDrawerStateFromSummary(item))
  }

  async function handleSave(s: MeterDrawerState) {
    setSaving(true)
    try {
      await updateProviderMetering(s.item.id, {
        meter_mode: s.mode,
        meter_metric: s.metric,
        meter_limit: s.limit ? Number(s.limit) : null,
        meter_warning_limit: s.warning ? Number(s.warning) : null,
        meter_enforcement: s.enforcement,
        meter_reset_day: s.resetDay ? Number(s.resetDay) : null,
        price_per_1m_input: s.priceIn !== '' ? Number(s.priceIn) : null,
        price_per_1m_output: s.priceOut !== '' ? Number(s.priceOut) : null,
      })
      notify('Meter config saved', 'ok')
      setMeterTarget(null)
      load()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Save failed'
      notify(msg, 'err')
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    if (!meterTarget) return
    setResetting(true)
    try {
      await resetProviderMeter(meterTarget.item.id)
      notify('Meter period reset', 'ok')
      setConfirmReset(false)
      setMeterTarget(null)
      load()
    } catch {
      notify('Reset failed', 'err')
    } finally {
      setResetting(false)
    }
  }

  // Aggregate totals
  const totalRequests = items.reduce((a, i) => a + i.usage.requests, 0)
  const totalTokens   = items.reduce((a, i) => a + i.usage.tokens_in + i.usage.tokens_out, 0)
  const totalCost     = items.reduce((a, i) => a + i.usage.est_cost, 0)
  const exceeded      = items.filter(i => i.usage.state === 'exceeded').length
  const warned        = items.filter(i => i.usage.state === 'warning').length

  return (
    <div className="page">
      <Breadcrumbs pageId="provider-usage" />
      <PageHeader title="AI Provider Usages" subtitle="Monthly AI provider usage, limits, and cost estimation"
        actions={<button className="btn btn-ghost" onClick={load} disabled={loading}><RefreshCw w={13} style={{ marginRight: 5 }} />{loading ? 'Loading…' : 'Refresh'}</button>} />

      {/* Summary stat cards */}
      <StatRow mb={20}>
        <StatCard variant="compact" label="Total Requests (month)" value={fmtNum(totalRequests)} />
        <StatCard variant="compact" label="Total Tokens (month)" value={fmtNum(totalTokens)} />
        <StatCard variant="compact" label="Est. Total Cost" value={fmtCost(totalCost)} accent={totalCost > 0 ? '#D9A32E' : undefined} />
        {exceeded > 0 && <StatCard variant="compact" label="Providers Exceeded" value={exceeded} accent="var(--danger,#E84F36)" />}
        {warned > 0 && <StatCard variant="compact" label="Providers Warned" value={warned} accent="#D9A32E" />}
      </StatRow>

      {/* Provider table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="t-wrap">
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 780 }}>
          <thead>
            <tr style={{ color: 'var(--fg-tertiary)', textAlign: 'left', fontSize: 11 }}>
              <th style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 500 }}>Provider</th>
              <th style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 500 }}>Vendor</th>
              <th style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 500, textAlign: 'right' }}>Requests</th>
              <th style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 500, textAlign: 'right' }}>Tokens</th>
              <th style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 500, textAlign: 'right' }}>Est. Cost</th>
              <th style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 500 }}>Limit</th>
              <th style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 500 }}>14-day</th>
              <th style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 500 }}>Status</th>
              <th style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 500 }} />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 0, border: 'none' }}><LoadingState size="sm" /></td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: 'var(--fg-tertiary)' }}>No providers configured.</td></tr>
            )}
            {!loading && items.map(item => (
              <tr key={item.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '8px 14px', fontWeight: 500 }}>
                  <span style={{ cursor: 'pointer', color: 'var(--accent)' }} onClick={() => setDetailItem(item)}>
                    {item.name}
                  </span>
                </td>
                <td style={{ padding: '8px 14px', color: 'var(--fg-secondary)' }}>{item.vendor}</td>
                <td style={{ padding: '8px 14px', textAlign: 'right' }}>{fmtNum(item.usage.requests)}</td>
                <td style={{ padding: '8px 14px', textAlign: 'right' }}>{fmtNum(item.usage.tokens_in + item.usage.tokens_out)}</td>
                <td style={{ padding: '8px 14px', textAlign: 'right', color: item.usage.est_cost > 0 ? '#D9A32E' : 'inherit' }}>
                  {fmtCost(item.usage.est_cost)}
                </td>
                <td style={{ padding: '8px 14px', minWidth: 140 }}>
                  {item.config.mode === 'unlimited' ? (
                    <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>Unlimited</span>
                  ) : (
                    <div>
                      <div style={{ fontSize: 11, marginBottom: 4 }}>
                        {usedLabel(item)} / {item.config.limit !== null ? fmtNum(item.config.limit) : '—'} {metricLabel(item.config.metric)}
                        <span style={{ marginLeft: 6, color: 'var(--fg-tertiary)' }}>{item.usage.percent}%</span>
                      </div>
                      <ProgressBar value={item.usage.percent} height={4} />
                    </div>
                  )}
                </td>
                <td style={{ padding: '8px 14px' }}>
                  <MiniBarChart values={(dailyData[item.id] ?? []).map(r => item.config.metric === 'cost' ? r.est_cost : item.config.metric === 'tokens' ? r.tokens_in + r.tokens_out : r.requests)} height={28} barWidth={6} gap={2} noDataText="No data" />
                </td>
                <td style={{ padding: '8px 14px' }}>
                  <StateChip state={item.usage.state} />
                </td>
                <td style={{ padding: '8px 14px' }}>
                  <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => openDrawer(item)}>
                    Configure
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Exceeded alert */}
      {exceeded > 0 && (
        <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 6,
          background: 'var(--danger-bg)', border: '1px solid var(--danger,#E84F36)',
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <AlertTri w={14} style={{ color: 'var(--danger,#E84F36)', flexShrink: 0 }} />
          <span>{exceeded} provider{exceeded > 1 ? 's have' : ' has'} exceeded the monthly limit. Hard-limited providers are returning 429 to apps.</span>
        </div>
      )}

      {/* Period info note */}
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--fg-tertiary)' }}>
        <Info w={12} />
        <span>Usage is aggregated from the durable rollup (updated every ~30s). Period shown is the current monthly window per provider.</span>
      </div>

      {/* Meter config drawer */}
      {meterTarget && (
        <MeterDrawer
          state={meterTarget}
          onClose={() => setMeterTarget(null)}
          onSave={handleSave}
          onReset={() => setConfirmReset(true)}
          saving={saving}
          resetting={resetting}
        />
      )}

      {/* Daily detail drawer */}
      {detailItem && <DailyPanel item={detailItem} onClose={() => setDetailItem(null)} />}

      {/* Reset confirm modal */}
      {confirmReset && (
        <ConfirmModal
          title="Reset Meter Period"
          message="This sets the period start to now. Usage counting restarts from zero. The rollup history is preserved."
          confirmLabel="Reset Period"
          onClose={() => setConfirmReset(false)}
          onConfirm={handleReset}
          busy={resetting}
        />
      )}

      {toast && <Toast msg={toast.msg} kind={toast.kind} />}
    </div>
  )
}
