import React from 'react'
import { Pencil, Refresh, ShieldCheck, AlertO } from '../../components/ui/Icons'
import { Chip, KV, FORM_INPUT_STYLE, Drawer, FormModal } from '../../components/ui'
export { Toast } from '../../components/ui'
import type { ContentQualityJudgePrompt } from '../../api/contentQualityJudge'

// ── Quality Review (read-only) ──────────────────────────────────────────────────

function QualityReviewSection({ prompt }: { prompt: ContentQualityJudgePrompt }) {
  if (!prompt.quality_review_result) return null
  const color = prompt.quality_review_result === 'good' ? 'var(--ok)' : prompt.quality_review_result === 'poison' ? 'var(--danger)' : 'var(--warn)'
  const label = prompt.quality_review_result === 'poor_quality' ? 'poor' : prompt.quality_review_result
  return (
    <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 6, background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)' }}>
      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: 'var(--fg-secondary)' }}>Quality Review</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>Result:</span>
        <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'capitalize', color }}>{label}</span>
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
  )
}

// ── DetailDrawer ───────────────────────────────────────────────────────────────

interface DetailDrawerProps {
  prompt: ContentQualityJudgePrompt
  open?: boolean
  onClose: () => void
  onEdit: () => void
  onRestoreDefault?: () => void
  onQualityReview?: () => void
}

