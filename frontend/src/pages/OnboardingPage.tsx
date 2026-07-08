import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getChecklist, type ChecklistItem } from '../api/onboarding'
import { Check } from '../components/ui/Icons'
import { PageHeader, Breadcrumbs, EmptyState, LoadingState, ProgressBar } from '../components/ui'
import { Toast } from './components/ProviderShared'

interface OnboardingPageProps {
  tweaks: unknown
}

const OnboardingPage: React.FC<OnboardingPageProps> = () => {
  const navigate = useNavigate()
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null)

  useEffect(() => {
    getChecklist().then(data => {
      setItems(data)
    }).catch(err => {
      setToast({ msg: (err as Error).message || 'Failed to load checklist', kind: 'err' })
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  function handleAction(actionUrl: string | undefined) {
    if (actionUrl) navigate(actionUrl)
  }

  const statusIcon = (status: 'done' | 'warning' | 'missing') => {
    if (status === 'done') return '✅'
    if (status === 'warning') return '⚠️'
    return '❌'
  }

  const statusColor = (status: 'done' | 'warning' | 'missing') => {
    if (status === 'done') return 'var(--accent)'
    if (status === 'warning') return 'var(--warning)'
    return 'var(--danger)'
  }

  const doneCount = items.filter(i => i.status === 'done').length
  const totalItems = items.length
  const progressPct = totalItems > 0 ? Math.round((doneCount / totalItems) * 100) : 0

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="onboarding" />
      <PageHeader title="Onboarding Checklist" subtitle="Setup readiness overview for the All-in-One deployment scenario. This page checks essential configuration items against the database — status is informational only and may not reflect actual runtime behavior." />

      {/* Progress bar */}
      {!loading && items.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Setup Progress</span>
              <span style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>{doneCount} of {totalItems} completed</span>
            </div>
            <ProgressBar value={progressPct} height={8} color={progressPct >= 100 ? 'var(--ok)' : 'var(--accent)'} />
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <LoadingState message="Loading checklist…" />
      ) : items.length === 0 ? (
        <EmptyState title="No checklist items available." />
      ) : (
        items.map((item, idx) => (
          <div key={item.id} className="card" style={{ marginBottom: 16 }}>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-tertiary)', minWidth: 20, textAlign: 'right', paddingTop: 3 }}>
                  {idx + 1}
                </div>
                {/* Status icon */}
                <div style={{ fontSize: 20, lineHeight: 1, minWidth: 24, textAlign: 'center', paddingTop: 2 }}>
                  {statusIcon(item.status)}
                </div>

                <div style={{ flex: 1 }}>
                  {/* Label + status badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{item.label}</span>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      color: statusColor(item.status),
                      background: 'var(--bg-sunken)',
                      padding: '2px 8px',
                      borderRadius: 4,
                    }}>
                      {item.status}
                    </span>
                  </div>

                  {/* Description */}
                  <div style={{ fontSize: 13, color: 'var(--fg-secondary)', marginBottom: 12 }}>{item.message}</div>

                  {/* Action button */}
                  {item.action_url && (
                    <button className="btn btn-sm btn-primary" onClick={() => handleAction(item.action_url)}>
                      <Check w={12} /> Configure
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))
      )}

      {toast && <Toast msg={toast.msg} kind={toast.kind} />}
    </div>
  )
}

export default OnboardingPage
