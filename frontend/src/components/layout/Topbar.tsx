import React from 'react'
import ReactDOM from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { FaGithub } from 'react-icons/fa'
import { Moon, Sun, Menu } from '../ui/Icons'
import { useAuth } from '../../context/AuthContext'
import { GROUP_LABELS } from '../../api/users'

interface TopbarProps {
  theme: string;
  onTheme: () => void;
  onMenu: () => void;
}


const Topbar: React.FC<TopbarProps> = ({ theme, onTheme, onMenu }) => {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [userMenuOpen, setUserMenuOpen] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const avatarRef = React.useRef<HTMLDivElement>(null)

  const initials = (() => {
    if (!user?.display_name) return 'KC'
    const parts = user.display_name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return user.display_name.slice(0, 2).toUpperCase()
  })()
  const displayName = user?.display_name ?? 'User'
  const groupId = user?.groupId ?? null
  const groupName = groupId ? (GROUP_LABELS[groupId] ?? 'Unassigned') : 'Unassigned'

  async function handleLogout() {
    setUserMenuOpen(false)
    await logout()
    navigate('/login')
  }

  return (
    <div className="topbar">
      <div className="tp-left">
        <button className="icon-btn menu-btn" onClick={onMenu} aria-label="menu">
          <Menu w={18} />
        </button>
        <div className="brand" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
          <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 1024 1024" style={{ flexShrink: 0 }}>
            <rect x="110" y="110" width="804" height="804" rx="180" ry="180" fill="none" stroke="#7bb307" strokeWidth="30"/>
            <g transform="translate(0.000000,1024.000000) scale(0.100000,-0.100000)" fill="#7bb307" stroke="none">
              <path d="M4410 7064 c-452 -43 -767 -179 -1035 -448 -122 -122 -209 -237 -278
-366 -45 -84 -64 -129 -285 -660 -100 -238 -164 -392 -324 -775 -28 -66 -88
-209 -134 -317 -104 -245 -146 -367 -175 -498 -76 -356 72 -656 379 -767 162
-59 93 -56 1400 -60 1332 -5 1270 -8 1140 58 -278 140 -445 377 -489 693 l-12
86 -639 0 c-691 0 -677 -1 -728 55 -21 23 -25 36 -25 93 0 63 7 84 122 357 66
160 154 369 193 465 64 156 99 239 237 570 105 251 187 440 208 476 30 51 100
116 157 145 105 54 86 53 889 56 l745 4 154 162 c84 89 196 207 249 262 296
306 361 376 361 389 0 8 -15 16 -37 20 -38 6 -2007 6 -2073 0z"/>
              <path d="M7053 7063 c-40 -4 -50 -13 -230 -206 -103 -111 -303 -323 -443 -472
-980 -1036 -1079 -1147 -1258 -1401 -391 -556 -452 -1166 -149 -1490 220 -236
584 -347 1028 -315 746 55 1379 509 1652 1187 138 342 149 664 30 904 -81 162
-252 291 -468 352 -85 24 -326 33 -422 15 -36 -6 -43 -5 -43 9 0 8 88 109 196
222 109 114 339 358 513 542 173 184 377 399 454 478 87 90 137 150 135 160
-3 16 -41 17 -478 18 -261 0 -494 -1 -517 -3z m-432 -2149 c59 -28 115 -78
140 -126 85 -166 -37 -504 -239 -663 -126 -101 -277 -155 -427 -155 -304 0
-420 189 -304 493 72 187 225 355 387 425 130 55 349 68 443 26z"/>
            </g>
          </svg>
          <div className="nm">
            Guardrails
            <small className="hide-mobile">GenAI Firewall Gateway</small>
          </div>
        </div>
      </div>

      <div className="tp-right">
        <a
          href="https://github.com/victortong-git/ai-firewall-gateway/"
          target="_blank"
          rel="noopener noreferrer"
          className="icon-btn"
          title="View on GitHub"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <FaGithub size={15} />
        </a>

        <button className="icon-btn" onClick={onTheme} title="Toggle theme">
          {theme === "dark" ? <Sun w={15} /> : <Moon w={15} />}
        </button>
        <div style={{ position: 'relative' }} ref={menuRef}>
          <div
            ref={avatarRef}
            className="av av-jade"
            title={`${displayName} · ${groupName}`}
            style={{ cursor: 'pointer' }}
            onClick={() => setUserMenuOpen(v => !v)}
          >
            {initials}
          </div>
        </div>

        {userMenuOpen && (
          <FloatingMenu onClose={() => setUserMenuOpen(false)} avatarRef={avatarRef}>
            <div style={{ padding: '8px 14px 6px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{displayName}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{groupName}</div>
            </div>
            <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 14px', borderRadius: 0 }} onClick={() => { setUserMenuOpen(false); navigate('/profile') }}>My profile</button>
            <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 14px', borderRadius: 0, color: 'var(--danger)' }} onClick={handleLogout}>Sign out</button>
          </FloatingMenu>
        )}
      </div>
    </div>
  )
}

function FloatingMenu({ children, onClose, avatarRef }: { children: React.ReactNode; onClose: () => void; avatarRef: React.RefObject<HTMLDivElement | null> }) {
  const [pos, setPos] = React.useState<{ top: number; right: number }>({ top: 0, right: 0 })
  const menuNode = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!avatarRef.current) return
    const rect = avatarRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
  }, [avatarRef])

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuNode.current && !menuNode.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return ReactDOM.createPortal(
    <div style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999 }}>
      <div ref={menuNode} onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.18)', minWidth: 180, padding: '6px 0' }}>
        {children}
      </div>
    </div>,
    document.body
  )
}

export default Topbar