export function DetailDrawer({ prompt, open, onClose, onEdit, onRestoreDefault, onQualityReview }: DetailDrawerProps) {
  return (
    <Drawer
      open={open}
      title={
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{prompt.name}</span>
            {prompt.is_active && <Chip kind="ok" dot>active</Chip>}
            {prompt.is_system && <Chip>locked</Chip>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 2 }}>
            {prompt.id}
          </div>
        </div>
      }
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
          {!prompt.is_system && (
            <button className="btn btn-secondary btn-sm" onClick={onEdit}>
              <Pencil w={12} /> Edit
            </button>
          )}
          {onQualityReview && (
            <button className="btn btn-ghost btn-sm" onClick={onQualityReview}>
              <ShieldCheck w={12} /> Quality Review
            </button>
          )}
          {prompt.is_default && onRestoreDefault && (
            <button className="btn btn-ghost btn-sm" onClick={onRestoreDefault} title="Reset scoring criteria back to the factory default">
              <Refresh w={12} /> Restore Default
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>
      }
    >
      <div style={{ padding: '16px 20px' }}>
        {prompt.description && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-tertiary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Description</div>
            <div style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>{prompt.description}</div>
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-tertiary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Scoring Criteria</div>
          <div className="mono" style={{ fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.5, color: 'var(--fg-secondary)' }}>{prompt.system_prompt}</div>
        </div>
        <KV labelWidth={140} gap={8} rows={[
          { label: 'Threshold', value: <span style={{ fontSize: 12 }}>{prompt.threshold}</span> },
          { label: 'Max Output Tokens', value: <span style={{ fontSize: 12 }}>{prompt.max_output_tokens}</span> },
          { label: 'Created', value: <span style={{ fontSize: 12 }}>{prompt.createdAt ? new Date(prompt.createdAt).toLocaleString() : '—'}</span>, mono: true },
          { label: 'Updated', value: <span style={{ fontSize: 12 }}>{prompt.updatedAt ? new Date(prompt.updatedAt).toLocaleString() : '—'}</span>, mono: true },
        ]} />
        <QualityReviewSection prompt={prompt} />
      </div>
    </Drawer>
  )
}

// ── FormModal ──────────────────────────────────────────────────────────────────

interface FormModalProps {
  prompt?: ContentQualityJudgePrompt
  onClose: () => void
  onSubmit: (data: {
    name: string; description?: string; system_prompt: string; threshold?: number; max_output_tokens?: number
  }) => Promise<void>
  busy: boolean
}

export function CQJFormModal({ prompt, onClose, onSubmit, busy }: FormModalProps) {
  const isEdit = !!prompt
  const [name, setName]               = React.useState(prompt?.name ?? '')
  const [description, setDescription] = React.useState(prompt?.description ?? '')
  const [systemPrompt, setSystemPrompt] = React.useState(prompt?.system_prompt ?? '')
  const [threshold, setThreshold]     = React.useState(prompt?.threshold ?? 0.7)
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
      title={isEdit ? 'Edit agent criteria' : 'Add agent criteria'}
      busy={busy}
      busyLabel="Saving…"
      submitLabel={isEdit ? 'Save changes' : 'Add criteria'}
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
          <span style={{ color: 'var(--fg-secondary)' }}> — the engine automatically appends the required JSON response contract (CQ_JSON_CONTRACT). Adding your own will break content quality scanning.</span>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label className="label" style={{ display: 'block', marginBottom: 4 }}>Name *</label>
        <input className="input" style={FORM_INPUT_STYLE} value={name}
          onChange={e => { setName(e.target.value); setErrors(v => ({ ...v, name: '' })) }}
          placeholder="My agent criteria" autoFocus />
        {errors['name'] && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3 }}>{errors['name']}</div>}
      </div>

      <div style={{ marginBottom: 14 }}>
        <label className="label" style={{ display: 'block', marginBottom: 4 }}>Description</label>
        <textarea className="input" style={{ ...FORM_INPUT_STYLE, resize: 'vertical', minHeight: 56 }}
          value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Optional — purpose or notes for this preset" />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label className="label" style={{ display: 'block', marginBottom: 4 }}>Scoring criteria *</label>
        <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginBottom: 4 }}>
          Guidance passed to the Content Quality Provider alongside the prompt context and the AI response — describes what groundedness/relevance should mean for this deployment. Only takes effect with the Built-in vendor; TruLens uses its own internal prompts.
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginBottom: 6, lineHeight: 1.5, padding: '8px 10px', borderRadius: 4, background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)' }}>
          <strong>Guidance for prompt authors:</strong> Define criteria for <strong>groundedness</strong> (response must be supported by the provided context) and <strong>relevance</strong> (response must address the user's query). Optionally include <strong>input-quality</strong> criteria — the judge sees the full request context, so you can penalize relevance for incoherent or ambiguous inputs.
        </div>
        <textarea className="input" style={{ ...FORM_INPUT_STYLE, resize: 'vertical', minHeight: 160, fontFamily: 'monospace', fontSize: 12 }}
          value={systemPrompt} onChange={e => { setSystemPrompt(e.target.value); setErrors(v => ({ ...v, system_prompt: '' })) }}
          placeholder="Score the assistant's response against the provided context..." />
        {errors['system_prompt'] && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3 }}>{errors['system_prompt']}</div>}
      </div>

      <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label className="label" style={{ display: 'block', marginBottom: 4 }}>Threshold (0–1)</label>
          <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginBottom: 4 }}>
            Applies to both vendors — Built-in and TruLens.
          </div>
          <input className="input" type="number" step="0.01" min={0} max={1}
            style={FORM_INPUT_STYLE} value={threshold}
            onChange={e => setThreshold(Number(e.target.value))} />
          {errors['threshold'] && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3 }}>{errors['threshold']}</div>}
        </div>
        <div style={{ flex: 1 }}>
          <label className="label" style={{ display: 'block', marginBottom: 4 }}>Max output tokens</label>
          <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginBottom: 4 }}>
            Only takes effect with the Built-in vendor; TruLens controls its own token limits.
          </div>
          <input className="input" type="number" step="1" min={1}
            style={FORM_INPUT_STYLE} value={maxTokens}
            onChange={e => setMaxTokens(Number(e.target.value))} />
          {errors['max_output_tokens'] && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3 }}>{errors['max_output_tokens']}</div>}
        </div>
      </div>

      {prompt && <QualityReviewSection prompt={prompt} />}
    </FormModal>
  )
}

export { ConfirmModal } from '../../components/ui'


