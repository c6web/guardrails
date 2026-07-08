import React from 'react'

interface ChipProps {
  kind?: string;
  mono?: boolean;
  dot?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

const Chip: React.FC<ChipProps> = ({ kind = "muted", children, mono, dot, style }) => {
  return (
    <span className={`chip chip-${kind} ${mono ? "chip-mono" : ""}`} style={style}>
      {dot && <span className="d" style={{ background: "currentColor" }} />}
      {children}
    </span>
  )
}

export default Chip
