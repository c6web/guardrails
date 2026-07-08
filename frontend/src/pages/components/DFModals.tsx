import React, { useEffect } from 'react'
import { FormModal, Drawer, FORM_INPUT_STYLE, LoadingState } from '../../components/ui'
import { ShieldCheck, AlertTri } from '../../components/ui/Icons'
import {
  createDetectionFramework,
  updateDetectionFramework,
  addThreatKnowledgeMapping,
  removeThreatKnowledgeMapping,
  addDetectorMapping,
  removeDetectorMapping,
  getAllDetectors,
  type DetectionFramework,
  type ThreatKnowledgeSummary,
  type DetectorSummary,
} from '../../api/detectionFrameworks'
import { getAllThreatKnowledge, type ThreatKnowledge } from '../../api/threatKnowledge'

// ── Framework Form Modal ──────────────────────────────────────────────────────

export function FrameworkFormModal({ initialData, onClose, onSave }: {
  initialData: DetectionFramework | null
  onClose: () => void
  onSave: (fw: DetectionFramework) => void
}) {
  const isNew = !initialData
  const [form, setForm] = React.useState({
    id: initialData?.id || '',
    framework_code: initialData?.framework_code || '',
    name: initialData?.name || '',
    description: initialData?.description || '',
  })
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  function slugFrom(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
  }

  function handleNameChange(name: string) {
    setForm(f => ({
      ...f,
      name,
      id: isNew ? slugFrom(name) : f.id,
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.framework_code.trim() || !form.description.trim()) {
      setError('All fields are required'); return
    }
    setBusy(true); setError(null)
    try {
      let result: DetectionFramework
      if (isNew) {
        result = await createDetectionFramework({
          id: form.id.trim() || undefined,
          framework_code: form.framework_code.trim(),
          name: form.name.trim(),
          description: form.description.trim(),
        })
      } else {
        result = await updateDetectionFramework(initialData!.id, {
          framework_code: form.framework_code.trim(),
          name: form.name.trim(),
          description: form.description.trim(),
        })
      }
      onSave(result)
    } catch (err) {
      setError((err as Error).message || 'Failed to save')
    } finally { setBusy(false) }
  }

  return (
    <FormModal
      open
      title={isNew ? 'New Framework' : 'Edit Framework'}
      busy={busy}
      busyLabel={isNew ? 'Creating\u2026' : 'Saving\u2026'}
      submitLabel={isNew ? 'Create framework' : 'Save changes'}
      onSubmit={handleSubmit}
      onClose={onClose}
    >
      {isNew && (
        <Field label="ID" hint="Unique slug identifier (auto-generated from name)">
          <input className="input" style={FORM_INPUT_STYLE} value={form.id}
            onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
            placeholder="e.g. owasp-2025-llm01" />
        </Field>
      )}
      <Field label="Framework Code *" hint="Short code shown as badge">
        <input className="input" style={FORM_INPUT_STYLE} value={form.framework_code}
          onChange={e => setForm(f => ({ ...f, framework_code: e.target.value }))}
          placeholder="e.g. LLM01" />
      </Field>
      <Field label="Name *">
        <input className="input" style={FORM_INPUT_STYLE} value={form.name}
          onChange={e => handleNameChange(e.target.value)}
          placeholder="e.g. Prompt Injection" />
      </Field>
      <Field label="Description *">
        <textarea className="input" style={{ ...FORM_INPUT_STYLE, height: 90, resize: 'vertical' }} value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Describe the detection framework\u2026" />
      </Field>
      {error && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>
          {error}
        </div>
      )}
    </FormModal>
  )
}

// ── Knowledge Mapping Modal ──────────────────────────────────────────────────

export function KnowledgeMappingModal({ framework, onClose, onChange }: {
  framework: DetectionFramework
  onClose: () => void
  onChange: (updated: DetectionFramework) => void
}) {
  const [allTk, setAllTk] = React.useState<ThreatKnowledge[]>([])
  const [loadingTk, setLoadingTk] = React.useState(true)
  const [linkedTk, setLinkedTk] = React.useState<ThreatKnowledgeSummary[]>(framework.threatKnowledgeEntries || [])
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')

  useEffect(() => {
    getAllThreatKnowledge({ limit: 1000 })
      .then(res => setAllTk(res.data))
      .finally(() => setLoadingTk(false))
  }, [])

  const linkedTkIds = new Set(linkedTk.map(l => l.id))
  const availableTk = allTk.filter(tk =>
    !linkedTkIds.has(tk.id) &&
    (tk.name.toLowerCase().includes(search.toLowerCase()) || tk.description.toLowerCase().includes(search.toLowerCase()))
  )

  async function handleAddTk(tk: ThreatKnowledge) {
    setBusy(tk.id); setError(null)
    try {
      const updated = await addThreatKnowledgeMapping(framework.id, tk.id)
      setLinkedTk(updated.threatKnowledgeEntries || [])
      onChange(updated)
    } catch (err) {
      setError((err as Error).message || 'Failed to add')
    } finally { setBusy(null) }
  }

  async function handleRemoveTk(tkId: string) {
    setBusy(tkId); setError(null)
    try {
      const updated = await removeThreatKnowledgeMapping(framework.id, tkId)
      setLinkedTk(updated.threatKnowledgeEntries || [])
      onChange(updated)
    } catch (err) {
      setError((err as Error).message || 'Failed to remove')
    } finally { setBusy(null) }
  }

  return (
    <Drawer
      open
      title={`Knowledge Mapping — ${framework.name}`}
      onClose={onClose}
      width={620}
      zIndex={210}
      footer={
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      }
    >
      {error && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="label" style={{ marginBottom: 8 }}>Linked entries ({linkedTk.length})</div>
      {linkedTk.length === 0 ? (
        <div style={{ color: 'var(--fg-tertiary)', fontSize: 13, marginBottom: 16, padding: '8px 12px', borderRadius: 6, background: 'var(--bg-sunken)' }}>
          No threat knowledge entries linked yet.
        </div>
      ) : (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {linkedTk.map(tk => (
            <div key={tk.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', borderRadius: 6,
              background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {tk.name}
                  {tk.embedding_at ? (
                    <span style={{ color: 'var(--ok, #76B400)', display: 'flex' }}><ShieldCheck w={11} /></span>
                  ) : (
                    <span style={{ color: 'var(--warning)', display: 'flex' }}><AlertTri w={11} /></span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tk.description}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', flexShrink: 0 }}
                onClick={() => handleRemoveTk(tk.id)} disabled={busy === tk.id}>
                {busy === tk.id ? '…' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="label" style={{ marginBottom: 8 }}>Add threat knowledge entry</div>
      <input className="input" placeholder="Search by name or description…"
        style={{ width: '100%', boxSizing: 'border-box', marginBottom: 8 }}
        value={search} onChange={e => setSearch(e.target.value)} />
      {loadingTk ? (
        <LoadingState size="sm" />
      ) : availableTk.length === 0 ? (
        <div style={{ color: 'var(--fg-tertiary)', fontSize: 13 }}>
          {search ? 'No results.' : 'All available entries are already linked.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
          {availableTk.map(tk => (
            <div key={tk.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 10px', borderRadius: 5,
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-raised)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{tk.name}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tk.description}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}
                onClick={() => handleAddTk(tk)} disabled={busy === tk.id}>
                {busy === tk.id ? '…' : 'Add'}
              </button>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  )
}

// ── Detector Mapping Modal ───────────────────────────────────────────────────

export function DetectorMappingModal({ framework, onClose, onChange }: {
  framework: DetectionFramework
  onClose: () => void
  onChange: (updated: DetectionFramework) => void
}) {
  const [allDetectors, setAllDetectors] = React.useState<DetectorSummary[]>([])
  const [loadingDetectors, setLoadingDetectors] = React.useState(true)
  const [linkedDetectors, setLinkedDetectors] = React.useState<DetectorSummary[]>(framework.detectors || [])
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [detSearch, setDetSearch] = React.useState('')

  useEffect(() => {
    getAllDetectors()
      .then(setAllDetectors)
      .finally(() => setLoadingDetectors(false))
  }, [])

  const linkedDetIds = new Set(linkedDetectors.map(d => d.id))
  const availableDetectors = allDetectors.filter(det =>
    !linkedDetIds.has(det.id) &&
    (det.name.toLowerCase().includes(detSearch.toLowerCase()) || det.description.toLowerCase().includes(detSearch.toLowerCase()))
  )

  async function handleAddDetector(det: DetectorSummary) {
    setBusy(det.id); setError(null)
    try {
      const updated = await addDetectorMapping(framework.id, det.id)
      setLinkedDetectors(updated.detectors || [])
      onChange(updated)
    } catch (err) {
      setError((err as Error).message || 'Failed to add detector')
    } finally { setBusy(null) }
  }

  async function handleRemoveDetector(detectorId: string) {
    setBusy(detectorId); setError(null)
    try {
      const updated = await removeDetectorMapping(framework.id, detectorId)
      setLinkedDetectors(updated.detectors || [])
      onChange(updated)
    } catch (err) {
      setError((err as Error).message || 'Failed to remove detector')
    } finally { setBusy(null) }
  }

  return (
    <Drawer
      open
      title="Detector Mapping"
      subtitle={framework.name}
      onClose={onClose}
      width={620}
      zIndex={210}
      footer={
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      }
    >
      {error && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="label" style={{ marginBottom: 8 }}>Linked detectors ({linkedDetectors.length})</div>
      {linkedDetectors.length === 0 ? (
        <div style={{ color: 'var(--fg-tertiary)', fontSize: 13, marginBottom: 16, padding: '8px 12px', borderRadius: 6, background: 'var(--bg-sunken)' }}>
          No detectors linked yet.
        </div>
      ) : (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {linkedDetectors.map(det => (
            <div key={det.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', borderRadius: 6,
              background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{det.name}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {det.description} · {det.rule_type} · threshold {det.threshold}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', flexShrink: 0 }}
                onClick={() => handleRemoveDetector(det.id)} disabled={busy === det.id}>
                {busy === det.id ? '…' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="label" style={{ marginBottom: 8 }}>Add detector</div>
      <input className="input" placeholder="Search by name or description…"
        style={{ width: '100%', boxSizing: 'border-box', marginBottom: 8 }}
        value={detSearch} onChange={e => setDetSearch(e.target.value)} />
      {loadingDetectors ? (
        <LoadingState size="sm" />
      ) : availableDetectors.length === 0 ? (
        <div style={{ color: 'var(--fg-tertiary)', fontSize: 13 }}>
          {detSearch ? 'No results.' : 'All available detectors are already linked.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
          {availableDetectors.map(det => (
            <div key={det.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 10px', borderRadius: 5,
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-raised)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{det.name}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {det.description} · {det.rule_type} · threshold {det.threshold}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}
                onClick={() => handleAddDetector(det)} disabled={busy === det.id}>
                {busy === det.id ? '…' : 'Add'}
              </button>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  )
}

import { Field } from '../../components/ui'

// ── Shared helpers ────────────────────────────────────────────────────────────

