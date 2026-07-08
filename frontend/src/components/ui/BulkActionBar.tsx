import { Trash2 } from './Icons'

export interface BulkActionBarProps {
  selectedCount: number
  onDelete?: () => void
  busy?: boolean
  label?: string
}

export default function BulkActionBar({ selectedCount, onDelete, busy, label = 'selected' }: BulkActionBarProps) {
  if (selectedCount === 0) return null
  return (
    <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="caption">{selectedCount} {label}</span>
      {onDelete && (
        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={onDelete} disabled={busy}>
          <Trash2 w={13} /> Delete selected
        </button>
      )}
    </div>
  )
}
