interface StatCardProps {
  label: string
  value: React.ReactNode
  caption?: React.ReactNode
  tag?: string
  tone?: 'default' | 'danger' | 'warning'
  loading?: boolean
  spark?: React.ReactNode
  variant?: 'kpi' | 'compact'
  accent?: string
  onClick?: () => void
  borderColor?: string
}

export function StatCard({ label, value, caption, tag, tone = 'default', loading, spark, variant = 'kpi', accent, onClick, borderColor }: StatCardProps) {
  if (variant === 'compact') {
    return (
      <div className="card" style={{ flex: 1, minWidth: 120, padding: '14px 18px', cursor: onClick ? 'pointer' : undefined, borderColor }}>
        <div className="mono" style={{ fontSize: 26, fontWeight: 700, color: accent ?? 'var(--fg-primary)', lineHeight: 1 }}>{value}</div>
        <div className="label" style={{ marginTop: 6, fontSize: 11 }}>{label}</div>
      </div>
    )
  }

  return (
    <div className={`kpi${tone !== 'default' ? ` ${tone}` : ''}`} style={{ cursor: onClick ? 'pointer' : undefined }} onClick={onClick}>
      <div className="k">
        {label}
        {tag && <span className="tag">{tag}</span>}
      </div>
      <div className="v" style={accent ? { color: accent } : undefined}>{loading ? '—' : value}</div>
      {caption && <div className="d"><span className="muted">{loading ? '—' : caption}</span></div>}
      {spark && <div className="spark">{!loading && spark}</div>}
    </div>
  )
}
