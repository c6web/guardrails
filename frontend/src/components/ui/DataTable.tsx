import React, { type ReactNode } from 'react'
import { LoadingState } from './LoadingState'
import { EmptyState } from './EmptyState'

export interface ColumnDef<T> {
  key: string
  label: ReactNode
  width?: number
  align?: 'left' | 'center' | 'right'
  render?: (row: T, index: number) => ReactNode
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[]
  data: T[]
  rowKey: (row: T) => string | number
  onRowClick?: (row: T) => void
  loading?: boolean
  emptyMessage?: string
  emptyState?: ReactNode
  minWidth?: number
  stickyHeader?: boolean
  children?: ReactNode
  rowClassName?: (row: T) => string | undefined
  rowStyle?: (row: T) => React.CSSProperties | undefined
  card?: boolean
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  loading,
  emptyMessage = 'No items found.',
  emptyState,
  minWidth = 800,
  stickyHeader,
  children,
  rowClassName,
  rowStyle,
  card = true,
}: DataTableProps<T>) {
  if (loading) {
    return <LoadingState />
  }

  if (data.length === 0) {
    return emptyState || <EmptyState title={emptyMessage} />
  }

  const tableSection = (
    <>
      <div className="t-wrap">
        <table className="t" style={{ minWidth }}>
          {stickyHeader && (
            <colgroup>
              {columns.map(col => (
                <col key={col.key} style={col.width ? { width: col.width } : undefined} />
              ))}
            </colgroup>
          )}
          <thead>
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  className={col.align === 'right' ? 'r' : undefined}
                  style={{
                    width: col.width,
                    textAlign: col.align,
                    position: stickyHeader ? 'sticky' : undefined,
                    top: stickyHeader ? 0 : undefined,
                    zIndex: stickyHeader ? 1 : undefined,
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={rowKey(row)}
                onClick={() => onRowClick?.(row)}
                style={{ cursor: onRowClick ? 'pointer' : undefined, ...rowStyle?.(row) }}
                className={rowClassName?.(row)}
              >
                {columns.map(col => (
                  <td
                    key={col.key}
                    className={col.align === 'right' ? 'r' : undefined}
                    style={{ textAlign: col.align }}
                  >
                    {col.render ? col.render(row, i) : (row as Record<string, ReactNode>)[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {children}
    </>
  )

  return card ? <div className="card">{tableSection}</div> : tableSection
}
