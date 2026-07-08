import React from 'react'
import { Field, FormModal, FORM_INPUT_STYLE } from '../../components/ui'
export { Toast, ConfirmModal } from '../../components/ui'
import { createThreatKnowledge, updateThreatKnowledge, type ThreatKnowledge } from '../../api/threatKnowledge'

// ── Create / edit modal ───────────────────────────────────────────────────────

export function TKFormModal({ initialData, onClose, onSave }: {
  initialData: ThreatKnowledge | null
  onClose: () => void
  onSave: () => void
}) {
  const [form, setForm] = React.useState({
    name: initialData?.name || '',
    description: initialData?.description || '',
    threat_context: initialData?.threat_context || '',
  })
  const [busy, setBusy] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      if (initialData) {
        await updateThreatKnowledge(initialData.id, {
          name: form.name,
          description: form.description,
          threat_context: form.threat_context || null,
        })
      } else {
        await createThreatKnowledge({
          name: form.name,
          description: form.description,
          threat_context: form.threat_context || null,
        })
      }
      onClose()
      onSave()
    } catch (err) {
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormModal
      open
      title={initialData ? 'Edit entry' : 'New entry'}
      busy={busy}
      busyLabel={initialData ? 'Saving…' : 'Creating…'}
      submitLabel={initialData ? 'Save changes' : 'Create entry'}
      onSubmit={handleSubmit}
      onClose={onClose}
      width={520}
    >
      <Field label="Name *" hint="Human-readable entry name">
        <input className="input" style={FORM_INPUT_STYLE} value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="e.g. OWASP LLM01 — Prompt Injection" />
      </Field>
      <Field label="Description *" hint="What does this threat entry describe?">
        <textarea className="input" style={{ ...FORM_INPUT_STYLE, height: 72, resize: 'vertical' }} value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Describe the threat or reference definition" />
      </Field>
      <Field label="Attack Example" hint="The attack message text that will be embedded for semantic search">
         <textarea className="input" style={{ ...FORM_INPUT_STYLE, height: 72, resize: 'vertical' }} value={form.threat_context}
           onChange={e => setForm(f => ({ ...f, threat_context: e.target.value }))} />
      </Field>
    </FormModal>
  )
}
