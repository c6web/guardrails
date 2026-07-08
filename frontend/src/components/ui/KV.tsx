import React from 'react'

export interface KVRow {
  label: string
  value: React.ReactNode
  mono?: boolean
}

export interface KVProps {
  rows: (KVRow | null | undefined | false | '' | 0)[]
  labelWidth?: number
  gap?: number
  style?: React.CSSProperties
}

const KV: React.FC<KVProps> = ({ rows, labelWidth = 130, gap = 8, style }) => {
  return (
    <dl
      className="kv"
      style={{
        gridTemplateColumns: `${labelWidth}px 1fr`,
        gap: `${gap}px 12px`,
        ...style,
      }}
    >
      {rows.filter((r): r is KVRow => !!r).map((row, i) => (
        <React.Fragment key={i}>
          <dt>{row.label}</dt>
          <dd className={row.mono ? 'mono' : ''}>{row.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  )
}

export default KV
