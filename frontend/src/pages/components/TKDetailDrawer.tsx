import React from 'react'
import { KV, Drawer } from '../../components/ui'
import { Network } from '../../components/ui/Icons'
import { fmtTsStr } from '../../utils/format'
import { embedThreatKnowledge, type ThreatKnowledge } from '../../api/threatKnowledge'
import { addThreatKnowledgeMapping, removeThreatKnowledgeMapping, type DetectionFramework } from '../../api/detectionFrameworks'
import { ConfirmModal } from './TKModals'
import { useAuth } from '../../context/AuthContext'

// ── Embedding status helpers (module-level) ───────────────────────────────────

export const DEFAULT_DIM = 1024

export function embStatus(item: ThreatKnowledge, activeDim?: number): 'no-embedding' | 'valid' | 'corrupted' | 'dimension-mismatch' {
  if (!item.embedding || item.embedding.length === 0) return 'no-embedding'
  const actualDim = item.embedding.length
  if (activeDim !== undefined && actualDim !== activeDim) return 'dimension-mismatch'
  if (actualDim < 1) return 'corrupted'
  return 'valid'
}

export const embLabel: Record<string, string> = {
  'no-embedding': 'No Embedding',
  valid: 'Valid',
  corrupted: 'Corrupted',
  'dimension-mismatch': 'Dimension Mismatch',
}

export const embColor: Record<string, string> = {
  'no-embedding': 'var(--warning, #f5a623)',
  valid: 'var(--ok, #76B400)',
  corrupted: 'var(--danger)',
  'dimension-mismatch': 'var(--warning, #f5a623)',
}

// ── Detail drawer ─────────────────────────────────────────────────────────────

