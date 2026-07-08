import React from 'react'
import { Field, FormModal, FORM_INPUT_STYLE } from '../../components/ui'
export { ConfirmModal } from '../../components/ui'
import { createTool, updateTool, type ToolGuardrailItem } from '../../api/tools'

export function ToolFormModal({ initialData, onClose, onSave }: {
  initialData: ToolGuardrailItem | null
  onClose: () => void
  onSave: () => void
}) {
  const [form, setForm] = React.useState({
    tool_name: initialData?.tool_name || '',
    description: initialData?.description || '',
    active: initialData?.active ?? true,
  })
  const [busy, setBusy] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!initialData && !form.tool_name.trim()) return
    setBusy(true)
    try {
      if (initialData) {
        await updateTool(initialData.id, {
          description: form.description || undefined,
          active: form.active,
        })
      } else {
        await createTool({
          tool_name: form.tool_name.trim(),
          description: form.description?.trim() || undefined,
          active: form.active,
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
      title={initialData ? 'Edit tool guardrail' : 'New tool guardrail'}
      busy={busy}
      busyLabel={initialData ? 'Saving\u2026' : 'Creating\u2026'}
      submitLabel={initialData ? 'Save changes' : 'Create tool'}
      onSubmit={handleSubmit}
      onClose={onClose}
    >
      {!initialData ? (
        <Field label="Tool Name *" hint="e.g. bash, computer_use, file_write">
          <input className="input" style={FORM_INPUT_STYLE} value={form.tool_name}
            onChange={e => setForm(f => ({ ...f, tool_name: e.target.value }))}
            placeholder="e.g. bash, computer_use, file_write" />
        </Field>
      ) : (
        <Field label="Tool Name">
          <div className="mono" style={{ fontSize: 13, padding: '6px 0', color: 'var(--fg-secondary)' }}>{form.tool_name}</div>
        </Field>
      )}
      <Field label="Description" hint="What does this tool do and why might it be blocked?">
        <textarea className="input" style={{ ...FORM_INPUT_STYLE, height: 72, resize: 'vertical' }} value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
      </Field>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={form.active}
            onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
          Active (appears in per-app blocking selections)
        </label>
      </div>
    </FormModal>
  )
}
