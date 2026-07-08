import React from 'react'
import { PageHeader, Breadcrumbs, Chip, EmptyState, ErrorState, DataTable, type ColumnDef } from '../components/ui'
import { Plus, Pencil, Trash2, Bolt, Brain, Refresh, ShieldCheck } from '../components/ui/Icons'
import ActionCell, { ActionDef } from '../components/ui/ActionCell'
import {
  getContentQualityJudgePrompts, createContentQualityJudgePrompt, updateContentQualityJudgePrompt,
  deleteContentQualityJudgePrompt, setActiveContentQualityJudgePrompt, restoreDefaultContentQualityJudgePrompt,
  getContentQualityJudgePromptQualityStats,
  type ContentQualityJudgePrompt, type QualityStats,
} from '../api/contentQualityJudge'
import { CQJFormModal, ConfirmModal, DetailDrawer, Toast } from './components/ContentQualityJudgeShared'
import { ReviewProgressModal } from './components/ReviewProgressModal'
import { QualityStatsRow } from './components/QualityStatsRow'
import type { TweakValues } from '../types'

interface ContentQualityJudgePageProps { tweaks: TweakValues }

const ContentQualityJudgePage: React.FC<ContentQualityJudgePageProps> = () => {
  const [prompts, setPrompts] = React.useState<ContentQualityJudgePrompt[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [busy, setBusy]           = React.useState(false)
  const [settingActive, setSettingActive] = React.useState(false)
  const [restoring, setRestoring] = React.useState(false)
  const [toast, setToast] = React.useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)

  const [showCreate, setShowCreate]     = React.useState(false)
  const [detailTarget, setDetailTarget] = React.useState<ContentQualityJudgePrompt | null>(null)
  const [editTarget, setEditTarget]     = React.useState<ContentQualityJudgePrompt | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<ContentQualityJudgePrompt | null>(null)
  const [setActiveTarget, setSetActiveTarget] = React.useState<ContentQualityJudgePrompt | null>(null)
  const [restoreTarget, setRestoreTarget] = React.useState<ContentQualityJudgePrompt | null>(null)

  const [qualityStats, setQualityStats] = React.useState<QualityStats | null>(null)
  const [reviewMode, setReviewMode] = React.useState<'bulk-all' | 'bulk-new' | 'single' | null>(null)
  const [pendingSingleReview, setPendingSingleReview] = React.useState<{ id: string; name: string } | null>(null)
  const singleReviewRef = React.useRef<{ id: string; name: string } | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true); setLoadError(null)
    try {
      const [prompts, qs] = await Promise.all([
        getContentQualityJudgePrompts(),
        getContentQualityJudgePromptQualityStats().catch(() => null),
      ])
      setPrompts(prompts)
      setQualityStats(qs)
    }
    catch (err) { setLoadError((err as Error).message || 'Failed to load') }
    finally { setLoading(false) }
  }, [])

  React.useEffect(() => { load() }, [load])

  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  async function handleCreate(data: Parameters<typeof createContentQualityJudgePrompt>[0]) {
    setBusy(true)
    try {
      await createContentQualityJudgePrompt(data)
      setShowCreate(false)
      setToast({ msg: 'Criteria added', kind: 'ok' })
      await load()
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to create', kind: 'err' })
    } finally { setBusy(false) }
  }

  async function handleUpdate(id: string, data: Parameters<typeof updateContentQualityJudgePrompt>[1]) {
    setBusy(true)
    try {
      await updateContentQualityJudgePrompt(id, data)
      setEditTarget(null)
      setToast({ msg: 'Criteria updated', kind: 'ok' })
      await load()
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to update', kind: 'err' })
    } finally { setBusy(false) }
  }

  async function handleDelete(prompt: ContentQualityJudgePrompt) {
    setBusy(true)
    try {
      await deleteContentQualityJudgePrompt(prompt.id)
      setDeleteTarget(null)
      setToast({ msg: `${prompt.name} removed`, kind: 'ok' })
      await load()
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to delete', kind: 'err' })
    } finally { setBusy(false) }
  }

  async function handleConfirmSetActive() {
    if (!setActiveTarget) return
    setSettingActive(true)
    try {
      await setActiveContentQualityJudgePrompt(setActiveTarget.id)
      setSetActiveTarget(null)
      setToast({ msg: `${setActiveTarget.name} set active`, kind: 'ok' })
      await load()
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed', kind: 'err' })
    } finally { setSettingActive(false) }
  }

  async function handleConfirmRestore() {
    if (!restoreTarget) return
    setRestoring(true)
    try {
      await restoreDefaultContentQualityJudgePrompt(restoreTarget.id)
      setRestoreTarget(null)
      setDetailTarget(null)
      setToast({ msg: `${restoreTarget.name} restored to defaults`, kind: 'ok' })
      await load()
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to restore', kind: 'err' })
    } finally { setRestoring(false) }
  }

  function handleSingleReview(prompt: ContentQualityJudgePrompt) {
    setPendingSingleReview({ id: prompt.id, name: prompt.name })
  }

  function handleConfirmSingleReview() {
    if (!pendingSingleReview) return
    singleReviewRef.current = pendingSingleReview
    setReviewMode('single')
    setPendingSingleReview(null)
  }

  function handleBulkReview(mode: 'all' | 'new') {
    setReviewMode(mode === 'all' ? 'bulk-all' : 'bulk-new')
  }

  function handleReviewClose() {
    setReviewMode(null)
    setPendingSingleReview(null)
    singleReviewRef.current = null
    load()
  }

  const columns: ColumnDef<ContentQualityJudgePrompt>[] = [
    {
      key: 'name',
      label: 'Name',
      render: (p) => (
        <span style={{ fontWeight: 500, fontSize: 13 }}>
          <span>{p.name}</span>
          {p.is_active && <Chip kind="ok" dot style={{ marginLeft: 8 }}>active</Chip>}
          {p.is_system && <Chip style={{ marginLeft: 4 }}>locked</Chip>}
        </span>
      ),
    },
    {
      key: 'quality',
      label: 'Quality',
      width: 90,
      render: (p) => {
        const qc = p.quality_review_result === 'good' ? 'var(--ok)' : p.quality_review_result === 'poison' ? 'var(--danger)' : p.quality_review_result === 'poor_quality' ? 'var(--warn)' : null
        const ql = p.quality_review_result === 'poor_quality' ? 'poor' : p.quality_review_result
        return qc ? (
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'capitalize', color: qc }}>{ql}</span>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', fontStyle: 'italic' }}>—</span>
        )
      },
    },
    {
      key: 'threshold',
      label: 'Threshold',
      width: 100,
      render: (p) => <span style={{ fontSize: 12 }}>{p.threshold}</span>,
    },
    {
      key: 'max_output_tokens',
      label: 'Max Tokens',
      width: 110,
      render: (p) => <span style={{ fontSize: 12 }}>{p.max_output_tokens}</span>,
    },
    {
      key: 'updatedAt',
      label: 'Updated',
      width: 110,
      render: (p) => (
        <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>
          {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Action',
      width: 190,
      render: (p) => (
        <div className="row-tight" style={{ gap: 2 }} onClick={e => e.stopPropagation()}>
          {!p.is_active && (
            <button className="icon-btn" title="Set active" style={{ color: 'var(--ok)' }}
              onClick={() => setSetActiveTarget(p)} disabled={settingActive}>
              <Bolt w={13} />
            </button>
          )}
          <ActionCell actions={[
            { icon: <ShieldCheck w={13} />, label: 'Quality Review', onClick: () => handleSingleReview(p) },
            ...(p.is_default ? [{ icon: <Refresh w={13} />, label: 'Restore default scoring criteria', onClick: () => setRestoreTarget(p) }] : []),
            ...(!p.is_system ? [{ icon: <Pencil w={13} />, label: 'Edit', onClick: () => setEditTarget(p) }] : []),
            ...(!p.is_system ? [{ icon: <Trash2 w={13} />, label: 'Delete', danger: true, onClick: () => setDeleteTarget(p) }] : []),
          ] as ActionDef[]} />
        </div>
      ),
    },
  ]

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="content-quality-judge" />
      <PageHeader title="Content Quality Agent" subtitle={<><span>Scoring criteria passed to the Content Quality Provider for groundedness/relevance evaluation. The active preset is used for all Content Quality Scanning. </span><b className="mono">{prompts.length}</b> preset{prompts.length !== 1 ? 's' : ''}</>}
        actions={<><button className="btn btn-ghost btn-sm" onClick={() => handleBulkReview('all')}>Review All</button><button className="btn btn-ghost btn-sm" onClick={() => handleBulkReview('new')}>Review New Items</button><button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus w={13} /> Add criteria</button></>} />

      <QualityStatsRow stats={qualityStats} total={prompts.length} />

      {loadError ? (
        <ErrorState title="Failed to load criteria" message={loadError} onRetry={load} />
      ) : (
        <DataTable<ContentQualityJudgePrompt>
          columns={columns}
          data={prompts}
          rowKey={p => p.id}
          onRowClick={p => setDetailTarget(p)}
          loading={loading}
          minWidth={700}
          emptyState={
            <EmptyState
              icon={<Brain w={28} />}
              title="No agent criteria configured"
              subtitle="Add a preset to enable custom content quality scoring"
              action={
                <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
                  <Plus w={12} /> Add first criteria
                </button>
              }
            />
          }
        />
      )}

      {detailTarget && (
        <DetailDrawer
          prompt={detailTarget}
          onClose={() => setDetailTarget(null)}
          onEdit={() => { setEditTarget(detailTarget); setDetailTarget(null) }}
          onRestoreDefault={() => setRestoreTarget(detailTarget)}
          onQualityReview={() => { handleSingleReview(detailTarget); setDetailTarget(null) }}
        />
      )}

      {showCreate && (
        <CQJFormModal
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
          busy={busy}
        />
      )}
      {editTarget && (
        <CQJFormModal
          prompt={editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={d => handleUpdate(editTarget.id, d)}
          busy={busy}
        />
      )}
      {setActiveTarget && (
        <ConfirmModal
          title="Activate criteria"
          message={<>Set <strong>{setActiveTarget.name}</strong> as the active Content Quality Agent criteria? The gateway will use this preset for all Content Quality Scanning.</>}
          confirmLabel="Set active"
          onClose={() => setSetActiveTarget(null)}
          onConfirm={handleConfirmSetActive}
          busy={settingActive}
        />
      )}
      {deleteTarget && (
        <ConfirmModal
          title="Remove criteria"
          message={<>Remove <strong>{deleteTarget.name}</strong>? This cannot be undone.</>}
          confirmLabel="Remove criteria"
          danger
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget)}
          busy={busy}
        />
      )}
      {restoreTarget && (
        <ConfirmModal
          title="Restore default criteria"
          message={<>Reset <strong>{restoreTarget.name}</strong>'s scoring criteria, threshold, and max output tokens back to the factory default? Any custom edits will be overwritten. This cannot be undone.</>}
          confirmLabel="Restore default"
          danger
          onClose={() => setRestoreTarget(null)}
          onConfirm={handleConfirmRestore}
          busy={restoring}
        />
      )}
      {(reviewMode === 'bulk-all' || reviewMode === 'bulk-new') && (
        <ReviewProgressModal
          resourceType="content-quality-judge-prompts"
          newOnly={reviewMode === 'bulk-new'}
          onClose={handleReviewClose}
        />
      )}
      {reviewMode === 'single' && singleReviewRef.current && (
        <ReviewProgressModal
          resourceType="content-quality-judge-prompts"
          targetId={singleReviewRef.current.id}
          targetName={singleReviewRef.current.name}
          onClose={handleReviewClose}
        />
      )}
      {pendingSingleReview && reviewMode === null && (
        <ConfirmModal
          title="Quality Review"
          message={<>Run an AI-powered quality review on <strong>{pendingSingleReview.name}</strong>? The configured Data Review Provider will analyze the preset and rate it as Good, Poison, or Poor Quality.</>}
          confirmLabel="Review"
          onClose={() => setPendingSingleReview(null)}
          onConfirm={handleConfirmSingleReview}
          busy={false}
        />
      )}
      {toast && <Toast {...toast} />}
    </div>
  )
}

export default ContentQualityJudgePage
