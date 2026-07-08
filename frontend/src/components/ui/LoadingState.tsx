export interface LoadingStateProps {
  message?: string
  size?: 'sm' | 'md' | 'lg'
}

export function LoadingState({ message = 'Loading\u2026', size = 'md' }: LoadingStateProps) {
  const padding = size === 'sm' ? 16 : size === 'lg' ? 48 : 32
  return (
    <div className="card" style={{ padding, textAlign: 'center', color: 'var(--fg-tertiary)' }}>
      {message === 'Loading\u2026' && size !== 'sm' && (
        <div style={{ marginBottom: 8 }}>
          <span style={{ display: 'inline-block', width: 20, height: 20, border: '2px solid var(--fg-tertiary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
        </div>
      )}
      {message}
    </div>
  )
}
