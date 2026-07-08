import React from 'react'

export interface PaginationProps {
  page: number
  totalPages: number
  totalItems?: number
  onPage: (page: number) => void
}

function buildPageList(page: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const pages: (number | '…')[] = []
  const addRange = (lo: number, hi: number) => {
    for (let i = lo; i <= hi; i++) pages.push(i)
  }
  pages.push(1)
  if (page <= 4) {
    addRange(2, Math.min(5, totalPages - 1))
    if (totalPages > 6) pages.push('…')
  } else if (page >= totalPages - 3) {
    pages.push('…')
    addRange(Math.max(totalPages - 4, 2), totalPages - 1)
  } else {
    pages.push('…')
    addRange(page - 1, page + 1)
    pages.push('…')
  }
  pages.push(totalPages)
  return pages
}

export function Pagination({ page, totalPages, totalItems, onPage }: PaginationProps) {
  if (totalPages <= 1) return null
  const pageList = buildPageList(page, totalPages)
  const btnBase: React.CSSProperties = {
    minWidth: 28, height: 28, padding: '0 6px', borderRadius: 4,
    fontSize: 12, border: '1px solid var(--border-subtle)',
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-surface)', color: 'var(--fg-primary)',
  }
  const activeBtn: React.CSSProperties = {
    ...btnBase, background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)', fontWeight: 600,
  }
  const disabledBtn: React.CSSProperties = {
    ...btnBase, opacity: 0.4, cursor: 'default',
  }
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
      <button style={page <= 1 ? disabledBtn : btnBase} disabled={page <= 1} onClick={() => onPage(page - 1)}>←</button>
      {pageList.map((p, i) =>
        p === '…'
          ? <span key={`e${i}`} style={{ minWidth: 28, textAlign: 'center', fontSize: 12, color: 'var(--fg-tertiary)' }}>…</span>
          : <button key={p} style={p === page ? activeBtn : btnBase} onClick={() => p !== page && onPage(p as number)}>{p}</button>
      )}
      <button style={page >= totalPages ? disabledBtn : btnBase} disabled={page >= totalPages} onClick={() => onPage(page + 1)}>→</button>
      {totalItems !== undefined && (
        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--fg-tertiary)' }}>{totalPages} pages</span>
      )}
    </div>
  )
}
