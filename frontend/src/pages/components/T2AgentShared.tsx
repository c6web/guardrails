import React from 'react'
import { FormModal, FORM_INPUT_STYLE } from '../../components/ui'
import { AlertO } from '../../components/ui/Icons'
export { Toast, ConfirmModal } from '../../components/ui'
import type { T2AgentPrompt } from '../../api/t2prompts'

// ── FormModal ──────────────────────────────────────────────────────────────────

interface FormModalProps {
  prompt?: T2AgentPrompt
  onClose: () => void
  onSubmit: (data: {
    name: string; description?: string; system_prompt: string; threshold?: number; max_output_tokens?: number
  }) => Promise<void>
  busy: boolean
}

export function T2FormModal({ prompt, onClose, onSubmit, busy }: FormModalProps) {
  const isEdit = !!prompt
  const [name, setName]               = React.useState(prompt?.name ?? '')
  const [description, setDescription] = React.useState(prompt?.description ?? '')
  const [systemPrompt, setSystemPrompt] = React.useState(prompt?.system_prompt ?? '')
  const [threshold, setThreshold]     = React.useState(prompt?.threshold ?? 0.72)
  const [maxTokens, setMaxTokens]     = React.useState(prompt?.max_output_tokens ?? 10240)
  const [errors, setErrors]     = React.useState<Record<string, string>>({})

  function validate() {
    const e: Record<string, string> = {}
    if (!name.trim()) e['name'] = 'Required'
    if (!systemPrompt.trim()) e['system_prompt'] = 'Required'
    if (threshold < 0 || threshold > 1) e['threshold'] = 'Must be between 0 and 1'
    if (maxTokens < 1) e['max_output_tokens'] = 'Must be positive'
    return e
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    await onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      system_prompt: systemPrompt.trim(),
      threshold,
      max_output_tokens: maxTokens,
    })
  }

  return (
    <FormModal
      open
      title={isEdit ? 'Edit T2 prompt' : 'Add T2 prompt'}
      busy={busy}
      busyLabel="Saving…"
      submitLabel={isEdit ? 'Save changes' : 'Add prompt'}
      onSubmit={handleSubmit}
      onClose={onClose}
      width={540}
      top="4vh"
    >
      {/* Warning banner */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px',
        borderRadius: 6, marginBottom: 16,
        background: 'rgba(232, 79, 54, 0.1)',
        border: '1px solid rgba(232, 79, 54, 0.3)',
        fontSize: 12, lineHeight: 1.4,
      }}>
        <AlertO w={14} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
        <div>
          <strong style={{ color: 'var(--danger)' }}>Do not include JSON or output-format instructions</strong>
          <span style={{ color: 'var(--fg-secondary)' }}> — the engine automatically appends the required JSON response contract. Adding your own will break T2 scanning.</span>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label className="label" style={{ display: 'block', marginBottom: 4 }}>Name *</label>
        <input className="input" style={FORM_INPUT_STYLE} value={name}
          onChange={e => { setName(e.target.value); setErrors(v => ({ ...v, name: '' })) }}
          placeholder="My T2 prompt" autoFocus />
        {errors['name'] && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3 }}>{errors['name']}</div>}
      </div>

      <div style={{ marginBottom: 14 }}>
        <label className="label" style={{ display: 'block', marginBottom: 4 }}>Description</label>
        <textarea className="input" style={{ ...FORM_INPUT_STYLE, resize: 'vertical', minHeight: 56 }}
          value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Optional — purpose or notes for this prompt" />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label className="label" style={{ display: 'block', marginBottom: 4 }}>System prompt *</label>
        <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginBottom: 4 }}>
          Describe only the analysis behaviour. Do not include JSON output instructions.
        </div>
        <textarea className="input" style={{ ...FORM_INPUT_STYLE, resize: 'vertical', minHeight: 180, fontFamily: 'monospace', fontSize: 12 }}
          value={systemPrompt} onChange={e => { setSystemPrompt(e.target.value); setErrors(v => ({ ...v, system_prompt: '' })) }}
          placeholder="You are a Tier-2 AI intent security analyst..." />
        {errors['system_prompt'] && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3 }}>{errors['system_prompt']}</div>}
      </div>

      <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label className="label" style={{ display: 'block', marginBottom: 4 }}>Threshold (0–1)</label>
          <input className="input" type="number" step="0.01" min={0} max={1}
            style={FORM_INPUT_STYLE} value={threshold}
            onChange={e => setThreshold(Number(e.target.value))} />
          {errors['threshold'] && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3 }}>{errors['threshold']}</div>}
        </div>
        <div style={{ flex: 1 }}>
          <label className="label" style={{ display: 'block', marginBottom: 4 }}>Max output tokens</label>
          <input className="input" type="number" step="1" min={1}
            style={FORM_INPUT_STYLE} value={maxTokens}
            onChange={e => setMaxTokens(Number(e.target.value))} />
          {errors['max_output_tokens'] && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3 }}>{errors['max_output_tokens']}</div>}
        </div>
      </div>

      {/* Quality Review section (read-only) */}
      {prompt?.quality_review_result && (
        <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 6, background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: 'var(--fg-secondary)' }}>Quality Review</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>Result:</span>
            <span style={{
              fontSize: 12, fontWeight: 600, textTransform: 'capitalize',
              color: prompt.quality_review_result === 'good' ? 'var(--ok)' : prompt.quality_review_result === 'poison' ? 'var(--danger)' : 'var(--warn)',
            }}>
              {prompt.quality_review_result === 'poor_quality' ? 'poor' : prompt.quality_review_result}
            </span>
          </div>
          {prompt.quality_review_reason && (
            <div style={{ fontSize: 11, color: 'var(--fg-secondary)', lineHeight: 1.5, marginBottom: 4 }}>
              <span style={{ color: 'var(--fg-tertiary)' }}>Reason:</span> {prompt.quality_review_reason}
            </div>
          )}
          {prompt.quality_reviewed_at && (
            <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>
              Reviewed: {new Date(prompt.quality_reviewed_at).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </FormModal>
  )
}


