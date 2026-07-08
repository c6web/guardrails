import React from 'react'
import { X } from './ui/Icons'

interface DeleteLogsModalProps {
  title: string
  onClose: () => void
  onDelete: (daysBack: number | null) => Promise<number>
  loading?: boolean
}

const PRESETS = [
  { label: '1 day', days: 1 },
  { label: '7 days (1 week)', days: 7 },
  { label: '30 days (1 month)', days: 30 },
  { label: '90 days (3 months)', days: 90 },
  { label: '6 months', days: 180 },
  { label: '1 year', days: 365 },
  { label: 'Delete all (regardless of age)', days: -1 },
]

export function DeleteLogsModal({ title, onClose, onDelete }: DeleteLogsModalProps) {
  const [selected, setSelected] = React.useState<number | null>(null)
  const [showConfirm, setShowConfirm] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [deleted, setDeleted] = React.useState<number | null>(null)
  const [error, setError] = React.useState('')

  async function handleDelete() {
    if (selected === null || showConfirm) return
    setShowConfirm(true)
  }

  async function handleConfirmProceed() {
    setShowConfirm(false)
    setDeleting(true)
    setError('')
    try {
      const count = await onDelete(selected)
      setDeleted(count)
      setTimeout(() => {
        onClose()
      }, 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
    setDeleting(false)
  }

  if (deleted !== null) {
    return (
      <>
        <div className="drawer-scrim" onClick={onClose} />
        <div style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          zIndex: 201, background: 'var(--bg-surface)', border: '1px solid var(--border-strong)',
          borderRadius: 8, padding: 24, width: 420, boxShadow: '0 8px 32px rgba(0,0,0,.24)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 600, color: 'var(--accent)', marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Logs deleted</div>
            <div style={{ fontSize: 12, color: 'var(--fg-secondary)' }}>{deleted} record{deleted !== 1 ? 's' : ''} removed</div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 201, background: 'var(--bg-surface)', border: '1px solid var(--border-strong)',
        borderRadius: 8, padding: 24, width: 420, boxShadow: '0 8px 32px rgba(0,0,0,.24)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
          {!showConfirm && !deleting && (
            <button className="icon-btn" onClick={onClose}><X w={14} /></button>
          )}
        </div>

        {!showConfirm && !deleting && (
          <>
            <div style={{ marginBottom: 18 }}>
              <div className="label" style={{ marginBottom: 12 }}>Delete logs older than:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {PRESETS.map(preset => (
                  <label key={preset.days} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    border: '1px solid var(--border-strong)', borderRadius: 6, cursor: 'pointer',
                    background: selected === preset.days ? 'var(--bg-sunken)' : 'transparent',
                    transition: 'background 0.15s'
                  }}>
                    <input
                      type="radio"
                      name="delete-preset"
                      value={preset.days}
                      checked={selected === preset.days}
                      onChange={() => setSelected(preset.days)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 12, flex: 1 }}>{preset.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {error && <div style={{ padding: '8px 10px', borderRadius: 4, background: 'var(--danger-bg)', border: '1px solid var(--danger)', fontSize: 12, color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleDelete} disabled={selected === null}>{selected === null ? 'Select a range' : 'Delete'}</button>
            </div>
          </>
        )}

        {showConfirm && (
          <>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, color: 'var(--fg-secondary)', marginBottom: 12 }}>
                {selected === -1
                  ? 'Are you sure you want to delete ALL logs? This action cannot be undone.'
                  : `Are you sure you want to delete all logs older than <strong>${PRESETS.find(p => p.days === selected)?.label}</strong>? This action cannot be undone.`}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowConfirm(false)}>Go back</button>
              <button className="btn btn-danger" onClick={handleConfirmProceed} disabled={deleting}>{deleting ? 'Deleting…' : 'Confirm delete'}</button>
            </div>
          </>
        )}

        {deleting && !deleted && (
          <>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>Deleting… This may take a moment.</div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