export function DetailDrawer({ item, open, onClose, onEdit, onDelete, onRefresh, allFrameworks, linkedFrameworkIds }: {
  item: ThreatKnowledge
  open?: boolean
  onClose: () => void
  onEdit?: () => void
  onDelete?: () => void
  onRefresh: () => void
  allFrameworks: DetectionFramework[]
  linkedFrameworkIds: Set<string>
}) {
  const [embeddingBusy, setEmbeddingBusy] = React.useState(false)
  const [embeddingError, setEmbeddingError] = React.useState<string | null>(null)
  const [showConfirmReEmbed, setShowConfirmReEmbed] = React.useState(false)
  const [frameworkBusy, setFrameworkBusy] = React.useState<Record<string, boolean>>({})
  const [pendingFrameworks, setPendingFrameworks] = React.useState<Set<string>>(linkedFrameworkIds)
  const [saveBusy, setSaveBusy] = React.useState(false)
  const { isAdmin } = useAuth()

  function hasPendingChanges(): boolean {
    const original = linkedFrameworkIds
    if (original.size !== pendingFrameworks.size) return true
    for (const id of pendingFrameworks) {
      if (!original.has(id)) return true
    }
    for (const id of original) {
      if (!pendingFrameworks.has(id)) return true
    }
    return false
  }

  async function handleEmbed() {
    const status = item.embedding_status || embStatus(item)
    if (status === 'valid') {
      setShowConfirmReEmbed(true)
      return
    }
    await doEmbedItem()
  }

  async function doEmbedItem() {
    setEmbeddingBusy(true)
    setEmbeddingError(null)
    try {
      await embedThreatKnowledge(item.id)
      onRefresh()
    } catch (err) {
      setEmbeddingError((err as Error).message || 'Embedding failed')
    } finally {
      setEmbeddingBusy(false)
    }
  }

  async function handleConfirmReEmbed() {
    setShowConfirmReEmbed(false)
    await doEmbedItem()
  }

  async function handleSaveFrameworks() {
    setSaveBusy(true)
    try {
      const toAdd = new Set<string>()
      const toRemove = new Set<string>()
      for (const id of pendingFrameworks) {
        if (!linkedFrameworkIds.has(id)) toAdd.add(id)
      }
      for (const id of linkedFrameworkIds) {
        if (!pendingFrameworks.has(id)) toRemove.add(id)
      }
      for (const id of toAdd) {
        setFrameworkBusy(prev => ({ ...prev, [id]: true }))
        await addThreatKnowledgeMapping(id, item.id)
      }
      for (const id of toRemove) {
        setFrameworkBusy(prev => ({ ...prev, [id]: true }))
        await removeThreatKnowledgeMapping(id, item.id)
      }
      onRefresh()
    } catch (err) {
      console.error(err)
    } finally {
      setSaveBusy(false)
      setFrameworkBusy({})
    }
  }

  async function handleToggleFramework(fw: DetectionFramework, checked: boolean) {
    setPendingFrameworks(prev => {
      const next = new Set(prev)
      if (checked) next.add(fw.id)
      else next.delete(fw.id)
      return next
    })
  }

  return (
    <Drawer
      open={open}
      icon={<Network w={14} style={{ color: 'var(--accent)' }} />}
      title={item.name}
      subtitle={item.id}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Back</button>
          {onDelete && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={onDelete}>Remove</button>}
          <div style={{ flex: 1 }} />
          {hasPendingChanges() && (
            <button className="btn btn-primary" onClick={handleSaveFrameworks} disabled={saveBusy}>
              {saveBusy ? 'Saving…' : 'Save Frameworks'}
            </button>
          )}
          {isAdmin && (
            <button className="btn btn-ghost btn-sm" onClick={handleEmbed} disabled={embeddingBusy || !item.threat_context?.trim()}>
              {embeddingBusy ? 'Embedding…' : 'Embed'}
            </button>
          )}
          {onEdit && <button className="btn btn-primary" onClick={onEdit}>Edit</button>}
        </>
      }
    >
      <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
        <KV rows={[
          { label: 'Description', value: <span style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{item.description}</span>, mono: true },
          item.threat_context && { label: 'Attack Example', value: <span style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{item.threat_context}</span>, mono: true },
          { label: 'Embedding', value: (
            <span style={{ fontSize: 12, color: embColor[item.embedding_status || embStatus(item)] }}>
              {embLabel[item.embedding_status || embStatus(item)]}
              {item.embedding && item.embedding.length > 0 && (
                <span>
                  {' '}
                  — actual{' '}
                  <strong>{item.embedding.length}</strong>
                  {' dimensions'}
                  {(item.embedding_status === 'dimension-mismatch' || embStatus(item) === 'dimension-mismatch') && `, expected {DEFAULT_DIM}`}
                </span>
              )}
            </span>
          ) },
          item.embedding_at && { label: 'Embedded At', value: <span style={{ fontSize: 12 }}>{fmtTsStr(item.embedding_at)}</span>, mono: true },
          item.source && { label: 'Source', value: (
            <span style={{ fontSize: 12 }}>
              {item.source === 'agent' ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 4, background: 'rgba(91,141,239,0.12)', color: 'var(--info, #8BB1DE)', fontWeight: 600 }}>Agent</span>
                  <span style={{ color: 'var(--fg-secondary)' }}>auto-created by Knowledge Developer</span>
                </span>
              ) : item.source}
            </span>
          ) },
          item.status && item.status !== 'active' && { label: 'Status', value: (
            <span style={{ fontSize: 12 }}>
              {item.status === 'pending' && <span style={{ color: 'var(--warning)', fontWeight: 600 }}>Pending review</span>}
              {item.status === 'rejected' && <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Rejected</span>}
            </span>
          ) },
          item.origin_request_id && { label: 'Origin request', value: <span style={{ fontSize: 11, wordBreak: 'break-all', color: 'var(--fg-secondary)' }}>{item.origin_request_id}</span>, mono: true },
          { label: 'Created', value: <span style={{ fontSize: 12 }}>{fmtTsStr(item.createdAt)}</span>, mono: true },
          { label: 'Updated', value: <span style={{ fontSize: 12 }}>{fmtTsStr(item.updatedAt)}</span>, mono: true },
          item.quality_review_result && { label: 'Quality', value: (
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'capitalize',
              color: item.quality_review_result === 'good' ? 'var(--ok)' : item.quality_review_result === 'poison' ? 'var(--danger)' : 'var(--warn)' }}>
              {item.quality_review_result === 'poor_quality' ? 'poor' : item.quality_review_result}
            </span>
          ) },
          item.quality_review_result && item.quality_review_reason && { label: 'Review Reason', value: <span style={{ fontSize: 12, color: 'var(--fg-secondary)', lineHeight: 1.5 }}>{item.quality_review_reason}</span> },
          item.quality_review_result && item.quality_reviewed_at && { label: 'Reviewed At', value: <span style={{ fontSize: 12 }}>{fmtTsStr(item.quality_reviewed_at)}</span>, mono: true },
        ]} />

        {/* Linked frameworks section */}
        <div style={{ marginTop: 20 }}>
          <label className="label" style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
            Linked Frameworks
          </label>
          {isAdmin ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {allFrameworks.map(fw => {
                const checked = pendingFrameworks.has(fw.id)
                return (
                  <label key={fw.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e => handleToggleFramework(fw, e.target.checked)}
                      disabled={frameworkBusy[fw.id] || saveBusy}
                    />
                    <span style={{ fontSize: 12 }}>{fw.framework_code}</span>
                    <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{fw.name}</span>
                  </label>
                )
              })}
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {allFrameworks.filter(fw => linkedFrameworkIds.has(fw.id)).length === 0
                ? <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>—</span>
                : allFrameworks.filter(fw => linkedFrameworkIds.has(fw.id)).map(fw => (
                  <span key={fw.id} className="mono" style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 4,
                    background: 'var(--accent-bg, var(--bg-sunken))',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--accent)', fontWeight: 600,
                  }}>
                    {fw.framework_code}
                  </span>
                ))}
            </div>
          )}
        </div>

        {embeddingError && (
          <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 12 }}>
            {embeddingError}
          </div>
        )}

        {showConfirmReEmbed && (
          <ConfirmModal
            title="Re-embed entry"
            message={<>This will update and replace the existing embedding for <strong>{item.name}</strong>. Continue?</>}
            confirmLabel="Re-embed"
            danger
            busy={false}
            onClose={() => setShowConfirmReEmbed(false)}
            onConfirm={handleConfirmReEmbed}
          />
        )}
      </div>
    </Drawer>
  )
}
