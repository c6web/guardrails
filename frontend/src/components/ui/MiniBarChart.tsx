import React from 'react'

interface MiniBarChartProps {
  values: number[]
  secondaryValues?: number[]
  height?: number
  width?: number | string
  color?: string
  secondaryColor?: string
  labels?: (string | null)[]
  maxValue?: number
  barWidth?: number
  gap?: number
  mode?: 'svg' | 'html'
  className?: string
  noDataText?: string
}

const MiniBarChart: React.FC<MiniBarChartProps> = ({
  values,
  secondaryValues,
  height = 28,
  width,
  color,
  secondaryColor,
  labels,
  maxValue: maxOverride,
  barWidth,
  gap = 2,
  mode = 'html',
  className,
  noDataText,
}) => {
  if (!values || !values.length) {
    if (noDataText) return <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{noDataText}</span>
    return null
  }

  const max = maxOverride ?? Math.max(...values, 1)
  const primaryColor = color || 'var(--accent)'
  const stackColor = secondaryColor || 'var(--danger)'
  const hasStacked = secondaryValues && secondaryValues.length === values.length

  if (mode === 'svg') {
    const w = typeof width === 'number' ? width : 92
    const bw = w / values.length
    return (
      <svg viewBox={`0 0 ${w} ${height}`} style={{ color: primaryColor, width: w, height, display: 'block' }} className={className}>
        {values.map((v, i) => {
          const h = Math.max(1, (v / max) * (height - 2))
          return <rect key={i} x={i * bw + 0.5} y={height - h} width={Math.max(1, bw - 1)} height={h} fill="currentColor" opacity="0.85" />
        })}
      </svg>
    )
  }

  return (
    <div className={className} style={{ width: typeof width === 'number' ? width : width }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap, height, width: '100%' }}>
        {values.map((v, i) => {
          const pct = max > 0 ? (v / max) * 100 : 0
          const barH = `${Math.max(2, Math.round(pct))}%`
          const bwVal = barWidth ? `${barWidth}px` : undefined

          if (hasStacked) {
            const sv = secondaryValues![i]
            const sPct = v > 0 ? (sv / v) * pct : 0
            const stackedH = `${Math.round(sPct)}%`
            return (
              <div key={i} style={{
                flex: bwVal ? '0 0 auto' : 1,
                width: bwVal,
                height: '100%',
                display: 'flex',
                alignItems: 'flex-end',
                position: 'relative',
              }}>
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  height: barH, background: primaryColor,
                  opacity: 0.25, borderRadius: 1,
                }} />
                {sv > 0 && (
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    height: stackedH, background: stackColor, borderRadius: 1,
                  }} />
                )}
              </div>
            )
          }

          return (
            <div key={i} style={{
              flex: bwVal ? '0 0 auto' : 1,
              width: bwVal,
              height: barH,
              background: v > 0 ? primaryColor : 'var(--border-subtle)',
              borderRadius: 2,
            }} />
          )
        })}
      </div>
      {labels && labels.length > 0 && (
        <div style={{ display: 'flex', marginTop: 4 }}>
          {labels.map((label, i) => (
            <div key={i} style={{
              flex: 1,
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: 'var(--fg-tertiary)', letterSpacing: 0.06,
              textAlign: i === labels.length - 1 ? 'right' : 'left',
              whiteSpace: 'nowrap', overflow: 'visible',
            }}>
              {label ?? ''}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default MiniBarChart
