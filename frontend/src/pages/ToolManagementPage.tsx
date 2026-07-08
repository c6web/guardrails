import React, { useState, useCallback, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getTools, deleteTool, getToolAudit, getToolQualityStats } from '../api/tools'
import type { ToolGuardrailItem, ToolAuditRow, ToolQualityStats } from '../api/tools'
import type { TweakValues } from '../types'
import type { ColumnDef } from '../components/ui/DataTable'
import { DataTable } from '../components/ui/DataTable'
import { Toast } from './components/DetectorsShared'
import { Pagination } from './components/AIActivitiesShared'
import { ReviewProgressModal } from './components/ReviewProgressModal'
import { Plus, Pencil, Trash2, Network, ShieldCheck } from '../components/ui/Icons'
import ActionCell from '../components/ui/ActionCell'
import { PageHeader, Breadcrumbs, Chip, StatCard, StatRow, EmptyState, ErrorState } from '../components/ui'
import { ToolDetailDrawer } from './components/ToolDetailDrawer'
import { ToolFormModal, ConfirmModal } from './components/ToolModals'
import { QualityStatsRow } from './components/QualityStatsRow'

interface ToolManagementPageProps { tweaks: TweakValues }

// ── Page ──────────────────────────────────────────────────────────────────────

const ToolManagementPage: React.FC<ToolManagementPageProps> = () => {
  const { isAdmin, isKnowledgeAdmin } = useAuth()
  const canManage = isAdmin || isKnowledgeAdmin

  const [tools, setTools] = useState<ToolGuardrailItem[]>([])
  const [auditRows, setAuditRows] = useState<ToolAuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [auditPage, setAuditPage] = useState(1)
  const [auditTotalPages, setAuditTotalPages] = useState(1)
  const [auditTotalCount, setAuditTotalCount] = useState(0)

  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  const [search, setSearch] = useState('')

  const [qualityStats, setQualityStats] = useState<ToolQualityStats | null>(null)

  const [activeTab, setActiveTab] = useState<'tools' | 'audit'>('tools')
  const [showCreate, setShowCreate] = useState(false)
  const [showReviewModal, setShowReviewModal] = useState<'all' | 'new' | null>(null)
  const [singleReviewTarget, setSingleReviewTarget] = useState<{ id: string; name: string } | null>(null)
  const [editTarget, setEditTarget] = useState<ToolGuardrailItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ToolGuardrailItem | null>(null)
  const [reviewTarget, setReviewTarget] = useState<ToolGuardrailItem | null>(null)
  const [detailItem, setDetailItem] = useState<ToolGuardrailItem | null>(null)
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)

  const loadAll = useCallback(async (p = 1) => {
    setLoading(true); setLoadError(null)
    try {
      const [toolsRes, qs] = await Promise.all([
        getTools({ page: p, limit: 50, search: search || undefined }),
        getToolQualityStats().catch(() => null),
      ])
      setQualityStats(qs)
      setTools(toolsRes.data)
      setTotalCount(toolsRes.meta.total)
      setTotalPages(toolsRes.meta.totalPages)
      setPage(p)
    } catch (err) {
      setLoadError((err as Error).message || 'Failed to load')
    } finally { setLoading(false) }
  }, [search])

  const loadAudit = useCallback(async () => {
    try {
      const res = await getToolAudit({ page: auditPage, limit: 50 })
      setAuditRows(res.data)
      setAuditTotalCount(res.meta.total)
      setAuditTotalPages(res.meta.totalPages)
    } catch { /* non-fatal */ }
  }, [auditPage])

  useEffect(() => { loadAll() }, [loadAll])
  useEffect(() => { if (activeTab === 'audit') loadAudit() }, [activeTab, loadAudit])

  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  async function handleDelete() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await deleteTool(deleteTarget.id)
      setDeleteTarget(null)
      loadAll()
      setToast({ msg: 'Tool guardrail deleted', kind: 'ok' })
    } catch (err) {
      setToast({ msg: ((err as Error).message || 'Failed to delete'), kind: 'err' })
    } finally { setBusy(false) }
  }

  function handleConfirmReview() {
    if (!reviewTarget) return
    setSingleReviewTarget({ id: reviewTarget.id, name: reviewTarget.tool_name })
    setReviewTarget(null)
  }

  async function handleSingleReviewDone() {
    setSingleReviewTarget(null)
    loadAll()
  }

  const toolColumns: ColumnDef<ToolGuardrailItem>[] = [
    { key: 'tool_name', label: 'Name', render: (t) => <span className="mono">{t.tool_name}</span> },
    {
      key: 'description',
      label: 'Description',
      render: (t) => (
        <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 12, maxWidth: 400 }}>
          {t.description || '—'}
        </span>
      ),
    },
    { key: 'status', label: 'Status', render: (t) => <Chip kind={t.active ? 'ok' : 'muted'} mono>{t.active ? 'active' : 'inactive'}</Chip> },
    {
      key: 'quality',
      label: 'Quality',
      width: 70,
      render: (t) =>
        t.quality_review_result ? (
          <span style={{
            fontSize: 11, fontWeight: 600, textTransform: 'capitalize',
            color: t.quality_review_result === 'good' ? 'var(--ok)' : t.quality_review_result === 'poison' ? 'var(--danger)' : 'var(--warn)',
          }}>
            {t.quality_review_result === 'poor_quality' ? 'poor' : t.quality_review_result}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', fontStyle: 'italic' }}>—</span>
        ),
    },
    ...(canManage
      ? [{
          key: 'actions',
          label: 'Actions',
          width: 130,
          render: (t: ToolGuardrailItem) => (
            <div className="row-tight" style={{ gap: 2 }} onClick={e => e.stopPropagation()}>
              <button className="icon-btn" style={{ color: 'var(--accent)' }} onClick={() => setReviewTarget(t)} title="Quality Review"><ShieldCheck w={13} /></button>
              <ActionCell actions={[
                { icon: <Pencil w={13} />, label: 'Edit', onClick: () => setEditTarget(t) },
                { icon: <Trash2 w={14} />, label: 'Delete', danger: true, onClick: () => setDeleteTarget(t) },
              ]} />
            </div>
          ),
        } as ColumnDef<ToolGuardrailItem>]
      : []),
  ]

  const auditColumns: ColumnDef<ToolAuditRow>[] = [
    { key: 'created_at', label: 'Date', render: (r) => <span className="mono">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</span> },
    { key: 'tool_name', label: 'Tool', render: (r) => <span className="mono">{r.tool_name}</span> },
    { key: 'app_id', label: 'App ID', render: (r) => <span className="mono">{r.app_id.slice(0, 8)}</span> },
    { key: 'invocation_count', label: 'Invocations', align: 'right' },
    { key: 'violation_flag', label: 'Violation', render: (r) => <Chip kind={r.violation_flag ? 'err' : 'ok'} mono>{r.violation_flag ? 'blocked' : 'allowed'}</Chip> },
  ]

  return (
    <div className="page fade-in">
  

      <Breadcrumbs pageId="tools" />
      <PageHeader title="Tool guardrails" subtitle="Centralized library of tools that can be selectively blocked per app. Apps with no selection allow all tools."
        actions={canManage && activeTab === 'tools' && <><button className="btn btn-ghost btn-sm" onClick={() => setShowReviewModal('all')} style={{ color: 'var(--accent)' }}>Review All</button><button className="btn btn-ghost btn-sm" onClick={() => setShowReviewModal('new')} style={{ color: 'var(--info)' }}>Review New Items</button><button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus w={13} /> New tool</button></>} />

      {/* Stat cards */}
      {!loading && totalCount > 0 && (
        <StatRow>
          <StatCard variant="compact" label="Tools" value={totalCount} accent="var(--accent)" />
        </StatRow>
      )}

      {!loading && <QualityStatsRow stats={qualityStats} total={totalCount} />}

      {/* Tabs */}
      <div className="tabs" style={{ padding: "0 18px", marginBottom: 16 }}>
        {(['tools', 'audit'] as const).map(t => (
          <div key={t} className={`tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
            {t === 'tools' ? 'Tool Library' : 'Audit Log'}
          </div>
        ))}
      </div>

      {/* Tools tab */}
      {activeTab === 'tools' && (
        <>
          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <input className="input" type="search" placeholder="Search tool name…"
              value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
            <div style={{ flex: 1 }} />
            {!loading && <span className="caption">{totalCount.toLocaleString()} tools</span>}
          </div>

          {loadError ? (
            <ErrorState title="Failed to load tools" message={loadError} onRetry={() => loadAll(page)} />
          ) : (
            <DataTable<ToolGuardrailItem>
              columns={toolColumns}
              data={tools}
              rowKey={(t) => t.id}
              onRowClick={(t) => setDetailItem(t)}
              loading={loading}
              emptyState={
                <EmptyState
                  icon={<Network w={28} />}
                  title={search ? 'No tools match this search.' : 'No tool guardrails defined yet.'}
                  action={!search && canManage ? (
                    <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
                      <Plus w={12} /> Create first tool
                    </button>
                  ) : undefined}
                />
              }
            >
              <Pagination page={page} totalPages={totalPages} onPage={p => loadAll(p)} />
            </DataTable>
          )}
        </>
      )}

      {/* Audit tab */}
      {activeTab === 'audit' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <div style={{ flex: 1 }} />
            {!loading && <span className="caption">{auditTotalCount.toLocaleString()} entries</span>}
          </div>

          <DataTable<ToolAuditRow>
            columns={auditColumns}
            data={auditRows}
            rowKey={(r) => r.id}
            emptyState={
              <EmptyState
                icon={<Network w={28} />}
                title="No audit entries yet."
              />
            }
          >
            {auditTotalPages > 1 && (
              <Pagination page={auditPage} totalPages={auditTotalPages} onPage={p => setAuditPage(p)} />
            )}
          </DataTable>
        </>
      )}

      {/* Create modal */}
      {showCreate && (
        <ToolFormModal key={Math.random()} initialData={null} onClose={() => setShowCreate(false)} onSave={() => { loadAll(); setToast({ msg: 'Tool guardrail created', kind: 'ok' }) }} />
      )}

      {/* Edit modal */}
      {editTarget && (
        <ToolFormModal key={editTarget.id} initialData={editTarget} onClose={() => setEditTarget(null)} onSave={() => { loadAll(); setToast({ msg: 'Tool guardrail updated', kind: 'ok' }) }} />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmModal title="Delete tool guardrail" message={<>Permanently delete <strong>{deleteTarget.tool_name}</strong>? This cannot be undone.</>} confirmLabel="Delete" danger busy={busy} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} />
      )}

      {/* Review confirm modal */}
      {reviewTarget && (
        <ConfirmModal
          title="Review quality"
          message={<>Run AI quality review on <strong>{reviewTarget.tool_name}</strong>? This will analyze the tool guardrail using the configured Data Review Provider.</>}
          confirmLabel="Review"
          busy={false}
          onClose={() => setReviewTarget(null)}
          onConfirm={handleConfirmReview}
        />
      )}

      {/* Review all progress modal */}
      {(showReviewModal === 'all' || showReviewModal === 'new') && (
        <ReviewProgressModal resourceType="tools" newOnly={showReviewModal === 'new'} onClose={() => { setShowReviewModal(null); loadAll() }} />
      )}

      {/* Single review modal */}
      {singleReviewTarget && (
        <ReviewProgressModal resourceType="tools" targetId={singleReviewTarget.id} targetName={singleReviewTarget.name} onClose={handleSingleReviewDone} />
      )}

      {/* Detail drawer */}
      {detailItem && (
        <ToolDetailDrawer
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onEdit={canManage ? () => { setEditTarget(detailItem); setDetailItem(null) } : undefined}
          onDelete={canManage ? () => { setDeleteTarget(detailItem); setDetailItem(null) } : undefined}
        />
      )}

      {toast && <Toast {...toast} />}
    </div>
  )
}

export default ToolManagementPage
