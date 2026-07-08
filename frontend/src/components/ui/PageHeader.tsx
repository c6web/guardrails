import React from 'react'

export interface PageHeaderProps {
  title: string
  subtitle?: React.ReactNode
  crumbs?: React.ReactNode
  actions?: React.ReactNode
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, crumbs, actions }) => (
  <>
    {crumbs && <div className="crumbs">{crumbs}</div>}
    <div className="page-hdr">
      <div>
        <h1>{title}</h1>
        {subtitle && <div className="sub">{subtitle}</div>}
      </div>
      {actions && <div className="right">{actions}</div>}
    </div>
  </>
)
