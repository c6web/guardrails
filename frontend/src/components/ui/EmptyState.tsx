import type { ReactNode } from 'react'

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  subtitle?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--fg-tertiary)' }}>
      {icon && <div style={{ opacity: 0.3, marginBottom: 12 }}>{icon}</div>}
      <div style={{ fontWeight: 500, marginBottom: subtitle || action ? 4 : 0 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13, marginBottom: action ? 16 : 0 }}>{subtitle}</div>}
      {action && <div style={{ marginTop: subtitle ? 0 : 12 }}>{action}</div>}
    </div>
  )
}
