export interface ErrorStateProps {
  title: string
  message: string
  onRetry: () => void
}

export function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  return (
    <div className="card" style={{ padding: 24, borderColor: 'var(--danger)', background: 'var(--danger-bg)' }}>
      <div style={{ fontWeight: 600, color: 'var(--danger)', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 12 }}>{message}</div>
      <button className="btn btn-secondary btn-sm" onClick={onRetry}>Retry</button>
    </div>
  )
}
