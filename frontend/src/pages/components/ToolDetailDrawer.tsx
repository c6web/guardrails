import React from 'react'
import { Network } from '../../components/ui/Icons'
import { Chip, Drawer, KV, LoadingState } from '../../components/ui'
import { getToolAudit } from '../../api/tools'
import type { ToolAuditRow } from '../../api/tools'

// ── Detail drawer ─────────────────────────────────────────────────────────────

export function ToolDetailDrawer({ item, open, onClose, onEdit, onDelete }: {
  item: { id: string; tool_name: string; description?: string | null; active: boolean; quality_review_result?: string | null; quality_review_reason?: string | null; quality_reviewed_at?: string | null; created_at?: string; updated_at?: string }
  open?: boolean
  onClose: () => void
  onEdit?: () => void
  onDelete?: () => void
}) {
  const [auditRows, setAuditRows] = React.useState<ToolAuditRow[]>([])
  const [auditLoading, setAuditLoading] = React.useState(true)

  React.useEffect(() => {
    getToolAudit({ tool_name: item.tool_name }).then(res => { setAuditRows(res.data); setAuditLoading(false) })
      .catch(() => { setAuditLoading(false) })
  }, [item.tool_name])

  return (
    <Drawer
      open={open}
      icon={<Network w={14} style={{ color: 'var(--accent)' }} />}
      title={item.tool_name}
      subtitle="Guardrail tool"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Back</button>
          {onDelete && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={onDelete}>Remove</button>}
          <div style={{ flex: 1 }} />
          {onEdit && <button className="btn btn-primary" onClick={onEdit}>Edit</button>}
        </>
      }
    >
      <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
        <KV rows={[
          { label: 'Description', value: <span style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{item.description || <span className="caption">—</span>}</span>, mono: true },
          { label: 'Status', value: <Chip kind={item.active ? 'ok' : 'muted'}>{item.active ? 'active' : 'inactive'}</Chip> },
          item.created_at && { label: 'Created', value: <span style={{ fontSize: 12 }}>{new Date(item.created_at).toLocaleString()}</span>, mono: true },
          item.updated_at && { label: 'Updated', value: <span style={{ fontSize: 12 }}>{new Date(item.updated_at).toLocaleString()}</span>, mono: true },
          item.quality_review_result && { label: 'Quality', value: (
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'capitalize',
              color: item.quality_review_result === 'good' ? 'var(--ok)' : item.quality_review_result === 'poison' ? 'var(--danger)' : 'var(--warn)' }}>
              {item.quality_review_result === 'poor_quality' ? 'poor' : item.quality_review_result}
            </span>
          ) },
          item.quality_review_result && item.quality_review_reason && { label: 'Review Reason', value: <span style={{ fontSize: 12, color: 'var(--fg-secondary)', lineHeight: 1.5 }}>{item.quality_review_reason}</span> },
          item.quality_review_result && item.quality_reviewed_at && { label: 'Reviewed At', value: <span style={{ fontSize: 12 }}>{new Date(item.quality_reviewed_at).toLocaleString()}</span>, mono: true },
        ]} />

        {/* Audit log section */}
        <div style={{ marginTop: 20 }}>
          <label className="label" style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
            Recent Activity
          </label>
          {auditLoading ? (
            <LoadingState message="Loading audit log…" size="sm" />
          ) : auditRows.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', textAlign: 'center', padding: 16 }}>No activity recorded for this tool.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {auditRows.slice(0, 20).map(row => (
                <div key={row.id} style={{
                  padding: '8px 12px', borderRadius: 6,
                  background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
                  fontSize: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span className="mono" style={{ flex: 1 }}>{row.app_id.slice(0, 8)}</span>
                    <Chip kind={row.violation_flag ? 'err' : 'ok'} mono>{row.violation_flag ? 'blocked' : 'allowed'}</Chip>
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--fg-tertiary)' }}>
                    <span>{row.created_at ? new Date(row.created_at).toLocaleString() : ''}</span>
                    <span>{row.invocation_count} invocations</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Drawer>
  )
}
