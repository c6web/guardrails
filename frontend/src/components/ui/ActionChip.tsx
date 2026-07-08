import React from 'react'
import Chip from './Chip'

interface ActionChipProps {
  action: string;
}

const ActionChip: React.FC<ActionChipProps> = ({ action }) => {
  const kindMap: Record<string, string> = {
    blocked: "err", blocked_output: "err",
    redacted: "warn", redacted_output: "warn",
    sanitized: "warn",
    flagged: "info", monitored: "info", bypassed: "info",
    forwarded: "ok", throttled: "warn", allowed: "ok",
    failed: "err",
  }
  return <Chip kind={kindMap[action] || "muted"}>{action}</Chip>
}

export default ActionChip
