import React from 'react'
import { useFrameworks } from '../../context/FrameworkContext'

interface FrameworkPillProps {
  id: string | null;
  withName?: boolean;
  onClick?: () => void;
}

const FrameworkPill: React.FC<FrameworkPillProps> = ({ id, withName, onClick }) => {
  const frameworks = useFrameworks()
  if (!id || !frameworks) return null
  const fw = frameworks[id]
  if (!fw) return null
  return (
    <span className="owasp" onClick={onClick} style={onClick ? { cursor: "pointer" } : undefined} title={`${fw.framework_code} · ${fw.name}`}>
      <span className="ix">§</span>
      <b>{fw.framework_code}</b>
      {withName && <span style={{ color: "var(--fg-primary)" }}>· {fw.name}</span>}
    </span>
  )
}

export default FrameworkPill
