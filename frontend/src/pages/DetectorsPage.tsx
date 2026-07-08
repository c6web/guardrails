import React from 'react'
import { Chip } from '../components/ui'
import ActionCell from '../components/ui/ActionCell'
import { Filter, Plus, Pencil, Trash2, ShieldCheck } from '../components/ui/Icons'
import {
  getDetectors,
  getFrameworks,
  deleteDetector,
  getDetectorQualityStats,
} from '../api/detectors'
import type { UIDetector, QualityStats } from '../api/detectors'
import type { TweakValues } from '../types'
import type { ColumnDef } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { PageHeader, Breadcrumbs, StatCard, StatRow, EmptyState, ErrorState, DataTable } from '../components/ui'
import { Toast } from './components/DetectorsShared'
import { ReviewProgressModal } from './components/ReviewProgressModal'
import { TestDetectorsModal, ConfirmModal, CreateModal } from './components/DetectorsModals'
import { DetailDrawer, ReadOnlyDetailDrawer } from './components/DetectorsDrawers'
import { Pagination } from './components/AIActivitiesShared'
import { QualityStatsRow } from './components/QualityStatsRow'

interface DetectorsPageProps { tweaks: TweakValues }

const DetectorsPage: React.FC<DetectorsPageProps> = () => {
  const { isAdmin, isKnowledgeAdmin } = useAuth()
  const canManage = isAdmin || isKnowledgeAdmin

  const [detectors, setDetectors] = React.useState<UIDetector[]>([])
  const [frameworks, setFrameworks] = React.useState<Record<string, any>>({})
  const [loading,    setLoading]     = React.useState(true)
  const [loadError,  setLoadError]   = React.useState<string | null>(null)
  const [busy,       setBusy]        = React.useState(false)

  const [page,       setPage]        = React.useState(1)
  const [totalPages, setTotalPages]  = React.useState(1)
  const [totalCount, setTotalCount]  = React.useState(0)

  const [search, setSearch] = React.useState('')

  const [qualityStats, setQualityStats] = React.useState<QualityStats | null>(null)

  const [showCreate,       setShowCreate]    = React.useState(false)
  const [showTest,         setShowTest]      = React.useState(false)
  const [showReviewModal,  setShowReviewModal] = React.useState<'all' | 'new' | null>(null)
  const [singleReviewTarget, setSingleReviewTarget] = React.useState<{ id: string; name: string } | null>(null)
  const [detailTarget,    setDetailTarget]  = React.useState<UIDetector | null>(null)
  const [deleteTarget,    setDeleteTarget]  = React.useState<UIDetector | null>(null)
  const [reviewTarget,    setReviewTarget]  = React.useState<UIDetector | null>(null)
  const [toast,           setToast]         = React.useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)

  const load = React.useCallback(async (p = 1) => {
    setLoading(true); setLoadError(null)
    try {
      const [dets, fws, qs] = await Promise.all([
        getDetectors({ page: p, limit: 50, search, sort: 'name', order: 'asc' }),
        getFrameworks(),
        getDetectorQualityStats().catch(() => null),
      ])
      setQualityStats(qs)
      setDetectors(dets.data)
      setTotalCount(dets.meta.total)
      setTotalPages(dets.meta.totalPages)
      setPage(p)
      const fwMap: Record<string, any> = {}
      for (const fw of fws) fwMap[fw.id] = fw
      setFrameworks(fwMap)
    } catch (err) {
      setLoadError((err as Error).message || 'Failed to load')
    } finally { setLoading(false) }
  }, [search])

  React.useEffect(() => { load(1) }, [load])

  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

   async function handleCreate() {
    setShowCreate(false)
    await load(1)
    setToast({ msg: 'Detector created', kind: 'ok' })
  }

  function handleSaved(updated: UIDetector) {
    setDetectors(ds => ds.map(d => d.id === updated.id ? updated : d))
    if (detailTarget?.id === updated.id) setDetailTarget(updated)
    setToast({ msg: `${updated.name} saved`, kind: 'ok' })
  }

  async function handleDelete(det: UIDetector) {
    setDeleteTarget(null)
    setDetailTarget(null)
    setBusy(true)
    try {
      await deleteDetector(det.id)
      const nextPage = page > totalPages ? Math.max(1, totalPages - 1) : page
      await load(nextPage)
      setToast({ msg: `${det.name} deleted`, kind: 'ok' })
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Delete failed', kind: 'err' })
    } finally { setBusy(false) }
  }

  function handleConfirmReview() {
    if (!reviewTarget) return
    setSingleReviewTarget({ id: reviewTarget.id, name: reviewTarget.name })
    setReviewTarget(null)
  }

  async function handleSingleReviewDone() {
    setSingleReviewTarget(null)
    await load(page)
  }

  const columns: ColumnDef<UIDetector>[] = [
    {
      key: 'name',
      label: 'Name',
      render: (d) => <span style={{ fontWeight: 500, fontSize: 13 }}>{d.name}</span>,
    },
    {
      key: 'type',
      label: 'Type',
      render: (d) => (
        <Chip kind={d.ruleType === 'regex' ? 'info' : 'muted'} mono>{d.ruleType}</Chip>
      ),
    },
    {
      key: 'scope',
      label: 'Scope',
      render: (d) => (
        <Chip kind={d.scanningScope === 'output' ? 'warn' : d.scanningScope === 'both' ? 'ok' : 'muted'} mono>
          {d.scanningScope}
        </Chip>
      ),
    },
    {
      key: 'mode',
      label: 'Mode',
      render: (d) => (
        <Chip kind={d.mode === 'block' ? 'err' : d.mode === 'redact' ? 'warn' : d.mode === 'flag' ? 'info' : 'muted'} mono>
          {d.mode || 'block'}
        </Chip>
      ),
    },
    {
      key: 'description',
      label: 'Description',
      render: (d) => (
        <span style={{
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden', fontSize: 12, maxWidth: 240,
        }}>
          {d.description}
        </span>
      ),
    },
    {
      key: 'frameworks',
      label: 'Frameworks',
      render: (d) => (
        d.frameworkIds.length === 0
          ? <span style={{ color: 'var(--fg-tertiary)', fontStyle: 'italic' }}>—</span>
          : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {d.frameworkIds.slice(0, 2).map(fid => (
                <span key={fid} className="mono" style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 4,
                  background: 'var(--accent-bg, var(--bg-sunken))',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--accent)', fontWeight: 600,
                }}>
                  {frameworks[fid]?.framework_code || fid}
                </span>
              ))}
              {d.frameworkIds.length > 2 && (
                <span style={{ fontSize: 10, color: 'var(--fg-tertiary)' }}>+{d.frameworkIds.length - 2}</span>
              )}
            </div>
          )
      ),
    },
    {
      key: 'quality',
      label: 'Quality',
      width: 80,
      render: (d) => (
        d.quality_review_result ? (
          <span style={{
            fontSize: 11, fontWeight: 600, textTransform: 'capitalize',
            color: d.quality_review_result === 'good' ? 'var(--ok)' : d.quality_review_result === 'poison' ? 'var(--danger)' : 'var(--warn)',
          }}>
            {d.quality_review_result === 'poor_quality' ? 'poor' : d.quality_review_result}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', fontStyle: 'italic' }}>—</span>
        )
      ),
    },
    ...(canManage
      ? [{
          key: 'action',
          label: 'Action',
          render: (d: UIDetector) => (
            <div onClick={e => e.stopPropagation()} className="row-tight" style={{ gap: 2 }}>
              <button className="icon-btn" style={{ color: 'var(--accent)' }} onClick={() => setReviewTarget(d)} title="Quality Review">
                <ShieldCheck w={13} />
              </button>
              <ActionCell actions={[
                { icon: <Pencil w={13} />, label: 'Edit', onClick: () => setDetailTarget(d) },
                { icon: <Trash2 w={14} />, label: 'Delete', danger: true, onClick: () => setDeleteTarget(d) },
              ]} />
            </div>
          ),
        }]
      : []),
  ]

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="detectors" />
      <PageHeader title="Detectors" subtitle="Enable, disable, and tune detection plugins from OWASP and classification frameworks that scan prompts and responses for AI threats. Assign detectors to gateways to control which scanning rules are active."
        actions={canManage && <><button className="btn btn-ghost btn-sm" onClick={() => setShowTest(true)}><Filter w={13} /> Test all</button><button className="btn btn-ghost btn-sm" onClick={() => setShowReviewModal('all')} style={{ color: 'var(--accent)' }}>Review All</button><button className="btn btn-ghost btn-sm" onClick={() => setShowReviewModal('new')} style={{ color: 'var(--info)' }}>Review New Items</button><button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus w={13} /> New detector</button></>} />

      {/* Stat cards */}
      <StatRow>
        <StatCard variant="compact" label="Total detectors" value={totalCount} accent="var(--accent)" />
      </StatRow>

      <QualityStatsRow stats={qualityStats} total={totalCount} />

      {/* Filter bar */}
       <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <input className="input" type="search" placeholder="Search name, description…"
          value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        <div style={{ flex: 1 }} />
        {!loading && <span className="caption">{totalCount.toLocaleString()} detectors</span>}
       </div>

       {/* Table */}
       {loadError ? (
        <ErrorState title="Failed to load detectors" message={loadError} onRetry={() => load(page)} />
      ) : (
        <DataTable
          columns={columns}
          data={detectors}
          rowKey={(d) => d.id}
          onRowClick={(d) => setDetailTarget(d)}
          loading={loading}
          emptyState={
            <EmptyState
              icon={<Filter w={28} />}
              title={search ? 'No detectors match this search.' : 'No detectors yet.'}
              action={!search && canManage ? (
                <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
                  <Plus w={12} /> Create first detector
                </button>
              ) : undefined}
            />
          }
        >
          <Pagination page={page} totalPages={totalPages} onPage={p => load(p)} />
        </DataTable>
      )}

      {/* Batch test modal */}
      {showTest && (
        <TestDetectorsModal
          onClose={() => setShowTest(false)}
        />
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onSave={handleCreate}
          frameworks={frameworks}
        />
      )}

      {/* Detail drawer */}
      {detailTarget && (
        canManage ? (
          <DetailDrawer
            detector={detailTarget}
            onClose={() => setDetailTarget(null)}
            onSaved={handleSaved}
            onDelete={() => setDeleteTarget(detailTarget)}
            frameworks={frameworks}
          />
        ) : (
          <ReadOnlyDetailDrawer
            detector={detailTarget}
            onClose={() => setDetailTarget(null)}
            frameworks={frameworks}
          />
        )
      )}

      {/* Review confirm modal */}
      {reviewTarget && (
        <ConfirmModal
          title="Review quality"
          message={<>Run AI quality review on <strong>{reviewTarget.name}</strong>? This will analyze the detector using the configured Data Review Provider.</>}
          confirmLabel="Review"
          busy={false}
          onClose={() => setReviewTarget(null)}
          onConfirm={handleConfirmReview}
        />
      )}

      {/* Review all progress modal */}
      {(showReviewModal === 'all' || showReviewModal === 'new') && (
        <ReviewProgressModal resourceType="detectors" newOnly={showReviewModal === 'new'} onClose={() => { setShowReviewModal(null); load(page) }} />
      )}

      {/* Single review modal */}
      {singleReviewTarget && (
        <ReviewProgressModal resourceType="detectors" targetId={singleReviewTarget.id} targetName={singleReviewTarget.name} onClose={handleSingleReviewDone} />
      )}

      {/* Confirm delete modal */}
      {deleteTarget && (
        <ConfirmModal
          title="Delete detector"
          message={<>Permanently delete <strong>{deleteTarget.name}</strong>? This cannot be undone.</>}
          confirmLabel="Delete detector"
          danger
          busy={busy}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget)}
        />
      )}

      {toast && <Toast {...toast} />}
    </div>
  )
}

export default DetectorsPage
