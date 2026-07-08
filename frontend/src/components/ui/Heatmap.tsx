import React, { useLayoutEffect, useRef, useState } from 'react'

interface HeatmapRow {
  code: string;
  [key: string]: unknown;
}

interface HeatmapProps {
  grid: number[][];
  rows: HeatmapRow[];
}

function bucketCountForWidth(width: number): number {
  if (width >= 700) return 24
  if (width >= 420) return 12
  if (width >= 300) return 8
  return 6
}

function formatHour(localH: number): string {
  return localH === 0 ? "12am" : localH < 12 ? `${localH}am` : localH === 12 ? "12pm" : `${localH - 12}pm`
}

const Heatmap: React.FC<HeatmapProps> = ({ grid, rows }) => {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const now = Date.now()
  // displayIdx 23 = now, displayIdx 0 = 23 hours ago
  const COL_DATES = Array.from({ length: 24 }, (_, displayIdx) => {
    const hoursAgo = 23 - displayIdx
    return new Date(now - hoursAgo * 3_600_000)
  })
  const safeGrid = grid || []
  const safeRows = rows || []
  if (!safeGrid.length || !safeRows.length) return <div style={{ padding: 24, textAlign: "center", color: "var(--fg-tertiary)" }}>No heatmap data available</div>

  const bucketCount = width ? bucketCountForWidth(width) : 24
  const bucketSize = 24 / bucketCount
  // Each bucket's date/"now" flag comes from its last (most recent) hour
  const bucketDates = Array.from({ length: bucketCount }, (_, bi) => COL_DATES[bi * bucketSize + bucketSize - 1])
  const bucketGrid = safeGrid.map(row =>
    Array.from({ length: bucketCount }, (_, bi) => {
      let sum = 0
      for (let i = 0; i < bucketSize; i++) sum += row[bi * bucketSize + i] || 0
      return sum
    })
  )
  const globalMax = Math.max(...bucketGrid.flat()) || 1
  const rowMaxes = bucketGrid.map(row => Math.max(...row) || 1)
  const labelWidth = width && width < 360 ? 50 : 70

  return (
    <div className="hm-scroll" ref={wrapRef}>
      <div className="hm-grid" style={{ gridTemplateColumns: `${labelWidth}px 1fr` }}>
        <div className="hm-corner" />
        {/* x-axis: show a label periodically, rightmost always "now" */}
        <div className="heatmap" style={{ display: "grid", gridTemplateColumns: `repeat(${bucketCount}, 1fr)`, gap: 2 }}>
          {Array.from({ length: bucketCount }, (_, bi) => {
            const isLast = bi === bucketCount - 1
            const colDate = bucketDates[bi]
            const localH = colDate.getHours()
            const isMidnight = localH === 0 && !isLast
            const showHour = bi % Math.max(1, Math.round(bucketCount / 4)) === 0
            const localLabel = formatHour(localH)
            const label = isLast ? localLabel
              : isMidnight ? colDate.toLocaleDateString('en', { month: 'short', day: 'numeric' })
              : showHour ? localLabel
              : ""
            return (
              <div key={bi} className="hm-x" style={{ textAlign: isLast ? "right" : "left", paddingLeft: isLast ? 0 : 2, paddingRight: isLast ? 2 : 0, color: isMidnight ? "var(--fg-primary)" : undefined, fontWeight: isMidnight ? 600 : undefined }}>
                {label}
              </div>
            )
          })}
        </div>
        {safeRows.map((r, ri) => {
          const rowMax = rowMaxes[ri]
          return (
            <React.Fragment key={ri}>
              <div className="hm-y">
                {r.code}
              </div>
              <div className="heatmap" style={{ display: "grid", gridTemplateColumns: `repeat(${bucketCount}, 1fr)`, gap: 2 }}>
                {Array.from({ length: bucketCount }, (_, bi) => {
                  const v = (bucketGrid[ri] || [])[bi] || 0
                  const rowRatio    = v / rowMax
                  const globalRatio = v / globalMax
                  const alpha = v === 0 ? 0 : Math.max(0.45, 0.2 + rowRatio * 0.8)
                  const bg = v === 0 ? `var(--bg-sunken)`
                            : globalRatio > 0.5  ? `rgba(179,50,31,${alpha})`
                            : globalRatio > 0.15 ? `rgba(184,134,11,${alpha})`
                            : `rgba(118,180,0,${alpha})`
                  const fg = globalRatio > 0.5 ? '#fff' : undefined
                  const isNow = bi === bucketCount - 1
                  const colDate = bucketDates[bi]
                  const localLabel = formatHour(colDate.getHours())
                  const rangeLabel = bucketSize > 1 ? `${formatHour(COL_DATES[bi * bucketSize].getHours())}–${localLabel}` : localLabel
                  return (
                    <div key={bi} className="hm-cell" data-empty={v === 0 ? "1" : undefined}
                      style={{ background: bg, boxShadow: isNow ? 'inset 0 0 0 1px var(--fg-tertiary)' : undefined }}
                      title={`${r.code} · ${rangeLabel} · ${v} threats`}
                    >
                      {v > 0 && <span className="hm-val" style={{ lineHeight: 1, pointerEvents: "none", color: fg }}>{v}</span>}
                    </div>
                  )
                })}
              </div>
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

export default Heatmap
