import React from 'react'
import { Filter, Trash2 } from '../../components/ui/Icons'
import { Chip, Drawer, Field, Tabs } from '../../components/ui'
import { updateDetector } from '../../api/detectors'
import type { UIDetector } from '../../api/detectors'
import type { FrameworkSummary } from '../../api/detectors'
import { addDetectorFramework, removeDetectorFramework } from '../../api/detectors'
import { RuleTypeToggle, ScopeToggle, ModeToggle, KeywordInput, PatternTester } from './DetectorsShared'
import type { DetectorMode } from './DetectorsShared'

// ── Read-only detail drawer (non-admin) ────────────────────────────────────────

export function ReadOnlyDetailDrawer({ detector, open, onClose, frameworks }: {
  detector: UIDetector
  open?: boolean
  onClose: () => void
  frameworks: Record<string, FrameworkSummary>
}) {
  const mode = detector.mode || 'block'
  return (
    <Drawer
      open={open}
      icon={<Filter w={14} style={{ color: 'var(--accent)' }} />}
      title={detector.name}
      subtitle={detector.id}
      onClose={onClose}
      footer={
        <>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </>
      }
    >
      <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
        <Field label="Description">
          <div style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>{detector.description || '—'}</div>
        </Field>

        <Field label="Rule type">
          <Chip kind={detector.ruleType === 'regex' ? 'info' : 'muted'} mono>{detector.ruleType}</Chip>
        </Field>

        <Field label="Scanning scope">
          <Chip kind={detector.scanningScope === 'output' ? 'warn' : detector.scanningScope === 'both' ? 'ok' : 'muted'} mono>
            {detector.scanningScope}
          </Chip>
        </Field>

        <Field label="Enforcement mode">
          <Chip kind={mode === 'block' ? 'err' : mode === 'redact' ? 'warn' : mode === 'flag' ? 'info' : 'muted'} mono>
            {mode}
          </Chip>
        </Field>

        {mode === 'redact' && (
          <Field label="Redaction placeholder">
            <div className="mono" style={{ fontSize: 12 }}>{detector.redactionPlaceholder || '[REDACTED]'}</div>
          </Field>
        )}

        <Field label={detector.ruleType === 'regex' ? 'Regex patterns' : 'Keywords'}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {detector.keywords.length === 0
              ? <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>—</span>
              : detector.keywords.map((kw, i) => (
                <span key={i} className="mono" style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 4,
                  background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
                }}>
                  {kw}
                </span>
              ))}
          </div>
        </Field>

        <Field label="Frameworks">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {detector.frameworkIds.length === 0
              ? <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>—</span>
              : detector.frameworkIds.map(fid => (
                <span key={fid} className="mono" style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 4,
                  background: 'var(--accent-bg, var(--bg-sunken))',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--accent)', fontWeight: 600,
                }}>
                  {frameworks[fid]?.framework_code || fid}
                </span>
              ))}
          </div>
        </Field>
      </div>
    </Drawer>
  )
}

// ── Tabs / edit form ──────────────────────────────────────────────────────────

