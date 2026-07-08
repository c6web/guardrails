import type { ReactNode } from 'react'

export interface StatRowProps {
  children: ReactNode
  gap?: number
  mb?: number
}

export function StatRow({ children, gap = 12, mb = 16 }: StatRowProps) {
  return (
    <div style={{ display: 'flex', gap, marginBottom: mb, flexWrap: 'wrap' }}>
      {children}
    </div>
  )
}
