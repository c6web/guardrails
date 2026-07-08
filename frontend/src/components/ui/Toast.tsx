export interface ToastProps { msg: string; kind: 'ok' | 'err' }

export function Toast({ msg, kind }: ToastProps) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 300,
      padding: '10px 16px', borderRadius: 8,
      background: kind === 'ok' ? 'var(--ok-bg, rgba(118,180,0,0.12))' : 'var(--danger-bg)',
      color: kind === 'ok' ? 'var(--ok, #76B400)' : 'var(--danger)',
      border: `1px solid ${kind === 'ok' ? 'var(--ok, #76B400)' : 'var(--danger)'}`,
      fontSize: 13, fontWeight: 500, boxShadow: 'var(--shadow-2)',
    }}>{msg}</div>
  )
}
