import React, { ReactNode } from 'react'

export interface ActionDef {
  icon: ReactNode
  label: string
  danger?: boolean
  onClick: () => void
  disabled?: boolean
  title?: string
}

export interface ActionCellProps {
  actions: ActionDef[]
}

const ActionCell: React.FC<ActionCellProps> = ({ actions }) => (
  <div className="row-tight" style={{ gap: 4 }} onClick={e => e.stopPropagation()}>
    {actions.map((a, i) => (
      <button key={i} className="icon-btn"
        title={a.title ?? a.label}
        disabled={a.disabled}
        style={a.danger ? { color: 'var(--danger)' } : undefined}
        onClick={a.onClick}>
        {a.icon}
      </button>
    ))}
  </div>
)

export default ActionCell
