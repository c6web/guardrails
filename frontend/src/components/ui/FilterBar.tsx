import { type ReactNode } from 'react'

export interface FilterBarProps {
  children: ReactNode
  onClear?: () => void
  mb?: number
}

export function FilterBar({ children, onClear, mb = 12 }: FilterBarProps) {
  return (
    <div className="filterbar" style={{ marginBottom: mb }}>
      {children}
      {onClear && (
        <button className="btn btn-ghost btn-sm" onClick={onClear}>Clear</button>
      )}
    </div>
  )
}
