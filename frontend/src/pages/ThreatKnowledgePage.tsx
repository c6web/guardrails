import React from 'react'
import { Plus, Pencil, Trash2, Network, Zap, ShieldCheck } from '../components/ui/Icons'
import ActionCell from '../components/ui/ActionCell'
import { useAuth } from '../context/AuthContext'

import {
  getAllThreatKnowledge,
  deleteThreatKnowledge,
  embedThreatKnowledge,
  getThreatKnowledgeById,
  getThreatKnowledgeStats,
  approveThreatKnowledge,
  rejectThreatKnowledge,
  type ThreatKnowledge,
  type ThreatKnowledgeStats,
} from '../api/threatKnowledge'
import Chip from '../components/ui/Chip'
import { PageHeader, Breadcrumbs, StatCard, StatRow, EmptyState, ErrorState, DataTable, type ColumnDef } from '../components/ui'
import {
  getAllDetectionFrameworks,
  type DetectionFramework,
} from '../api/detectionFrameworks'
import type { TweakValues } from '../types'
import { Toast, ConfirmModal, TKFormModal } from './components/TKModals'
import { DetailDrawer, embStatus, embLabel, embColor, DEFAULT_DIM } from './components/TKDetailDrawer'
import { SemanticTestModal } from './components/TKSemanticModal'
import { EmbedAllProgressModal } from './components/TKEmbedAllModal'
import { ReviewProgressModal } from './components/ReviewProgressModal'
import { QualityStatsRow } from './components/QualityStatsRow'
import { Pagination } from './components/AIActivitiesShared'

interface ThreatKnowledgePageProps {
  tweaks: TweakValues
}

// ── Page ──────────────────────────────────────────────────────────────────────

