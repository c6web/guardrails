import React from 'react'

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  area?: boolean;
  dot?: boolean;
}

const Sparkline: React.FC<SparklineProps> = ({ data, width, height = 24, color, area = true, dot = true }) => {
  if (!data || !data.length) return null
  const W = width || 100
  const max = Math.max(...data), min = Math.min(...data)
  const range = max - min || 1
  const stepX = W / (data.length - 1)
  const pts = data.map((v, i) => [i * stepX, height - ((v - min) / range) * (height - 2) - 1])
  const line = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ")
  const ar = `${line} L${W},${height} L0,${height} Z`
  const last = pts[pts.length - 1]
  const style: React.CSSProperties = { color: color || "var(--accent)", height }
  if (width) style.width = width; else style.width = "100%"
  return (
    <svg className="sparkline" viewBox={`0 0 ${W} ${height}`} style={style} preserveAspectRatio="none">
      {area && <path className="ar" d={ar} />}
      <path className="ln" d={line} />
      {dot && <circle className="pt" cx={last[0]} cy={last[1]} r="1.6" />}
    </svg>
  )
}

export default Sparkline
