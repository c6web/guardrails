import React from 'react'
import { X } from '../ui/Icons'
import Sidebar from './Sidebar'

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  theme?: string;
}

function BrandMark({ size = 22, theme }: { size?: number; theme?: string }) {
  const isLight = theme === 'light'
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ flexShrink: 0 }}>
      <rect x="2" y="2" width="28" height="28" rx="3" fill={isLight ? '#FFFFFF' : 'var(--ink-0)'} />
      <path d="M16 6 L24 9 V16 C24 21 20 25 16 26 C12 25 8 21 8 16 V9 Z" fill="none" stroke={isLight ? '#0D1117' : 'var(--paper-0)'} strokeWidth="1.3" />
      <path d="M11 16 H14 L15.5 13.5 L17.5 18.5 L19 16 H21" fill="none" stroke={isLight ? '#0D1117' : 'var(--paper-0)'} strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="23" cy="9" r="2" fill="#76B400" />
    </svg>
  )
}

const MobileDrawer: React.FC<MobileDrawerProps> = ({ open, onClose, theme }) => {
  if (!open) return null
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" style={{ left: 0, right: "auto", borderLeft: "none", borderRight: "1px solid var(--border-subtle)", width: "min(280px, 86vw)" }}>
        <div className="d-hdr">
          <BrandMark size={22} theme={theme} />
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 16 }}>AI Firewall</div>
            <div className="caption" style={{ fontSize: 11 }}>Gateway · Console</div>
          </div>
          <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={onClose}><X w={15} /></button>
        </div>
        <div className="d-body">
          <Sidebar onRouteChange={onClose} />
        </div>
      </aside>
    </>
  )
}

export default MobileDrawer
