import React from 'react'

interface SevTagProps {
  sev: 'crit' | 'high' | 'med' | 'low';
}

const SevTag: React.FC<SevTagProps> = ({ sev }) => {
  const map: Record<string, string> = { crit: "Crit", high: "High", med: "Med", low: "Low" }
  const color = sev === "crit" ? "var(--danger)" :
                sev === "high" ? "var(--vermilion-600)" :
                sev === "med" ? "var(--warning)" :
                                "var(--info)"
  return (
    <span className={`sev-tag ${sev}`}>
      <span className="b"><i /><i /><i /><i /></span>
      <span style={{ color }}>{map[sev]}</span>
    </span>
  )
}

export default SevTag