const ThreatKnowledgePage: React.FC<ThreatKnowledgePageProps> = () => {
  const { isAdmin, isKnowledgeAdmin } = useAuth()
  const canManage = isAdmin || isKnowledgeAdmin
  const [items, setItems] = React.useState<ThreatKnowledge[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const [page, setPage] = React.useState(1)
  const [totalPages, setTotalPages] = React.useState(1)
  const [totalCount, setTotalCount] = React.useState(0)

  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<string>('')
  const [approveRejectBusy, setApproveRejectBusy] = React.useState<Record<string, boolean>>({})

  const [showCreate, setShowCreate] = React.useState(false)
  const [showSemanticTest, setShowSemanticTest] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<ThreatKnowledge | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<ThreatKnowledge | null>(null)
  const [detailItem, setDetailItem] = React.useState<ThreatKnowledge | null>(null)
  const [toast, setToast] = React.useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)

  const [showEmbedAllModal, setShowEmbedAllModal] = React.useState(false)
  const [showEmbedNewModal, setShowEmbedNewModal] = React.useState(false)
  const [showReviewModal, setShowReviewModal] = React.useState<'all' | 'new' | null>(null)
  const [singleReviewTarget, setSingleReviewTarget] = React.useState<{ id: string; name: string } | null>(null)
  const [reEmbedTarget, setReEmbedTarget] = React.useState<ThreatKnowledge | null>(null)
  const [reviewTarget, setReviewTarget] = React.useState<ThreatKnowledge | null>(null)

  const [embedStates, setEmbedStates] = React.useState<Record<string, { busy: boolean; error: string | null }>>({})

  const [stats, setStats] = React.useState<ThreatKnowledgeStats | null>(null)

  // Frameworks map: tkId → framework[]
  // All frameworks loaded once for the framework selector
  const [frameworkMap, setFrameworkMap] = React.useState<Record<string, DetectionFramework[]>>({})
  const [allFrameworks, setAllFrameworks] = React.useState<DetectionFramework[]>([])

  const loadRef = React.useRef(async (p: number) => {
    setLoading(true); setLoadError(null)
    try {
      const [{ data: tkData, meta }, frameworksRes, statsRes] = await Promise.all([
        getAllThreatKnowledge({ page: p, limit: 50, search: search || undefined, sort: 'name', order: 'asc', status: statusFilter || undefined }),
        getAllDetectionFrameworks(),
        getThreatKnowledgeStats(),
      ])
      setItems(tkData)
      setTotalCount(meta.total)
      setTotalPages(meta.totalPages)
      setPage(p)
      const frameworks = frameworksRes.data
      setAllFrameworks(frameworks)
      // Build tkId → framework[] map
      const map: Record<string, DetectionFramework[]> = {}
      for (const fw of frameworks) {
        for (const tk of fw.threatKnowledgeEntries || []) {
          if (!map[tk.id]) map[tk.id] = []
          map[tk.id].push(fw)
        }
      }
      setFrameworkMap(map)
      setStats(statsRes)
    } catch (err) {
      setLoadError((err as Error).message || 'Failed to load')
    } finally { setLoading(false) }
  })

  React.useEffect(() => { loadRef.current(1) }, [search, statusFilter])

  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  async function handleCreate() {
    await loadRef.current(1)
    setToast({ msg: 'Entry created', kind: 'ok' })
  }

  async function handleEdit() {
    setEditTarget(null)
    setDetailItem(null)
    await loadRef.current(page)
    setToast({ msg: 'Entry updated', kind: 'ok' })
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await deleteThreatKnowledge(deleteTarget.id)
      setDetailItem(null)
      setDeleteTarget(null)
      const nextPage = page > totalPages ? Math.max(1, totalPages - 1) : page
      await loadRef.current(nextPage)
      setToast({ msg: 'Entry deleted', kind: 'ok' })
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to delete', kind: 'err' })
    } finally { setBusy(false) }
  }

  function handleEmbedAll() {
    setShowEmbedAllModal(true)
  }

  function handleEmbedNew() {
    setShowEmbedNewModal(true)
  }

  function handleReviewItem(item: ThreatKnowledge) {
    setReviewTarget(item)
  }

  function handleConfirmReview() {
    if (!reviewTarget) return
    setSingleReviewTarget({ id: reviewTarget.id, name: reviewTarget.name })
    setReviewTarget(null)
  }

  async function handleSingleReviewDone() {
    setSingleReviewTarget(null)
    await loadRef.current(page)
  }

  async function handleEmbedAllDone() {
    setShowEmbedAllModal(false)
    setToast({ msg: 'Embedding complete', kind: 'ok' })
    await loadRef.current(page)
  }

  async function handleEmbedNewDone() {
    setShowEmbedNewModal(false)
    setToast({ msg: 'Embedding complete', kind: 'ok' })
    await loadRef.current(page)
  }

  async function handleEmbedItem(item: ThreatKnowledge) {
    const status = item.embedding_status || embStatus(item, stats?.activeDim ?? undefined)
    if (status === 'valid') {
      setReEmbedTarget(item)
      return
    }
    await doEmbedItem(item)
  }

  async function doEmbedItem(item: ThreatKnowledge) {
    const key = item.id
    setEmbedStates(prev => ({ ...prev, [key]: { busy: true, error: null } }))
    try {
      await embedThreatKnowledge(item.id)
      await loadRef.current(page)
      setEmbedStates(prev => ({ ...prev, [key]: { busy: false, error: null } }))
      setToast({ msg: `Embedded ${item.name}`, kind: 'ok' })
    } catch (err) {
      setEmbedStates(prev => ({ ...prev, [key]: { busy: false, error: (err as Error).message || 'Embedding failed' } }))
    }
  }

  async function handleConfirmReEmbed() {
    if (!reEmbedTarget) return
    setReEmbedTarget(null)
    await doEmbedItem(reEmbedTarget)
  }

  async function handleApprove(item: ThreatKnowledge) {
    setApproveRejectBusy(prev => ({ ...prev, [item.id]: true }))
    try {
      await approveThreatKnowledge(item.id)
await loadRef.current(page)
        setToast({ msg: `Approved: ${item.name}`, kind: 'ok' })
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Approve failed', kind: 'err' })
    } finally { setApproveRejectBusy(prev => ({ ...prev, [item.id]: false })) }
  }

  async function handleReject(item: ThreatKnowledge) {
    setApproveRejectBusy(prev => ({ ...prev, [item.id]: true }))
    try {
      await rejectThreatKnowledge(item.id)
      await loadRef.current(page)
        setToast({ msg: `Rejected: ${item.name}`, kind: 'ok' })
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Reject failed', kind: 'err' })
    } finally { setApproveRejectBusy(prev => ({ ...prev, [item.id]: false })) }
  }

  const columns: ColumnDef<ThreatKnowledge>[] = React.useMemo(() => {
    const cols: ColumnDef<ThreatKnowledge>[] = [
      {
        key: 'name',
        label: 'Name',
        render: (item) => (
          <span style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
            {item.name || '—'}
          </span>
        ),
      },
      {
        key: 'embedding',
        label: 'Embedding',
        width: 130,
        render: (item) => (
          <div className="row-tight" style={{ gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: embColor[embStatus(item, stats?.activeDim ?? undefined)], flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: embColor[embStatus(item, stats?.activeDim ?? undefined)] }}>
              {embLabel[embStatus(item, stats?.activeDim ?? undefined)]}
              {item.embedding && item.embedding.length > 0 && (
                <span>
                  {' '}—{' '}
                  <strong>{item.embedding.length}</strong>
                  {(item.embedding_status === 'dimension-mismatch' || embStatus(item, stats?.activeDim ?? undefined) === 'dimension-mismatch') && ` / expected ${stats?.activeDim ?? DEFAULT_DIM}`}
                </span>
              )}
            </span>
          </div>
        ),
      },
      {
        key: 'source',
        label: 'Source',
        width: 90,
        render: (item) => (
          <span onClick={e => e.stopPropagation()}>
            {item.source === 'agent' ? <Chip kind="info">Agent</Chip> : <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>—</span>}
          </span>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        width: 140,
        render: (item) => (
          <span onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {item.status === 'pending' && <Chip kind="warn">Pending review</Chip>}
              {item.status === 'rejected' && <Chip kind="err">Rejected</Chip>}
              {(!item.status || item.status === 'active') && item.source !== 'agent' && <Chip kind="ok">Active</Chip>}
              {(!item.status || item.status === 'active') && item.source === 'agent' && <Chip kind="ok">Active</Chip>}
            </div>
          </span>
        ),
      },
      {
        key: 'quality',
        label: 'Quality',
        width: 100,
        render: (item) => (
          item.quality_review_result ? (
            <span style={{
              fontSize: 11, fontWeight: 600, textTransform: 'capitalize',
              color: item.quality_review_result === 'good' ? 'var(--ok)' : item.quality_review_result === 'poison' ? 'var(--danger)' : 'var(--warn)',
            }}>
              {item.quality_review_result === 'poor_quality' ? 'poor' : item.quality_review_result}
            </span>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', fontStyle: 'italic' }}>Not reviewed</span>
          )
        ),
      },
      {
        key: 'frameworks',
        label: 'Frameworks',
        width: 200,
        render: (item) => (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {(frameworkMap[item.id] || []).length > 0 ? (
              (frameworkMap[item.id] || []).map(fw => (
                <span key={fw.id} className="mono" style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 4,
                  background: 'var(--accent-bg, var(--bg-sunken))',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--accent)', fontWeight: 600,
                }}>
                  {fw.framework_code}
                </span>
              ))
            ) : (
              <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', fontStyle: 'italic' }}>—</span>
            )}
          </div>
        ),
      },
      {
        key: 'lastUpdated',
        label: 'Last updated',
        width: 120,
        render: (item) => (
          <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>
            {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : '—'}
          </span>
        ),
      },
    ]

    if (canManage) {
      cols.push({
        key: 'action',
        label: 'Action',
        render: (item) => (
          <>
            <span onClick={e => e.stopPropagation()}>
              <div className="row-tight" style={{ gap: 2 }}>
                {item.status === 'pending' ? (
                  <>
                    <button key="btn-approve" className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--ok)', padding: '2px 8px' }}
                      disabled={approveRejectBusy[item.id]}
                      onClick={() => handleApprove(item)} title="Approve">
                      {approveRejectBusy[item.id] ? '…' : 'Approve'}
                    </button>
                    <button key="btn-reject" className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--danger)', padding: '2px 8px' }}
                      disabled={approveRejectBusy[item.id]}
                      onClick={() => handleReject(item)} title="Reject">
                      Reject
                    </button>
                  </>
                ) : (
                  <>
                    <button key="btn-embed" className="icon-btn" disabled={embedStates[item.id]?.busy || !item.threat_context?.trim()} onClick={() => handleEmbedItem(item)} title="Embed">
                      {embedStates[item.id]?.busy ? '…' : <Zap w={13} />}
                    </button>
                    <button key="btn-review" className="icon-btn" style={{ color: 'var(--accent)' }} onClick={() => handleReviewItem(item)} title="Quality Review"><ShieldCheck w={13} /></button>
                    <button key="btn-edit" className="icon-btn" title="Edit" onClick={() => setDetailItem(item)}><Pencil w={13} /></button>
                  </>
                )}
                <ActionCell actions={[
                  { icon: <Trash2 w={14} />, label: 'Delete', danger: true, onClick: () => setDeleteTarget(item) },
                ]} />
              </div>
            </span>
            {embedStates[item.id]?.error && (
              <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>{embedStates[item.id].error}</div>
            )}
          </>
        ),
      })
    }

    return cols
  }, [canManage, frameworkMap, stats, embedStates, approveRejectBusy])

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="threat-knowledge" />
      <PageHeader title="Threat knowledge" subtitle="Security threat definitions used by Tier 1 LLM threat lookup to match incoming prompts against known attack patterns. Browse OWASP LLM Top 10 reference entries, add custom threats with semantic embeddings, and search by similarity."
        actions={<>{canManage && <><button key="btn-embed-all" className="btn btn-ghost btn-sm" onClick={handleEmbedAll} disabled={totalCount === 0}>Embed All</button><button key="btn-embed-new" className="btn btn-ghost btn-sm" onClick={handleEmbedNew} disabled={totalCount === 0}>Embed New</button><button key="btn-review-all" className="btn btn-ghost btn-sm" onClick={() => setShowReviewModal('all')} style={{ color: 'var(--accent)' }}>Review All</button><button key="btn-review-new" className="btn btn-ghost btn-sm" onClick={() => setShowReviewModal('new')} style={{ color: 'var(--info)' }}>Review New Items</button></>}<button key="btn-semantic-test" className="btn btn-ghost btn-sm" onClick={() => setShowSemanticTest(true)}>Test Threat Knowledge</button>{canManage && <button key="btn-create" className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus w={13} /> New entry</button>}</>} />

      {/* Stat cards */}
      {!loading && totalCount > 0 && (
        <StatRow key="stat-row">
          <StatCard key="stat-entries" variant="compact" label="Entries" value={totalCount} accent="var(--accent)" />
          {stats && stats.total > 0 ? (
            <>
              <StatCard variant="compact" label="Embedded" value={stats.embedded} accent="var(--ok)" />
              <StatCard variant="compact" label="No embedding" value={stats.noEmbedding} accent="var(--fg-tertiary)" />
              <StatCard variant="compact" label="Coverage" value={`${stats.pct}%`} accent={stats.pct >= 50 ? 'var(--ok)' : 'var(--warning)'} />
              {(stats.pending ?? 0) > 0 && (
                <StatCard variant="compact" label="Pending review" value={stats.pending}
                  accent="var(--warning)" borderColor="var(--warning)"
                  onClick={() => setStatusFilter(statusFilter === 'pending' ? '' : 'pending')}
                />
              )}
            </>
          ) : null}
        </StatRow>
      )}

      <QualityStatsRow stats={stats} total={totalCount} />

      {stats && (stats.mismatch ?? 0) > 0 && (
        <div className="card" style={{ background: 'var(--bg-warning)', borderColor: 'var(--border-warning)', marginBottom: 12 }}>
          <div style={{ padding: '16px 20px' }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, color: 'var(--text-warning)' }}>
              Dimension mismatch — re-embed recommended
            </div>
            <div style={{ fontSize: 13, marginBottom: 12, color: 'var(--fg-secondary)' }}>
              {stats.mismatch} entries have vectors with a different dimension ({' '}
              {stats.activeDim ? (
                <>
                  expected <strong>{stats.activeDim}</strong>, but actual sizes vary.{' '}
                </>
              ) : (
                <>
                  actual sizes differ from the configured dimension.{' '}
                </>
              )}
              Visit Settings → Embedding to align the active dimension and re-embed all entries.
            </div>
          </div>
        </div>
      )}

      {/* Search + filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <input className="input" type="search" placeholder="Search name…"
          value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <select className="select" style={{ width: 160 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending review</option>
          <option value="rejected">Rejected</option>
        </select>
        <div style={{ flex: 1 }} />
        {!loading && <span className="caption">{totalCount.toLocaleString()} entries</span>}
      </div>

      {loadError ? (
        <ErrorState title="Failed to load entries" message={loadError} onRetry={() => loadRef.current(page)} />
      ) : (
        <DataTable<ThreatKnowledge>
          columns={columns}
          data={items}
          rowKey={item => item.id}
          onRowClick={item => setDetailItem(item)}
          loading={loading}
          emptyState={
            <EmptyState
              icon={<Network w={28} />}
              title={search ? 'No entries match this search.' : 'No threat knowledge entries yet.'}
              action={!search && canManage ? (
                <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
                  <Plus w={12} /> Create first entry
                </button>
              ) : undefined}
            />
          }
        >
          {!loading && items.length > 0 && <Pagination page={page} totalPages={totalPages} onPage={p => loadRef.current(p)} />}
        </DataTable>
      )}

      {/* Create modal */}
      {showCreate && (
        <TKFormModal
          initialData={null}
          onClose={() => setShowCreate(false)}
          onSave={handleCreate}
        />
      )}

      {/* Edit / detail */}
      {editTarget && (
        <TKFormModal
          key={editTarget.id}
          initialData={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleEdit}
        />
      )}
      {detailItem && !editTarget && (
        <DetailDrawer
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onEdit={canManage ? () => { setEditTarget(detailItem); setDetailItem(null) } : undefined}
          onDelete={canManage ? () => { setDeleteTarget(detailItem); setDetailItem(null) } : undefined}
          onRefresh={async () => {
            await loadRef.current(page)
            const updated = await getThreatKnowledgeById(detailItem.id)
            setDetailItem(updated)
          }}
          allFrameworks={allFrameworks}
          linkedFrameworkIds={new Set((frameworkMap[detailItem.id] || []).map(fw => fw.id))}
        />
      )}

      {/* Confirm delete */}
      {deleteTarget && (
        <ConfirmModal
          title="Delete entry"
          message={<>Permanently delete <strong>{deleteTarget.name}</strong>? This cannot be undone.</>}
          confirmLabel="Delete entry"
          danger
          busy={busy}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}

      {/* Semantic test modal */}
      {showSemanticTest && (
        <SemanticTestModal onClose={() => setShowSemanticTest(false)} />
      )}

      {/* Embed all progress modal */}
      {showEmbedAllModal && (
        <EmbedAllProgressModal mode="all" onClose={() => setShowEmbedAllModal(false)} onComplete={handleEmbedAllDone} />
      )}

      {/* Embed new progress modal */}
      {showEmbedNewModal && (
        <EmbedAllProgressModal mode="new" onClose={() => setShowEmbedNewModal(false)} onComplete={handleEmbedNewDone} />
      )}

      {/* Review all progress modal */}
      {(showReviewModal === 'all' || showReviewModal === 'new') && (
        <ReviewProgressModal resourceType="threat-knowledge" newOnly={showReviewModal === 'new'} onClose={() => { setShowReviewModal(null); loadRef.current(page) }} />
      )}

      {/* Single review modal */}
      {singleReviewTarget && (
        <ReviewProgressModal resourceType="threat-knowledge" targetId={singleReviewTarget.id} targetName={singleReviewTarget.name} onClose={handleSingleReviewDone} />
      )}

      {/* Review confirm modal */}
      {reviewTarget && (
        <ConfirmModal
          title="Review quality"
          message={<>Run AI quality review on <strong>{reviewTarget.name}</strong>? This will analyze the entry using the configured Data Review Provider.</>}
          confirmLabel="Review"
          busy={false}
          onClose={() => setReviewTarget(null)}
          onConfirm={handleConfirmReview}
        />
      )}

      {/* Re-embed confirm modal */}
      {reEmbedTarget && (
        <ConfirmModal
          title="Re-embed entry"
          message={<>This will update and replace the existing embedding for <strong>{reEmbedTarget.name}</strong>. Continue?</>}
          confirmLabel="Re-embed"
          danger
          busy={false}
          onClose={() => setReEmbedTarget(null)}
          onConfirm={handleConfirmReEmbed}
        />
      )}

      {toast && <Toast {...toast} />}
    </div>
  )
}

export default ThreatKnowledgePage
