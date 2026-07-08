import React from 'react'
import { getBreadcrumbs } from '../../pages/pageRegistry'

export interface BreadcrumbsProps {
  pageId: string
}

export function Breadcrumbs({ pageId }: BreadcrumbsProps) {
  const segments = getBreadcrumbs(pageId)
  if (segments.length === 0) return null
  return (
    <div className="crumbs">
      {segments.map((s, i) =>
        i === segments.length - 1
          ? <span className="here" key={i}>{s}</span>
          : <React.Fragment key={i}><span>{s}</span><span className="sep">/</span></React.Fragment>
      )}
    </div>
  )
}