export function DetailDrawer({ detector, open, onClose, onSaved, onDelete, frameworks }: {
  detector: UIDetector
  open?: boolean
  onClose: () => void
  onSaved: (d: UIDetector) => void
  onDelete: () => void
  frameworks: Record<string, FrameworkSummary>
}) {
  const [activeTab, setActiveTab] = React.useState<'main' | 'frameworks'>('main')

  const [form, setForm] = React.useState({
    name:                 detector.name,
    description:          detector.description,
    keywords:             [...detector.keywords],
    rule_type:            detector.ruleType,
    scanning_scope:       detector.scanningScope,
    mode:                 (detector.mode || 'block') as DetectorMode,
    redactionPlaceholder: detector.redactionPlaceholder ?? '',
  })
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [busy, setBusy]     = React.useState(false)
  const [dirty, setDirty]   = React.useState(false)

  // Framework state (managed separately on the frameworks tab)
  const [linkedFrameworks, setLinkedFrameworks] = React.useState<Set<string>>(new Set(detector.frameworkIds))
  const [frameworkBusy, setFrameworkBusy]       = React.useState<Record<string, boolean>>({})
  const [saveBusy, setSaveBusy]                 = React.useState(false)

  // Reset when detector changes
  React.useEffect(() => {
    setForm({
      name:                 detector.name,
      description:          detector.description,
      keywords:             [...detector.keywords],
      rule_type:            detector.ruleType,
      scanning_scope:       detector.scanningScope,
      mode:                 (detector.mode || 'block') as DetectorMode,
      redactionPlaceholder: detector.redactionPlaceholder ?? '',
    })
    setLinkedFrameworks(new Set(detector.frameworkIds))
    setDirty(false)
    setErrors({})
  }, [detector.id])

  function setField(k: string, v: unknown) {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(er => ({ ...er, [k]: '' }))
    setDirty(true)
  }

  async function handleSave() {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs['name'] = 'Required'
    if (!form.description.trim()) errs['description'] = 'Required'
    if (Object.keys(errs).length) { setErrors(errs); return }
    setBusy(true)
    try {
      const updated = await updateDetector(detector.id, {
        name:                 form.name.trim(),
        description:          form.description.trim(),
        keywords:             form.keywords,
        rule_type:            form.rule_type,
        scanning_scope:       form.scanning_scope,
        mode:                 form.mode,
        redaction_placeholder: form.mode === 'redact' ? (form.redactionPlaceholder.trim() || '[REDACTED]') : undefined,
      })
      setDirty(false)
      onSaved(updated)
    } catch (err) {
      setErrors({ name: (err as Error).message || 'Save failed' })
    } finally { setBusy(false) }
  }

  function hasPendingFrameworks(): boolean {
    const original = new Set(detector.frameworkIds)
    if (original.size !== linkedFrameworks.size) return true
    for (const id of linkedFrameworks) {
      if (!original.has(id)) return true
    }
    for (const id of original) {
      if (!linkedFrameworks.has(id)) return true
    }
    return false
  }

  async function handleSaveFrameworks() {
    setSaveBusy(true)
    try {
      const toAdd = new Set<string>()
      const toRemove = new Set<string>()
      const original = new Set(detector.frameworkIds)
      for (const id of linkedFrameworks) {
        if (!original.has(id)) toAdd.add(id)
      }
      for (const id of original) {
        if (!linkedFrameworks.has(id)) toRemove.add(id)
      }
      for (const id of toAdd) {
        setFrameworkBusy(prev => ({ ...prev, [id]: true }))
        await addDetectorFramework(detector.id, id)
      }
      for (const id of toRemove) {
        setFrameworkBusy(prev => ({ ...prev, [id]: true }))
        await removeDetectorFramework(detector.id, id)
      }
      onSaved({
        ...detector,
        frameworkIds: [...linkedFrameworks],
      })
    } catch (err) {
      console.error(err)
    } finally { setSaveBusy(false) }
  }

  function handleToggleFramework(fwId: string, checked: boolean) {
    setLinkedFrameworks(prev => {
      const next = new Set(prev)
      if (checked) next.add(fwId)
      else next.delete(fwId)
      return next
    })
  }

  return (
    <Drawer
      open={open}
      icon={<Filter w={14} style={{ color: 'var(--accent)' }} />}
      title={detector.name}
      subtitle={detector.id}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={onDelete} disabled={busy}>
            <Trash2 w={13} /> Delete
          </button>
          <div style={{ flex: 1 }} />
          {hasPendingFrameworks() && (
            <button className="btn btn-primary" onClick={handleSaveFrameworks} disabled={saveBusy}>
              {saveBusy ? 'Saving…' : 'Save Frameworks'}
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            {activeTab === 'main' ? 'Done' : 'Back'}
          </button>
          {activeTab === 'main' && (
            <button className="btn btn-primary" onClick={handleSave} disabled={busy || !dirty}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          )}
        </>
      }
    >
      <Tabs tabs={[
        { key: 'main', label: 'Main' },
        { key: 'frameworks', label: `Frameworks (${detector.frameworkIds.length})` },
      ]} activeKey={activeTab} onChange={setActiveTab} />

      <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
        {/* Main tab */}
        {activeTab === 'main' && (
          <>
            <Field label="Detector name *" error={errors['name']}>
              <input className="input" style={{ width: '100%', boxSizing: 'border-box' }} value={form.name}
                onChange={e => setField('name', e.target.value)} />
            </Field>

            <Field label="Description *" error={errors['description']}>
              <textarea className="input" style={{ ...{ width: '100%', boxSizing: 'border-box' }, height: 72, resize: 'vertical' }} value={form.description}
                onChange={e => setField('description', e.target.value)} />
            </Field>

            <Field label="Rule type" hint="Keyword: substring match. Regex: JavaScript RegExp syntax, case-insensitive.">
              <RuleTypeToggle value={form.rule_type as 'keyword' | 'regex'} onChange={v => setField('rule_type', v)} />
            </Field>

            <Field label="Scanning scope" hint="Input: prompt scanning only. Output: response scanning only. Both: applied to both.">
              <ScopeToggle value={form.scanning_scope as 'input' | 'output' | 'both'} onChange={v => setField('scanning_scope', v)} />
            </Field>

            <Field label="Enforcement mode" hint="Block: reject. Flag: forward with warning. Redact: replace matched spans with placeholder.">
              <ModeToggle
                value={form.mode}
                onChange={v => setField('mode', v)}
              />
            </Field>

            {form.mode === 'redact' && (
              <Field label="Redaction placeholder" hint="Text that replaces matched content (default: [REDACTED]).">
                <input
                  className="input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={form.redactionPlaceholder}
                  onChange={e => setField('redactionPlaceholder', e.target.value)}
                  placeholder="[REDACTED]"
                />
              </Field>
            )}

            <Field
               label={form.rule_type === 'regex' ? 'Regex patterns' : 'Keywords'}
               hint={form.rule_type === 'regex'
                 ? 'One pattern per entry. Press Enter to add.'
                 : 'Type a keyword and press Enter to add; × to remove'}>
                <KeywordInput keywords={form.keywords} onChange={kw => setField('keywords', kw)} />
              </Field>

            <PatternTester ruleType={form.rule_type as 'keyword' | 'regex'} patterns={form.keywords} />

            {/* Quality Review section (read-only) */}
            {detector.quality_review_result && (
              <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 6, background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: 'var(--fg-secondary)' }}>Quality Review</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>Result:</span>
                  <span style={{
                    fontSize: 12, fontWeight: 600, textTransform: 'capitalize',
                    color: detector.quality_review_result === 'good' ? 'var(--ok)' : detector.quality_review_result === 'poison' ? 'var(--danger)' : 'var(--warn)',
                  }}>
                    {detector.quality_review_result === 'poor_quality' ? 'poor' : detector.quality_review_result}
                  </span>
                </div>
                {detector.quality_review_reason && (
                  <div style={{ fontSize: 11, color: 'var(--fg-secondary)', lineHeight: 1.5, marginBottom: 4 }}>
                    <span style={{ color: 'var(--fg-tertiary)' }}>Reason:</span> {detector.quality_review_reason}
                  </div>
                )}
                {detector.quality_reviewed_at && (
                  <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>
                    Reviewed: {new Date(detector.quality_reviewed_at).toLocaleString()}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Frameworks tab */}
        {activeTab === 'frameworks' && (
          <>
            <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--fg-tertiary)' }}>
              Select detection frameworks this detector applies to. Changes are saved independently from the Main tab.
            </div>

            {/* Frameworks table */}
            <table className="t" style={{ width: '100%', marginBottom: 16 }}>
              <thead>
                <tr>
                  <th style={{ width: 28 }}></th>
                  <th style={{ width: '12%', minWidth: 80, textAlign: 'left', fontSize: 11, color: 'var(--fg-tertiary)', fontWeight: 500 }}>Code</th>
                  <th style={{ width: '35%', minWidth: 150, textAlign: 'left', fontSize: 11, color: 'var(--fg-tertiary)', fontWeight: 500 }}>Name</th>
                  <th style={{ textAlign: 'left', fontSize: 11, color: 'var(--fg-tertiary)', fontWeight: 500 }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(frameworks).map(fw => {
                  const checked = linkedFrameworks.has(fw.id)
                  return (
                    <tr key={fw.id} style={{ opacity: frameworkBusy[fw.id] ? 0.5 : 1 }}>
                      <td>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => handleToggleFramework(fw.id, e.target.checked)}
                          disabled={frameworkBusy[fw.id] || saveBusy}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
                      <td className="mono" style={{ fontSize: 10 }}>
                        {fw.framework_code}
                      </td>
                      <td style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>{fw.name}</td>
                      <td style={{ fontSize: 11, color: 'var(--fg-secondary)' }}>
                        {fw.description}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Summary row */}
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--fg-tertiary)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              <span>{Object.values(frameworks).length} total frameworks</span>
              <span style={{ color: linkedFrameworks.size > 0 ? 'var(--accent)' : undefined }}>{linkedFrameworks.size} selected</span>
            </div>
          </>
        )}
      </div>
    </Drawer>
  )
}
