import { type ReactNode } from 'react'
import { X } from './Icons'

export interface FormModalProps {
  open?: boolean
  title: ReactNode
  width?: number | string
  busy?: boolean
  busyLabel?: string
  submitLabel?: string
  submitVariant?: 'primary' | 'danger' | 'warning'
  cancelLabel?: string
  children: ReactNode
  onSubmit: (e: React.FormEvent) => void
  onClose: () => void
  zIndex?: number
  top?: string
}

export function FormModal({
  open = true,
  title,
  width = 520,
  busy = false,
  busyLabel = 'Saving\u2026',
  submitLabel = 'Save',
  submitVariant = 'primary',
  cancelLabel = 'Cancel',
  children,
  onSubmit,
  onClose,
  zIndex = 210,
  top = '5vh',
}: FormModalProps) {
  if (!open) return null

  const btnClass = submitVariant === 'primary' ? 'btn-primary'
    : submitVariant === 'danger' ? 'btn-danger'
    : 'btn-warning'

  return (
    <div className="drawer-scrim" style={{ zIndex }} onClick={onClose}>
      <div className="card"
        style={{ width: typeof width === 'number' ? `${width}px` : width, maxHeight: '90vh', overflow: 'auto', padding: 0, margin: 'auto', position: 'relative', top }}
        onClick={e => e.stopPropagation()}>
        <div className="card-hdr">
          <h3>{title}</h3>
          <div className="right"><button className="icon-btn" onClick={onClose}><X w={14} /></button></div>
        </div>
        <form onSubmit={onSubmit} style={{ padding: '16px 20px 20px' }}>
          {children}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>{cancelLabel}</button>
            <button type="submit" className={`btn ${btnClass}`} disabled={busy}>
              {busy ? busyLabel : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
