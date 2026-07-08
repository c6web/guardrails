import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Icons, Dot } from '../ui/Icons'
import { PulseDot } from '../ui'
import { useAuth } from '../../context/AuthContext'
import { getSidebarNav, getRouteMap } from '../../pages/pageRegistry'
import { getSidebarCounts } from '../../api/sidebar'
import type { SidebarGroup } from '../../pages/pageRegistry'

const NAV = getSidebarNav()
const ROUTE_MAP = getRouteMap()

const COUNT_MAP: Record<string, keyof SidebarCounts> = {
  users: 'users',
}

interface SidebarCounts {
  detectors: number
  apps: number
  users: number
}

function getRouteId(pathname: string): string {
  if (pathname === '/') return 'overview'
  const seg = pathname.slice(1)
  return seg
}

interface SidebarProps {
  onRouteChange?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onRouteChange }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAdmin, hasViewerOrAbove } = useAuth()
  const routeId = getRouteId(location.pathname)
  const [counts, setCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    getSidebarCounts().then(data => {
      const c: Record<string, number> = {}
      for (const [navId, countKey] of Object.entries(COUNT_MAP)) {
        c[navId] = data[countKey] as number
      }
      setCounts(c)
    }).catch(err => console.error('[Sidebar] Failed to fetch counts:', err))
  }, [])

  const handleNav = (id: string) => {
    const path = ROUTE_MAP[id] || `/${id}`
    navigate(path)
    onRouteChange?.()
  }

  return (
    <aside className="sidebar">
      {(NAV as SidebarGroup[]).map((sec, gi) => {
        if (sec.requiresAdmin && !isAdmin) return null
        const visibleItems = sec.items.filter(it => {
          if (it.requiresAdmin && !isAdmin) return false
          if (it.requiresAdminOrViewer && !hasViewerOrAbove) return false
          return true
        })
        if (visibleItems.length === 0) return null
        return (
          <div className="nav-section" key={gi}>
            <div className="nav-label">
              <span>{sec.group}</span>
              <span className="ix">§{gi + 1}</span>
            </div>
            {visibleItems.map(it => {
              const Icon = Icons[it.icon] || Dot
              const active = routeId === it.id
              const dynamicCount = it.count === "live" ? "live" : (it.count !== null && typeof it.count !== 'number' ? it.count : counts[it.id])
              return (
                <div key={it.id} className={`nav-item ${active ? "active" : ""}`} onClick={() => handleNav(it.id)}>
                  <Icon w={15} />
                  <span>{it.label}</span>
                  {it.live ? (
                    <span className="count" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--accent)" }}>
                      <PulseDot color="var(--accent)" /> LIVE
                    </span>
                  ) : dynamicCount !== null && typeof dynamicCount !== 'number' ? (
                    <span className={`count ${it.crit ? "crit" : ""}`}>{dynamicCount}</span>
                  ) : typeof dynamicCount === 'number' ? (
                    <span className={`count ${it.crit ? "crit" : ""}`}>{dynamicCount}</span>
                  ) : null}
                </div>
              )
            })}
          </div>
        )
      })}
    </aside>
  )
}

export default Sidebar
