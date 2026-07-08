import React from 'react'
import { KV, Drawer, Tabs } from '../../components/ui'
import { ShieldCheck, AlertTri } from '../../components/ui/Icons'
import type { DetectionFramework, ThreatKnowledgeSummary, DetectorSummary } from '../../api/detectionFrameworks'
import { accentFor, riskLabel } from './DFCard'

interface FrameworkDetailDrawerProps {
  fw: DetectionFramework
  open?: boolean
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onKnowledge: () => void
  onEditMappings: () => void
  onDetectorClick?: () => void
  isAdmin: boolean
}

export function FrameworkDetailDrawer({ fw, open, onClose, onEdit, onDelete, onKnowledge, onEditMappings, onDetectorClick, isAdmin }: FrameworkDetailDrawerProps) {
  const [activeTab, setActiveTab] = React.useState<'main' | 'detectors' | 'threat-knowledge'>('main')

  const tkEntries: ThreatKnowledgeSummary[] = fw.threatKnowledgeEntries || []
  const detectors: DetectorSummary[] = fw.detectors || []

  return (
    <Drawer
      open={open}
      title={
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="mono" style={{
              fontSize: 10, fontWeight: 700, padding: '2px 6px',
              borderRadius: 3, background: accentFor(fw.id) + '18',
              color: accentFor(fw.id), border: `1px solid ${accentFor(fw.id)}44`,
            }}>{fw.framework_code}</span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{fw.name}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2 }}>{fw.id}</div>
        </>
      }
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Back</button>
          {isAdmin && (
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={onDelete}>Remove</button>
          )}
          <div style={{ flex: 1 }} />
          {isAdmin && (
            <button className="btn btn-primary" onClick={onEdit}>Edit</button>
          )}
        </>
      }
    >
      <Tabs tabs={[
        { key: 'main', label: 'Main' },
        { key: 'detectors', label: `Detectors (${detectors.length})` },
        { key: 'threat-knowledge', label: `Threat Knowledge (${tkEntries.length})` },
      ]} activeKey={activeTab} onChange={setActiveTab} />

      <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
        {/* Main tab */}
        {activeTab === 'main' && (
          <KV rows={[
            { label: 'Description', value: <span style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{fw.description}</span>, mono: true },
            { label: 'Risk Level', value: (
              <span style={{ fontSize: 12 }}>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                  background: accentFor(fw.id) + '14', color: accentFor(fw.id) }}>{riskLabel(fw.id)}</span>
              </span>
            ) },
            { label: 'Num of Detectors', value: <span style={{ fontSize: 12 }}>{detectors.length}</span> },
            { label: 'Num of Threat Knowledge', value: <span style={{ fontSize: 12 }}>{tkEntries.length}</span> },
            { label: 'Created', value: <span style={{ fontSize: 12 }}>{((fw as any).created_at ?? (fw as any).createdAt) || '—'}</span>, mono: true },
            { label: 'Updated', value: <span style={{ fontSize: 12 }}>{((fw as any).updated_at ?? (fw as any).updatedAt) || '—'}</span>, mono: true },
          ]} />
        )}

        {/* Detectors tab */}
        {activeTab === 'detectors' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Mapped Detectors ({detectors.length})</span>
              {isAdmin && (
                <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }} onClick={onEditMappings}>
                  Edit Detectors Mapping
                </button>
              )}
            </div>
            {detectors.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--fg-secondary)', padding: '24px 0', textAlign: 'center' }}>
                No detectors mapped to this framework
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {detectors.map(det => (
                  <div key={det.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                    borderRadius: 6, border: '1px solid var(--border)', fontSize: 12,
                  }}>
                    <span style={isAdmin ? {
                      flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      cursor: 'pointer', color: 'var(--accent)',
                    } : {
                      flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }} onClick={isAdmin ? e => { e.stopPropagation(); onDetectorClick?.() } : undefined}>
                      {det.name}
                    </span>
                    <span className="mono" style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'var(--bg-sunken)', color: 'var(--fg-tertiary)' }}>
                      {det.rule_type} · threshold {det.threshold}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Threat Knowledge tab */}
        {activeTab === 'threat-knowledge' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Linked Threat Knowledge ({tkEntries.length})</span>
              {isAdmin && (
                <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }} onClick={onKnowledge}>
                  Edit Knowledge Mapping
                </button>
              )}
            </div>
            {tkEntries.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--fg-secondary)', padding: '24px 0', textAlign: 'center' }}>
                No threat knowledge linked to this framework
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {tkEntries.map(tk => (
                  <div key={tk.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                    borderRadius: 6, border: '1px solid var(--border)', fontSize: 12,
                  }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tk.name}
                    </span>
                    {tk.embedding_at ? (
                      <span style={{ color: 'var(--ok, #76B400)', fontSize: 10 }}><ShieldCheck w={10} /></span>
                    ) : (
                      <span style={{ color: 'var(--warning)', fontSize: 10 }}><AlertTri w={10} /></span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Drawer>
  )
}
