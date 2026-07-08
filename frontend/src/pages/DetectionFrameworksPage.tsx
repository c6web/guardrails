import { useEffect, useState, useMemo, useRef } from 'react'
import { Plus } from '../components/ui/Icons'
import { useAuth } from '../context/AuthContext'
import { deleteDetectionFramework, getAllDetectionFrameworks, type DetectionFramework } from '../api/detectionFrameworks'
import { FrameworkFormModal, KnowledgeMappingModal, DetectorMappingModal } from './components/DFModals'
import { ConfirmModal } from '../components/ui'
import { FrameworkDetailDrawer } from './components/DFDetailDrawer'
import { PageHeader, Breadcrumbs, StatCard, StatRow, LoadingState, Toast, useToast } from '../components/ui'
import { FrameworkCard } from './components/DFCard'
import { riskLabel } from './components/DFCard'
import type { TweakValues } from '../types'
import { Pagination } from './components/AIActivitiesShared'

interface DetectionFrameworksPageProps {
  tweaks: TweakValues
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DetectionFrameworksPage(_props: DetectionFrameworksPageProps) {
  const { isAdmin, isKnowledgeAdmin } = useAuth()
  const canManage = isAdmin || isKnowledgeAdmin

  const [frameworks, setFrameworks] = useState<DetectionFramework[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all')
  const { toast, show: showToast } = useToast()

  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // Modal state
  const [showCreate, setShowCreate] = useState(false)
  const [detailTarget, setDetailTarget] = useState<DetectionFramework | null>(null)
  const [editTarget, setEditTarget] = useState<DetectionFramework | null>(null)
  const [knowledgeMappingTarget, setKnowledgeMappingTarget] = useState<DetectionFramework | null>(null)
  const [detectorMappingTarget, setDetectorMappingTarget] = useState<DetectionFramework | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DetectionFramework | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const loadRef = useRef(async (p: number) => {
    setLoading(true)
    try {
      const res = await getAllDetectionFrameworks({ page: p, limit: 50 })
      setFrameworks(res.data)
      setTotalCount(res.meta.total)
      setTotalPages(res.meta.totalPages)
      setPage(p)
    } finally {
      setLoading(false)
    }
  })

  useEffect(() => { loadRef.current(1) }, [])

  const filtered = useMemo(() => {
    if (filter === 'all') return frameworks
    return frameworks.filter(fw => riskLabel(fw.id).toLowerCase() === filter)
  }, [frameworks, filter])

  const total = frameworks.length
  const tkTotal = frameworks.reduce((sum, fw) => sum + (fw.threatKnowledgeEntries?.length ?? 0), 0)

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteBusy(true)
    try {
      await deleteDetectionFramework(deleteTarget.id)
      setDeleteTarget(null)
      const nextPage = page > totalPages ? Math.max(1, totalPages - 1) : page
      await loadRef.current(nextPage)
      showToast('Framework deleted')
    } catch (err) {
      showToast((err as Error).message || 'Failed to delete', 'err')
    } finally { setDeleteBusy(false) }
  }

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="detection-frameworks" />
      <PageHeader title="Detection frameworks" subtitle="Informational groupings for Threat Knowledge entries"
        actions={canManage && <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus w={13} /> New Framework</button>} />

      {/* Stat cards */}
       {!loading && totalCount > 0 && (
         <StatRow>
            <StatCard variant="compact" label="Frameworks" value={totalCount} accent="var(--accent)" />
            <StatCard variant="compact" label="Threat Knowledge" value={tkTotal} accent="var(--accent)" />
         </StatRow>
       )}

       {/* Filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {(['all', 'high', 'medium', 'low'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`filter-btn${filter === f ? ' active' : ''}`}
            style={{
              padding: '4px 12px', borderRadius: 4, fontSize: 12, fontWeight: 600,
              border: '1px solid var(--border-subtle)',
              background: filter === f ? 'var(--ink-0)' : 'transparent',
              color: filter === f ? 'var(--paper-0)' : 'var(--fg-secondary)',
              cursor: 'pointer', textTransform: 'capitalize',
            }}
          >
            {f === 'all'
              ? `All (${total})`
              : `${f.charAt(0).toUpperCase() + f.slice(1)} (${frameworks.filter(fw => riskLabel(fw.id).toLowerCase() === f).length})`}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <LoadingState message="Loading frameworks…" />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 16,
        }}>
         {filtered.map(fw => (
            <FrameworkCard
               key={fw.id}
               fw={fw}
               isAdmin={canManage}
               onDetail={() => setDetailTarget(fw)}
               onKnowledgeMapping={() => setKnowledgeMappingTarget(fw)}
               onDetectorMapping={() => setDetectorMappingTarget(fw)}
               onEdit={() => setEditTarget(fw)}
               onDelete={() => setDeleteTarget(fw)}
             />
           ))}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div style={{ marginTop: 20 }}>
          <Pagination page={page} totalPages={totalPages} onPage={p => loadRef.current(p)} />
        </div>
      )}

      {/* Detail drawer */}
      {detailTarget && (
        <FrameworkDetailDrawer
          fw={detailTarget}
          onClose={() => setDetailTarget(null)}
          onEdit={() => { setEditTarget(detailTarget); setDetailTarget(null) }}
          onDelete={() => { setDeleteTarget(detailTarget); setDetailTarget(null) }}
          onKnowledge={() => { setKnowledgeMappingTarget(detailTarget); setDetailTarget(null) }}
          onEditMappings={() => { setDetectorMappingTarget(detailTarget); setDetailTarget(null) }}
          onDetectorClick={() => { setDetectorMappingTarget(detailTarget); setDetailTarget(null) }}
          isAdmin={canManage}
        />
      )}

      {/* Modals */}
      {showCreate && (
        <FrameworkFormModal
          initialData={null}
          onClose={() => setShowCreate(false)}
          onSave={async (_fw) => {
            setShowCreate(false)
            await loadRef.current(1)
            showToast('Framework created')
          }}
        />
      )}

      {editTarget && (
        <FrameworkFormModal
          key={editTarget.id}
          initialData={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={async (_updated) => {
            setEditTarget(null)
            await loadRef.current(page)
            showToast('Framework updated')
          }}
        />
      )}

      {knowledgeMappingTarget && (
        <KnowledgeMappingModal
          framework={knowledgeMappingTarget}
          onClose={() => setKnowledgeMappingTarget(null)}
          onChange={async (updated) => {
            setKnowledgeMappingTarget(updated)
            await loadRef.current(page)
          }}
        />
      )}

      {detectorMappingTarget && (
        <DetectorMappingModal
          framework={detectorMappingTarget}
          onClose={() => setDetectorMappingTarget(null)}
          onChange={async (updated) => {
            setDetectorMappingTarget(updated)
            await loadRef.current(page)
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          open={true}
          title="Delete Framework"
          message={<>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              Permanently delete framework <strong>{deleteTarget.name}</strong>?
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-secondary)', marginBottom: 16 }}>
              This will only remove the framework and its mappings — detector rules and threat knowledge entries will not be deleted.
            </div>
            <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--fg-tertiary)', marginBottom: 16, padding: '8px 10px', background: 'var(--bg-sunken)', borderRadius: 6 }}>
              <span>{deleteTarget.threatKnowledgeEntries?.length || 0} threat knowledge entries linked</span>
              <span>·</span>
              <span>{deleteTarget.detectors?.length || 0} detector rules mapped</span>
            </div>
          </>}
          confirmLabel="Delete framework"
          danger
          busy={deleteBusy}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}

      {toast && <Toast {...toast} />}
    </div>
  )
}
