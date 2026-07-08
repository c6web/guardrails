import React from 'react'
import Chip from './Chip'
import type { PipelineTrace } from '../../types'

export function Badge({ kind, children }: {
  kind: 'ok' | 'warn' | 'err' | 'info' | 'muted'
  children: React.ReactNode
}) {
  return <Chip kind={kind}>{children}</Chip>
}

// ── ScannerBadge (moved from AIActivitiesShared) ──────────────────────────────

type ScannerInfo = { label: string; kind: 'err' | 'warn' | 'muted' }

function scannerLabel(row: {
  blockedStage?: string | null
  detector?: string | null
  confidence?: number | null
  t2Flagged?: boolean | null
  pipelineTrace?: PipelineTrace | null
}): ScannerInfo | null {
  const stage = row.blockedStage
  if (stage === 'keyword_regex') {
    const kwStage = row.pipelineTrace?.stages?.find(s => s.stage === 'keyword_regex')
    const isRegex = kwStage?.reason?.startsWith('Regex')
    return isRegex
      ? { label: 'T1 · Regex',   kind: 'warn' }
      : { label: 'T1 · Keyword', kind: 'warn' }
  }
  if (stage === 'semantic_llm')  return { label: 'T1 · Semantic+AI', kind: 'err'  }
  if (stage === 't2_intent')     return { label: 'T2 · Intent',      kind: 'err'  }
  if (stage === 'output_scan')   return { label: 'Output Scan',       kind: 'warn' }
  if (stage === 'acl')           return { label: 'Network ACL',       kind: 'muted' }
  if (row.t2Flagged)             return { label: 'T2 · Intent',      kind: 'err'  }
  if (row.confidence !== null && row.confidence !== undefined)
                                 return { label: 'T1 · Classifier',  kind: 'err'  }
  if (row.detector && row.detector !== 'classifier')
                                 return { label: 'T1 · Rule',        kind: 'warn' }
  return null
}

export function ScannerBadge({ row }: {
 row: {
  blockedStage?: string | null
  detector?: string | null
  confidence?: number | null
  t2Flagged?: boolean | null
  pipelineTrace?: PipelineTrace | null
 }
}): React.ReactElement | null {
  const s = scannerLabel(row)
  if (!s) return null
  return <Chip kind={s.kind} mono>{s.label}</Chip>
}
