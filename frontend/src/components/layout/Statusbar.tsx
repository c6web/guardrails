import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getTzLabel } from '../../utils/format'
import { getGateways, type GatewayInstance } from '../../api/gateways'

const BUILD_TYPE = import.meta.env.VITE_BUILD_TYPE ?? ''

const TZ_LABEL = (() => { try { return getTzLabel() } catch { return 'UTC' }})()

interface StatusbarProps {
  tickClock: string;
}

interface HealthData {
  healthy: boolean
  partial: boolean
  total: number
  up: number
  down: number
  checked_at: string
  instances: { id: string; name: string; status: string }[]
}

const Statusbar: React.FC<StatusbarProps> = ({ tickClock }) => {
  const { mustChangePassword } = useAuth()
  const [health, setHealth] = useState<HealthData | null>(null)
  const [error, setError] = useState(false)
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('security_warning_dismissed') === 'true' } catch { return false }
  })
  const handleDismiss = useCallback(() => {
    setDismissed(true)
    try { localStorage.setItem('security_warning_dismissed', 'true') } catch {}
  }, [])

  const fetchHealth = async () => {
    try {
      const instances: GatewayInstance[] = await getGateways()
      const results = await Promise.allSettled(
        instances.map(async (inst) => {
          const resp = await fetch(`${inst.url}/health`, { signal: AbortSignal.timeout(5000) })
          return { id: inst.id, name: inst.name, status: resp.ok ? 'up' : 'down' } as const
        })
      )
      const checked = results.map((r, i) => ({
        id: instances[i].id,
        name: instances[i].name,
        status: r.status === 'fulfilled' ? r.value.status : 'down',
      }))
      const up = checked.filter(c => c.status === 'up').length
      const down = checked.length - up
      setHealth({
        healthy: down === 0 && checked.length > 0,
        partial: down > 0 && up > 0,
        total: checked.length,
        up,
        down,
        checked_at: new Date().toISOString(),
        instances: checked,
      })
      setError(false)
    } catch {
      setError(true)
    }
  }

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 10000)
    return () => clearInterval(interval)
  }, [])

  const buildBanner = BUILD_TYPE === 'demo' ? (
    <span className="build-banner demo-build"><span aria-hidden="true">⚠</span> Demo Build — for evaluation only</span>
  ) : BUILD_TYPE === 'development' ? (
    <span className="build-banner dev-build"><span aria-hidden="true">⚙</span> Dev Build</span>
  ) : null

  if (error || !health) {
    return (
      <div className="statusbar">
        <span className="dot" style={{ background: 'var(--danger)', boxShadow: '0 0 0 3px rgba(224,99,81,.18)' }} />
        <span>gateway unreachable</span>
        {buildBanner}
{mustChangePassword && !dismissed ? (
          <>
            <div className="spacer" />
            <span className="icon">&#x1F512;</span>
            <span className="message default-pw">change default admin password</span>
            <button className="dismiss" onClick={handleDismiss}>&times;</button>
          </>
        ) : (
          <div style={{ flex: 1 }} />
        )}
        <span>{tickClock} {TZ_LABEL}</span>
      </div>
    )
  }

  const dotColor = health.healthy ? 'var(--gaf-green)' : health.partial ? 'var(--warning)' : 'var(--danger)'
  const shadowColor = health.healthy ? 'rgba(118,180,0,.18)' : health.partial ? 'rgba(217,163,46,.18)' : 'rgba(224,99,81,.18)'

  let label: string
  if (health.total === 0) {
    label = 'no gateways registered'
  } else if (health.healthy) {
    label = 'gateway healthy'
  } else if (health.partial) {
    label = `partial healthy (${health.up}/${health.down} fail)`
  } else {
    label = 'gateway down'
  }

  return (
    <div className="statusbar">
      <span className="dot" style={{ background: dotColor, boxShadow: `0 0 0 3px ${shadowColor}` }} />
      <span>{label}</span>
      {buildBanner}
      {mustChangePassword && !dismissed ? (
        <>
          <div className="spacer" />
          <span className="icon">&#x1F512;</span>
          <span className="message default-pw">change default admin password</span>
          <button className="dismiss" onClick={handleDismiss}>&times;</button>
        </>
      ) : (
        <div style={{ flex: 1 }} />
      )}
      <span>{tickClock} {TZ_LABEL}</span>
    </div>
  )
}

export default Statusbar
