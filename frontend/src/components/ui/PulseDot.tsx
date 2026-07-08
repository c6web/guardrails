import React from 'react'

interface PulseDotProps {
  color?: string;
}

const PulseDot: React.FC<PulseDotProps> = ({ color = "var(--accent)" }) => {
  return (
    <span style={{
      display: "inline-block",
      position: "relative",
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: color,
      boxShadow: `0 0 0 3px ${color}33`
    }} />
  )
}

export default PulseDot
