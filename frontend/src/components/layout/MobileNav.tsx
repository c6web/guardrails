import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Activity, PulseRi, AlertTri } from '../ui/Icons'

const ITEMS = [
  { id: "overview",  path: "/",         label: "Home",     Icon: Activity    },
  { id: "traffic",   path: "/traffic",  label: "Traffic",  Icon: PulseRi     },
  { id: "threats",   path: "/threats",  label: "Threats",  Icon: AlertTri    },
]

const MobileNav: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <nav className="mobile-nav">
      {ITEMS.map(it => {
        const active = location.pathname === it.path
        return (
          <button key={it.id} className={`mn-item ${active ? "active" : ""}`} onClick={() => navigate(it.path)}>
            <it.Icon w={18} />
            <span>{it.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

export default MobileNav
