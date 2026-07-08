import React from 'react'

export interface ProgressBarProps {
  value: number
  max?: number
  color?: string
  height?: number
  showLabel?: boolean
  labelPosition?: 'inside' | 'right' | 'top'
  variant?: 'bar' | 'segmented'
}

function autoColor(pct: number): string {
  if (pct >= 90) return 'var(--danger)'
  if (pct >= 75) return '#D9A32E'
  return 'var(--accent)'
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  color,
  height = 8,
  showLabel = false,
  labelPosition = 'right',
  variant = 'bar',
}) => {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0)
  const fillColor = color ?? autoColor(pct)
  const label = showLabel ? `${Math.round(pct)}%` : null
  const radius = Math.max(1, height / 2)

  const bar = (
    <div style={{ height, borderRadius: radius, background: 'var(--border-subtle)', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height, borderRadius: radius, background: fillColor, transition: 'width 0.3s ease' }} />
    </div>
  )

  if (variant === 'segmented') {
    return (
      <div style={{ position: 'relative', height, borderRadius: radius, overflow: 'hidden' }}>
        <div style={{ width: '100%', height, borderRadius: radius, background: fillColor }} />
        {showLabel && (
          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: '#fff' }}>
            {Math.round(pct)}%
          </span>
        )}
      </div>
    )
  }

  if (!showLabel || !label) return bar

  if (labelPosition === 'top') {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11, color: 'var(--fg-tertiary)' }}>
          <span>{label}</span>
        </div>
        {bar}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1 }}>{bar}</div>
      <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{label}</span>
    </div>
  )
}

export default ProgressBar
