import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from './Icons'

export interface DrawerProps {
  open?: boolean
  title: string | ReactNode
  subtitle?: string
  icon?: ReactNode
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  width?: number
  zIndex?: number
}

export function Drawer({
  open,
  title,
  subtitle,
  icon,
  children,
  footer,
  onClose,
  width,
  zIndex = 40,
}: DrawerProps) {
  const controlled = open !== undefined
  const [rendered, setRendered] = useState(controlled ? open : true)
  const [closing, setClosing] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!controlled) return
    if (open) {
      setRendered(true)
      setClosing(false)
    } else {
      setClosing(true)
      timerRef.current = setTimeout(() => {
        setRendered(false)
        setClosing(false)
      }, 200)
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [open, controlled])

  const handleClose = useCallback(() => {
    if (controlled) {
      setClosing(true)
      timerRef.current = setTimeout(() => {
        setRendered(false)
        setClosing(false)
        onClose()
      }, 200)
    } else {
      onClose()
    }
  }, [controlled, onClose])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (controlled && closing) return
        handleClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [handleClose, controlled, closing])

  if (!rendered) return null

  return (
    <>
      <div className={`drawer-scrim${closing ? ' closing' : ''}`} style={{ zIndex: zIndex - 10 }} onClick={handleClose} />
      <div className={`drawer${closing ? ' closing' : ''}`} style={{ ...(width ? { width, maxWidth: width } : {}), zIndex }}>
        <div className="d-hdr">
          <div style={{ flex: 1, minWidth: 0 }}>
            {typeof title === 'string' ? (
              <>
                {icon && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {icon}
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
                  </div>
                )}
                {!icon && <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>}
                {subtitle && (
                  <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 2 }}>{subtitle}</div>
                )}
              </>
            ) : (
              title
            )}
          </div>
          <button className="icon-btn" onClick={handleClose}><X w={14} /></button>
        </div>
        <div className="d-body">
          {children}
        </div>
        {footer && <div className="d-foot">{footer}</div>}
      </div>
    </>
  )
}
