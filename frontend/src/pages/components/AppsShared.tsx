import React from 'react'
import { Field, Eye, EyeOff, Copy, Check, LoadingState } from '../../components/ui'
export { Toast } from '../../components/ui'
import { copyToClipboard } from '../../utils/format'
import { revealApiKey } from '../../api/apikeys'
import type { AiProvider } from '../../api/providers'

// ── Constants ─────────────────────────────────────────────────────────────────

export const ROTATION_POLICIES = ['auto · 30d', 'auto · 60d', 'auto · 90d', 'manual']

// ── Small UI components ───────────────────────────────────────────────────────

export function KeyValueDisplay({ keyId, prefix }: { keyId: string; prefix: string }) {
  const [revealed, setRevealed] = React.useState<string | null>(null)
  const [visible, setVisible]   = React.useState(false)
  const [loading, setLoading]   = React.useState(false)
  const [copied, setCopied]     = React.useState(false)

  async function handleToggle() {
    if (revealed) { setVisible(v => !v); return }
    setLoading(true)
    try {
      const data = await revealApiKey(keyId)
      setRevealed(data.full_key)
      setVisible(true)
    } catch { /* leave masked */ }
    finally { setLoading(false) }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 10px', borderRadius: 6,
      background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
    }}>
      <span className="mono" style={{ flex: 1, fontSize: 11, wordBreak: 'break-all', lineHeight: 1.5 }}>
        {visible && revealed ? revealed : `${prefix}_${'*'.repeat(32)}`}
      </span>
      <button className="icon-btn" title={visible ? 'Hide' : 'Reveal'} onClick={handleToggle} disabled={loading}>
        {loading
          ? <LoadingState size="sm" message="" />
          : visible ? <EyeOff w={13} /> : <Eye w={13} />}
      </button>
      {revealed && (
        <button className="icon-btn" title="Copy" onClick={async () => {
          try { await copyToClipboard(revealed); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
        }}>
          {copied ? <Check w={13} /> : <Copy w={13} />}
        </button>
      )}
    </div>
  )
}

export function ProviderSelect({ label, hint, value, options, onChange, disabled }: {
  label: string; hint?: string; value: string | null
  options: AiProvider[]; onChange: (v: string | null) => void; disabled?: boolean
}) {
  const prov = options.find(p => p.id === value)
  return (
    <Field label={label} hint={hint}>
      <select className="select" style={{ width: '100%', boxSizing: 'border-box', opacity: disabled ? 0.5 : 1 }}
        value={value ?? ''} disabled={disabled} onChange={e => onChange(e.target.value || null)}>
        <option value="">— none —</option>
        {options.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}{p.is_default ? ' ★ default' : ''} · {p.vendor}
          </option>
        ))}
      </select>
      {prov && (
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: prov.status === 'healthy' ? 'var(--ok)' : prov.status === 'degraded' ? 'var(--warning)' : 'var(--danger)',
          }} />
          <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{prov.endpoint}</span>
        </div>
      )}
    </Field>
  )
}
