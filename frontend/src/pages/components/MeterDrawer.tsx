import React from 'react'
import { Drawer, Field, FORM_INPUT_STYLE } from '../../components/ui'
import { AlertO } from '../../components/ui/Icons'
import type { ProviderMeterSummaryItem } from '../../types'

export interface MeterDrawerState {
  item: { id: string; name: string; vendor: string }
  config: ProviderMeterSummaryItem['config'] | null
  mode: 'unlimited' | 'monthly'
  metric: 'requests' | 'tokens' | 'cost'
  limit: string
  warning: string
  enforcement: 'hard' | 'soft'
  resetDay: string
  priceIn: string
  priceOut: string
}

export function meterDrawerStateFromSummary(item: ProviderMeterSummaryItem): MeterDrawerState {
  return {
    item: { id: item.id, name: item.name, vendor: item.vendor },
    config: item.config,
    mode: item.config.mode,
    metric: item.config.metric,
    limit: item.config.limit !== null ? String(item.config.limit) : '',
    warning: item.config.warning !== null ? String(item.config.warning) : '',
    enforcement: item.config.enforcement,
    resetDay: item.config.reset_day !== null ? String(item.config.reset_day) : '1',
    priceIn: item.config.price_per_1m_input !== null ? String(item.config.price_per_1m_input) : '',
    priceOut: item.config.price_per_1m_output !== null ? String(item.config.price_per_1m_output) : '',
  }
}

export function meterDrawerStateFromProvider(id: string, name: string, vendor: string): MeterDrawerState {
  return {
    item: { id, name, vendor },
    config: null,
    mode: 'unlimited',
    metric: 'requests',
    limit: '',
    warning: '',
    enforcement: 'soft',
    resetDay: '1',
    priceIn: '',
    priceOut: '',
  }
}

function metricLabel(m: string): string {
  if (m === 'tokens') return 'tokens'
  if (m === 'cost') return 'USD'
  return 'requests'
}

export function StateChip({ state }: { state: 'ok' | 'warning' | 'exceeded' }) {
  const colors = {
    ok:       { bg: 'var(--ok-bg, rgba(118,180,0,.12))',  fg: 'var(--ok,#76B400)' },
    warning:  { bg: 'rgba(217,163,46,.12)',               fg: '#D9A32E' },
    exceeded: { bg: 'var(--danger-bg)',                   fg: 'var(--danger,#E84F36)' },
  }
  const c = colors[state]
  const label = state === 'ok' ? 'OK' : state === 'warning' ? 'Warning' : 'Exceeded'
  return (
    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: c.bg, color: c.fg, letterSpacing: '.04em' }}>{label}</span>
  )
}

export function MeterDrawer({ state: initialState, open, onClose, onSave, onReset, saving, resetting }: {
  state: MeterDrawerState
  open?: boolean
  onClose: () => void
  onSave: (s: MeterDrawerState) => void
  onReset: () => void
  saving: boolean
  resetting: boolean
}) {
  const [s, setS] = React.useState(initialState)

  const pricingSection = (
    <div style={{ padding: '10px 12px', background: 'var(--bg-sunken)', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600 }}>Pricing (USD / 1M tokens)</div>
      <Field label="Input tokens price" hint="Set to 0 for local or free models">
        <input className="input" style={FORM_INPUT_STYLE} type="number" min="0" step="0.01" value={s.priceIn}
          onChange={e => setS(p => ({ ...p, priceIn: e.target.value }))} placeholder="0 for local/free" />
      </Field>
      <Field label="Output tokens price">
        <input className="input" style={FORM_INPUT_STYLE} type="number" min="0" step="0.01" value={s.priceOut}
          onChange={e => setS(p => ({ ...p, priceOut: e.target.value }))} placeholder="0 for local/free" />
      </Field>
    </div>
  )

  return (
    <Drawer open={open} title={s.item.name} subtitle="Usage Metering & Limits" onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          {s.mode === 'monthly' && (
            <button className="btn btn-ghost btn-sm" disabled={resetting} onClick={onReset}
              title="Reset current period to now">
              {resetting ? '' : 'Reset Period'}
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary" disabled={saving} onClick={() => onSave(s)}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }>
      <div style={{ padding: '16px 20px', overflowY: 'auto' }}>

        <div style={{ padding: '8px 12px', background: 'var(--bg-sunken)', borderRadius: 6, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>About Usage Metering</div>
          <p style={{ fontSize: 12, margin: 0, color: 'var(--fg-tertiary)', lineHeight: 1.5 }}>
            Set monthly caps and alerts to track provider usage against your budget. Configure how usage is measured (requests, tokens, or cost), define hard or soft enforcement rules, and optionally set pricing for cost tracking.
          </p>
        </div>

        <div style={{ padding: '8px 12px', background: 'var(--bg-sunken)', borderRadius: 6, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span><AlertO w={13} /></span> Disclaimer
          </div>
          <p style={{ fontSize: 12, margin: 0, color: 'var(--fg-tertiary)', lineHeight: 1.5 }}>
            Pricing fields are for reference only — they do not affect traffic or billing. Always refer to your actual provider usage reports and invoices for real consumption data.
          </p>
        </div>

        <Field label="Metering Mode">
          <select className="select" style={FORM_INPUT_STYLE} value={s.mode}
            onChange={e => setS(p => ({ ...p, mode: e.target.value as 'unlimited' | 'monthly' }))}>
            <option value="unlimited">Unlimited</option>
            <option value="monthly">Monthly cap</option>
          </select>
        </Field>

        {s.mode === 'monthly' && <>
          <Field label="Measure" hint="How to count usage against the monthly limit">
            <select className="select" style={FORM_INPUT_STYLE} value={s.metric}
              onChange={e => setS(p => ({ ...p, metric: e.target.value as 'requests' | 'tokens' | 'cost' }))}>
              <option value="requests">Requests</option>
              <option value="tokens">Tokens (in + out)</option>
              <option value="cost">Cost (USD)</option>
            </select>
          </Field>

          <Field label={`Monthly Limit (${metricLabel(s.metric)})`}>
            <input className="input" style={FORM_INPUT_STYLE} type="number" min="1" step="1" value={s.limit}
              onChange={e => setS(p => ({ ...p, limit: e.target.value }))} />
          </Field>

          <Field label="Warning Threshold (optional)" hint="Alert when usage reaches this percentage">
            <input className="input" style={FORM_INPUT_STYLE} type="number" min="1" step="1" value={s.warning}
              onChange={e => setS(p => ({ ...p, warning: e.target.value }))}
              placeholder="Leave blank to disable" />
          </Field>

          <Field label="Enforcement">
            <select className="select" style={FORM_INPUT_STYLE} value={s.enforcement}
              onChange={e => setS(p => ({ ...p, enforcement: e.target.value as 'hard' | 'soft' }))}>
              <option value="soft">Soft — alert only, traffic continues</option>
              <option value="hard">Hard — block calls when exceeded</option>
            </select>
          </Field>

          <Field label="Period Reset Day (1–28)" hint="Day of month when usage counters reset">
            <input className="input" style={FORM_INPUT_STYLE} type="number" min="1" max="28" step="1" value={s.resetDay}
              onChange={e => setS(p => ({ ...p, resetDay: e.target.value }))} />
          </Field>

          {pricingSection}
        </>}

        {s.mode === 'unlimited' && pricingSection}

      </div>
    </Drawer>
  )
}
