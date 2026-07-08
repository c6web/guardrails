import { Pencil, Trash2 } from '../../components/ui/Icons'
import type { DetectionFramework } from '../../api/detectionFrameworks'
import ActionCell from '../../components/ui/ActionCell'

// ── Color helpers ─────────────────────────────────────────────────────────────
const RISK_COLOR: Record<string, string> = {
  'owasp-2025-llm01': 'var(--danger)',
  'owasp-2025-llm02': 'var(--danger)',
  'owasp-2025-llm03': 'var(--warning)',
  'owasp-2025-llm04': 'var(--warning)',
  'owasp-2025-llm05': 'var(--danger)',
  'owasp-2025-llm06': 'var(--warning)',
  'owasp-2025-llm07': 'var(--warning)',
  'owasp-2025-llm08': 'var(--warning)',
  'owasp-2025-llm09': 'var(--fg-secondary)',
  'owasp-2025-llm10': 'var(--warning)',
  'agentic-ai-2026': 'var(--danger)',
}

export function accentFor(id: string): string {
  return RISK_COLOR[id] || 'var(--accent)'
}

export function riskLabel(id: string): string {
  const color = accentFor(id)
  if (color === 'var(--danger)') return 'High'
  if (color === 'var(--warning)') return 'Medium'
  return 'Low'
}

// ── Framework Card ────────────────────────────────────────────────────────────

interface FrameworkCardProps {
  fw: DetectionFramework
  isAdmin: boolean
  onDetail: () => void
  onKnowledgeMapping: () => void
  onDetectorMapping: () => void
  onEdit: () => void
  onDelete: () => void
}

export function FrameworkCard({ fw, isAdmin, onDetail, onKnowledgeMapping, onDetectorMapping, onEdit, onDelete }: FrameworkCardProps) {
  const accent = accentFor(fw.id)
  const tkEntries = fw.threatKnowledgeEntries || []


  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', cursor: 'pointer' }} onClick={onDetail}>
       <div style={{ padding: '14px 16px', flex: 1 }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="mono" style={{
              fontSize: 11, fontWeight: 700, padding: '2px 7px',
              borderRadius: 4, background: accent + '18',
              color: accent, border: `1px solid ${accent}44`,
              flexShrink: 0,
            }}>{fw.framework_code}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '1px 6px',
              borderRadius: 4, background: accent + '14',
              color: accent, textTransform: 'uppercase', letterSpacing: 0.04,
            }}>{riskLabel(fw.id)}</span>
          </div>
        </div>

        {/* Name */}
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, color: 'var(--fg-primary)' }}>
          {fw.name}
        </div>

        {/* Description */}
        <div className="caption" style={{
          fontSize: 12, lineHeight: 1.55, color: 'var(--fg-secondary)',
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          marginBottom: 10,
        }}>
          {fw.description}
        </div>
      </div>

    {/* Action row */}
      <div style={{
        padding: '8px 12px',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
         <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
            onClick={isAdmin ? e => { e.stopPropagation(); onDetectorMapping() } : e => e.stopPropagation()}
            title={isAdmin ? 'Manage detector mappings' : undefined}
            disabled={!isAdmin}>
            Detectors ({fw.detectors?.length || 0})
          </button>
         <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
            onClick={isAdmin ? e => { e.stopPropagation(); onKnowledgeMapping() } : e => e.stopPropagation()}
            title={isAdmin ? 'Manage threat knowledge entries' : undefined}
            disabled={!isAdmin}>
            Knowledges ({tkEntries.length})
          </button>
         <div style={{ flex: 1 }} />
          {isAdmin && (
            <ActionCell actions={[
              { icon: <Pencil w={13} />, label: 'Edit framework', onClick: () => onEdit() },
              { icon: <Trash2 w={13} />, label: 'Delete framework', danger: true, onClick: () => onDelete() },
            ]} />
          )}
      </div>
    </div>
  )
}
