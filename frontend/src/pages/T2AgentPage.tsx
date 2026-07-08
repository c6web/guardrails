import React from 'react'
import { PageHeader, Breadcrumbs, Chip, KV, EmptyState, ErrorState, Drawer, DataTable, type ColumnDef } from '../components/ui'
import ActionCell from '../components/ui/ActionCell'
import { Plus, Pencil, Trash2, Bolt, Brain, ShieldCheck } from '../components/ui/Icons'
import {
  getT2Prompts, createT2Prompt, updateT2Prompt, deleteT2Prompt, setActiveT2Prompt,
  getT2PromptQualityStats,
  type T2AgentPrompt, type QualityStats,
} from '../api/t2prompts'
import { T2FormModal, ConfirmModal, Toast } from './components/T2AgentShared'
import { ReviewProgressModal } from './components/ReviewProgressModal'
import { QualityStatsRow } from './components/QualityStatsRow'
import type { TweakValues } from '../types'

interface T2AgentPageProps { tweaks: TweakValues }

const T2AgentPage: React.FC<T2AgentPageProps> = () => {
  const [prompts, setPrompts] = React.useState<T2AgentPrompt[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [busy, setBusy]           = React.useState(false)
  const [settingActive, setSettingActive] = React.useState(false)
  const [toast, setToast] = React.useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)

  const [showCreate, setShowCreate]     = React.useState(false)
  const [editTarget, setEditTarget]     = React.useState<T2AgentPrompt | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<T2AgentPrompt | null>(null)
  const [setActiveTarget, setSetActiveTarget] = React.useState<T2AgentPrompt | null>(null)

  const [qualityStats, setQualityStats] = React.useState<QualityStats | null>(null)
  const [detailTarget, setDetailTarget] = React.useState<T2AgentPrompt | null>(null)
  const [reviewMode, setReviewMode] = React.useState<'bulk-all' | 'bulk-new' | 'single' | null>(null)
  const [pendingSingleReview, setPendingSingleReview] = React.useState<{ id: string; name: string } | null>(null)
  const singleReviewRef = React.useRef<{ id: string; name: string } | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true); setLoadError(null)
    try {
      const [prompts, qs] = await Promise.all([
        getT2Prompts(),
        getT2PromptQualityStats().catch(() => null),
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

  async function handleCreate(data: Parameters<typeof createT2Prompt>[0]) {
    setBusy(true)
    try {
      await createT2Prompt(data)
      setShowCreate(false)
      setToast({ msg: 'Prompt added', kind: 'ok' })
      await load()
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to create', kind: 'err' })
    } finally { setBusy(false) }
  }

  async function handleUpdate(id: string, data: Parameters<typeof updateT2Prompt>[1]) {
    setBusy(true)
    try {
      await updateT2Prompt(id, data)
      setEditTarget(null)
      setToast({ msg: 'Prompt updated', kind: 'ok' })
      await load()
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed to update', kind: 'err' })
    } finally { setBusy(false) }
  }

  async function handleDelete(prompt: T2AgentPrompt) {
    setBusy(true)
    try {
      await deleteT2Prompt(prompt.id)
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
      await setActiveT2Prompt(setActiveTarget.id)
      setSetActiveTarget(null)
      setToast({ msg: `${setActiveTarget.name} set active`, kind: 'ok' })
      await load()
    } catch (err) {
      setToast({ msg: (err as Error).message || 'Failed', kind: 'err' })
    } finally { setSettingActive(false) }
  }

  function handleSingleReview(prompt: T2AgentPrompt) {
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

  const columns: ColumnDef<T2AgentPrompt>[] = [
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
      key: 'updated_at',
      label: 'Updated',
      width: 110,
      render: (p) => (
        <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>
          {p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      key: 'action',
      label: 'Action',
      width: 160,
      render: (p) => (
        <div className="row-tight" style={{ gap: 2 }}>
          {!p.is_active && (
            <button className="icon-btn" title="Set active" style={{ color: 'var(--ok)' }}
              onClick={(e) => { e.stopPropagation(); setSetActiveTarget(p) }} disabled={settingActive}>
              <Bolt w={13} />
            </button>
          )}
          <ActionCell actions={[
            { icon: <ShieldCheck w={13} />, label: 'Quality Review', onClick: () => handleSingleReview(p) },
            ...(!p.is_system ? [{ icon: <Pencil w={13} />, label: 'Edit', onClick: () => setEditTarget(p) }] : []),
            ...(!p.is_system ? [{ icon: <Trash2 w={13} />, label: 'Delete', danger: true, onClick: () => setDeleteTarget(p) }] : []),
          ]} />
        </div>
      ),
    },
  ]

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="t2-agent" />
      <PageHeader title="T2 Agent Prompts" subtitle={<><span>Manage Tier-2 intent analysis prompts. The active prompt is used by the gateway to detect bad-faith manipulation. </span><b className="mono">{prompts.length}</b> prompt{prompts.length !== 1 ? 's' : ''}</>}
        actions={<><button className="btn btn-ghost btn-sm" onClick={() => handleBulkReview('all')}>Review All</button><button className="btn btn-ghost btn-sm" onClick={() => handleBulkReview('new')}>Review New Items</button><button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus w={13} /> Add prompt</button></>} />

      <QualityStatsRow stats={qualityStats} total={prompts.length} />

      {loadError ? (
        <ErrorState title="Failed to load prompts" message={loadError} onRetry={load} />
      ) : (
        <DataTable
          columns={columns}
          data={prompts}
          rowKey={(p) => p.id}
          onRowClick={(p) => setDetailTarget(p)}
          loading={loading}
          minWidth={700}
          emptyState={
            <EmptyState
              icon={<Brain w={28} />}
              title="No T2 prompts configured"
              subtitle="Add a prompt to enable custom T2 intent analysis"
              action={
                <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
                  <Plus w={12} /> Add first prompt
                </button>
              }
            />
          }
        />
      )}

      {showCreate && (
        <T2FormModal
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
          busy={busy}
        />
      )}
      {editTarget && (
        <T2FormModal
          prompt={editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={d => handleUpdate(editTarget.id, d)}
          busy={busy}
        />
      )}
      {setActiveTarget && (
        <ConfirmModal open={true}
          title="Activate prompt"
          message={<>Set <strong>{setActiveTarget.name}</strong> as the active T2 agent prompt? The gateway will use this prompt for all T2 intent analysis.</>}
          confirmLabel="Set active"
          onClose={() => setSetActiveTarget(null)}
          onConfirm={handleConfirmSetActive}
          busy={settingActive}
        />
      )}
      {deleteTarget && (
        <ConfirmModal open={true}
          title="Remove prompt"
          message={<>Remove <strong>{deleteTarget.name}</strong>? This cannot be undone.</>}
          confirmLabel="Remove prompt"
          danger
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget)}
          busy={busy}
        />
      )}
      {(reviewMode === 'bulk-all' || reviewMode === 'bulk-new') && (
        <ReviewProgressModal
          resourceType="t2-agent-prompts"
          newOnly={reviewMode === 'bulk-new'}
          onClose={handleReviewClose}
        />
      )}
      {reviewMode === 'single' && singleReviewRef.current && (
        <ReviewProgressModal
          resourceType="t2-agent-prompts"
          targetId={singleReviewRef.current.id}
          targetName={singleReviewRef.current.name}
          onClose={handleReviewClose}
        />
      )}
      {pendingSingleReview && reviewMode === null && (
        <>
          <ConfirmModal open={true}
            title="Quality Review"
            message={<>Run an AI-powered quality review on <strong>{pendingSingleReview.name}</strong>? The configured Data Review Provider will analyze the prompt and rate it as Good, Poison, or Poor Quality.</>}
            confirmLabel="Review"
            onClose={() => setPendingSingleReview(null)}
            onConfirm={handleConfirmSingleReview}
            busy={busy}
          />
        </>
      )}
      <Drawer
        open={!!detailTarget}
        title={detailTarget ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{detailTarget.name}</span>
              {detailTarget.is_active && <Chip kind="ok" dot>active</Chip>}
              {detailTarget.is_system && <Chip>locked</Chip>}
            </div>
          ) : <></>}
          subtitle={detailTarget?.id}
          onClose={() => setDetailTarget(null)}
          footer={detailTarget ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
              {!detailTarget.is_system && (
                <button className="btn btn-secondary btn-sm" onClick={() => { setEditTarget(detailTarget); setDetailTarget(null) }}>
                  <Pencil w={12} /> Edit
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => { handleSingleReview(detailTarget); setDetailTarget(null) }}>
                <ShieldCheck w={12} /> Quality Review
              </button>
              <div style={{ flex: 1 }} />
              <button className="btn btn-ghost btn-sm" onClick={() => setDetailTarget(null)}>Close</button>
            </div>
          ) : undefined}
        >
          {detailTarget && (
          <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
            {detailTarget.description && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-tertiary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Description</div>
                <div style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>{detailTarget.description}</div>
              </div>
            )}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-tertiary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>System Prompt</div>
              <div className="mono" style={{ fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.5, color: 'var(--fg-secondary)' }}>{detailTarget.system_prompt}</div>
            </div>
            <KV labelWidth={140} gap={8} rows={[
              { label: 'Threshold', value: <span style={{ fontSize: 12 }}>{detailTarget.threshold}</span> },
              { label: 'Max Output Tokens', value: <span style={{ fontSize: 12 }}>{detailTarget.max_output_tokens}</span> },
              { label: 'Created', value: <span style={{ fontSize: 12 }}>{detailTarget.created_at ? new Date(detailTarget.created_at).toLocaleString() : '—'}</span>, mono: true },
              { label: 'Updated', value: <span style={{ fontSize: 12 }}>{detailTarget.updated_at ? new Date(detailTarget.updated_at).toLocaleString() : '—'}</span>, mono: true },
            ]} />
            {detailTarget.quality_review_result && (
              <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 6, background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: 'var(--fg-secondary)' }}>Quality Review</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>Result:</span>
                  <span style={{
                    fontSize: 12, fontWeight: 600, textTransform: 'capitalize',
                    color: detailTarget.quality_review_result === 'good' ? 'var(--ok)' : detailTarget.quality_review_result === 'poison' ? 'var(--danger)' : 'var(--warn)',
                  }}>
                    {detailTarget.quality_review_result === 'poor_quality' ? 'poor' : detailTarget.quality_review_result}
                  </span>
                </div>
                {detailTarget.quality_review_reason && (
                  <div style={{ fontSize: 11, color: 'var(--fg-secondary)', lineHeight: 1.5, marginBottom: 4 }}>
                    <span style={{ color: 'var(--fg-tertiary)' }}>Reason:</span> {detailTarget.quality_review_reason}
                  </div>
                )}
                {detailTarget.quality_reviewed_at && (
                  <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>
                    Reviewed: {new Date(detailTarget.quality_reviewed_at).toLocaleString()}
                  </div>
                )}
              </div>
            )}
          </div>
          )}
        </Drawer>
      {toast && <Toast {...toast} />}
    </div>
  )
}

export default T2AgentPage
