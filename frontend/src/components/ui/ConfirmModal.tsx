import { type ReactNode } from 'react'
import { X } from './Icons'

export interface ConfirmModalProps {
  open?: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
  zIndex?: number
}

export function ConfirmModal({
  open = true,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  busy = false,
  onConfirm,
  onClose,
  zIndex = 220,
}: ConfirmModalProps) {
  if (!open) return null

  return (
    <div className="drawer-scrim" style={{ zIndex }} onClick={onClose}>
      <div
        className="card"
        style={{ width: 'min(400px, 90vw)', padding: 0, margin: 'auto', position: 'relative', top: '30vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="card-hdr">
          <h3>{title}</h3>
          <div className="right"><button className="icon-btn" onClick={onClose}><X w={14} /></button></div>
        </div>
        <div style={{ padding: '16px 20px 20px' }}>
          <div style={{ fontSize: 13, marginBottom: 16 }}>{message}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
              {busy ? 'Processing\u2026' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
