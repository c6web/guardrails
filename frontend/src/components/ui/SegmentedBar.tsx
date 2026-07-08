import React from 'react'

export interface Segment {
  value: number
  color: string
  label?: string
}

export interface SegmentedBarProps {
  segments: Segment[]
  max?: number
  height?: number
  showLegend?: boolean
}

const SegmentedBar: React.FC<SegmentedBarProps> = ({ segments, max, height = 20, showLegend = false }) => {
  const effectiveMax = max ?? segments.reduce((sum, s) => sum + s.value, 0)
  const total = effectiveMax || 1

  return (
    <>
      <div style={{ height, borderRadius: height > 4 ? 2 : 0, overflow: 'hidden', display: 'flex', background: 'var(--bg-sunken)' }}>
        {segments.flatMap((seg, i) => {
          const width = (seg.value / total) * 100
          if (width <= 0) return []
          return [(
            <div
              key={i}
              style={{ width: `${width}%`, background: seg.color, minWidth: width > 0 && width < 0.5 ? `${width}%` : undefined }}
              title={seg.label ? `${seg.label}: ${seg.value.toLocaleString()}` : `${seg.value.toLocaleString()}`}
            />
          )]
        })}
      </div>
      {showLegend && (
        <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: 'var(--fg-secondary)', flexWrap: 'wrap' }}>
          {segments.filter(s => s.label != null).map((seg, i) => (
            <span key={i}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 1, background: seg.color, marginRight: 4, verticalAlign: 'middle' }} />
              {seg.label} <b style={{ fontFamily: 'var(--font-mono)' }}>{seg.value.toLocaleString()}</b>
            </span>
          ))}
        </div>
      )}
    </>
  )
}

export default SegmentedBar
