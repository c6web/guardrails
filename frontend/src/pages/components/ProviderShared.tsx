import React from 'react'
import { Chip, KV, FORM_INPUT_STYLE, Drawer, FormModal } from '../../components/ui'
export { Toast } from '../../components/ui'
import { X, Settings, Network, Play, Check, AlertTri } from '../../components/ui/Icons'
import { apiFetch } from '../../api/client'
import { lookupAiProviderModels, lookupAiProviderModelsAdhoc } from '../../api/aiProviders'
import { lookupEmbeddingProviderModels, lookupEmbeddingProviderModelsAdhoc } from '../../api/embeddingProviders'
import modelsOpenRouter           from '../../data/recommended-models-openrouter.json'
import modelsOpenAI               from '../../data/recommended-models-openai.json'
import modelsAnthropic            from '../../data/recommended-models-anthropic.json'
import modelsGoogle               from '../../data/recommended-models-google.json'
import modelsOllama               from '../../data/recommended-models-ollama.json'
import modelsEmbeddingOpenRouter  from '../../data/recommended-models-embedding-openrouter.json'
import modelsEmbeddingOllama      from '../../data/recommended-models-embedding-ollama.json'
import modelsEmbeddingGoogle      from '../../data/recommended-models-embedding-google.json'
import { AllowedModelsPicker, SingleModelPicker, type AllowedModelEntry } from './ModelPickers'

interface RecommendedModel {
  id: string; name: string; provider: string
  description: string; tags: string[]
  dimensions?: number
  max_input_token?: number
  max_output_token?: number
}
const RECOMMENDED_MODELS: Record<string, RecommendedModel[]> = {
  openrouter: modelsOpenRouter as RecommendedModel[],
  openai:     modelsOpenAI     as RecommendedModel[],
  anthropic:  modelsAnthropic  as RecommendedModel[],
  google:          modelsGoogle as RecommendedModel[],
  'google-gemini': modelsGoogle as RecommendedModel[],
  ollama:     modelsOllama     as RecommendedModel[],
}
const EMBEDDING_RECOMMENDED_MODELS: Record<string, RecommendedModel[]> = {
  openrouter:      modelsEmbeddingOpenRouter as RecommendedModel[],
  ollama:          modelsEmbeddingOllama     as RecommendedModel[],
  'google-gemini': modelsEmbeddingGoogle     as RecommendedModel[],
}

export { ConfirmModal } from '../../components/ui'

// ── Provider form modal ───────────────────────────────────────────────────────

export interface ProviderFormData {
  id: string; name: string; vendor: string; endpoint: string
  api_key: string | null; notes: string | null
  model: string | null; max_output_token: number | null; max_input_token: number | null
  timeout_ms: number
  dimensions?: string
  provider?: string | null
  allow_fallbacks?: boolean | null
  data_collection?: string | null
  allowed_models?: string[]
  default_model?: string | null
}

export interface ProviderFormLabels {
  createTitle?: string
  editTitle?: string
  idPrefix?: string
  submitCreate?: string
}

export interface ProviderFormConfig {
  requiredFields?: string[]
}

const vendorGroups = [
  { label: 'Cloud Provider', options: ['anthropic', 'aws', 'azure', 'google', 'google-gemini', 'groq', 'mistral', 'openai', 'openrouter'] },
  { label: 'Local LLM',      options: ['llamacpp', 'lmstudio', 'ollama', 'vllm'] },
  { label: 'Others (OpenAI Compatible)', options: ['cohere', 'other-openai-compatible'] },
]

const vendorDefaults: Record<string, { endpoint: string; model?: string; dimensions?: number }> = {
  // LLM providers
  openai:            { endpoint: 'https://api.openai.com/v1',       model: 'gpt-5.4-nano' },
  anthropic:         { endpoint: 'https://api.anthropic.com/v1',    model: 'claude-haiku-4-5' },
  google:            { endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.5-flash' },
  'google-gemini':   { endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.5-flash' },
  aws:               { endpoint: 'https://bedrock-runtime.{region}.amazonaws.com' },
  azure:             { endpoint: 'https://{resource}.openai.azure.com/v1' },
  mistral:           { endpoint: 'https://api.mistral.ai/v1',       model: 'mistral-large-latest' },
  groq:              { endpoint: 'https://api.groq.com/openai/v1',  model: 'mixtral-8x7b-32768' },
  openrouter:        { endpoint: 'https://openrouter.ai/api/v1',    model: 'openai/gpt-4o' },
  cohere:            { endpoint: 'https://api.cohere.ai/v1',        model: 'command-r-plus' },
  ollama:            { endpoint: 'http://localhost:11434' },
  llamacpp:          { endpoint: 'http://localhost:8080' },
  lmstudio:          { endpoint: 'http://localhost:1234' },
  vllm:              { endpoint: 'http://localhost:8000' },
  // Embedding providers
  'text-embedding-3-small': { endpoint: 'https://api.openai.com/v1', dimensions: 1536 },
  'embed-20240620':  { endpoint: 'https://api.anthropic.com/v1', dimensions: 3072 },
  'text-embedding-004': { endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai', dimensions: 768 },
  'embed-multilingual-v3.0': { endpoint: 'https://api.cohere.ai/v1', dimensions: 3072 },
  'mistral-embed':   { endpoint: 'https://api.mistral.ai/v1', dimensions: 1024 },
}

const vendorEmbeddingDefaults: Record<string, { endpoint: string; model?: string; dimensions?: number }> = {
  openai:            { endpoint: 'https://api.openai.com/v1',       model: 'text-embedding-3-small',    dimensions: 1536 },
  anthropic:         { endpoint: 'https://api.anthropic.com/v1',    model: 'embed-20240620',            dimensions: 3072 },
  'google-gemini':   { endpoint: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-embedding-2', dimensions: 3072 },
  openrouter:        { endpoint: 'https://openrouter.ai/api/v1', model: 'qwen/qwen3-embedding-4b' },
  cohere:            { endpoint: 'https://api.cohere.ai/v1',            model: 'embed-multilingual-v3.0',   dimensions: 3072 },
  mistral:           { endpoint: 'https://api.mistral.ai/v1',      model: 'mistral-embed',             dimensions: 1024 },
  groq:              { endpoint: 'https://api.groq.com/openai/v1' },
  llamacpp:          { endpoint: 'http://localhost:8080' },
  lmstudio:          { endpoint: 'http://localhost:1234' },
  ollama:            { endpoint: 'http://localhost:11434' },
  vllm:              { endpoint: 'http://localhost:8000' },
}

const defaultLabels: Required<ProviderFormLabels> = {
  createTitle:  'Register upstream provider',
  editTitle:    'Edit upstream provider',
  idPrefix:     'prov',
  submitCreate: 'Register provider',
}

export function ProviderFormModal({ initialProvider, onClose, onSave, labels: labelsProp, extraFields, config: configProp, asDrawer = false, isEmbedding = false }: {
  initialProvider?: { id: string; name: string; vendor: string; endpoint: string; api_key?: string; notes?: string; model?: string; max_output_token?: number; max_input_token?: number; timeout_ms?: number; dimensions?: string }
  onClose: () => void
  onSave: (data: ProviderFormData) => void
  labels?: ProviderFormLabels
  extraFields?: { name: string; label: string; type: string; placeholder?: string; required?: boolean }[]
  config?: ProviderFormConfig
  asDrawer?: boolean
  isEmbedding?: boolean
}) {
  const labels = { ...defaultLabels, ...labelsProp }
  const config = { requiredFields: [], ...configProp }
  const isEdit = !!initialProvider
  const [form, setForm] = React.useState(() => {
    if (initialProvider) {
      return {
        id: initialProvider.id || '', name: initialProvider.name || '', vendor: initialProvider.vendor || 'openai',
        endpoint: initialProvider.endpoint || '', api_key: initialProvider.api_key || '', notes: initialProvider.notes || '', model: initialProvider.model || '',
        max_output_token: (initialProvider.max_output_token ?? '') as string | number,
        max_input_token: (initialProvider.max_input_token ?? '') as string | number,
        timeout_ms: (initialProvider.timeout_ms ?? 30000) as number, dimensions: (initialProvider.dimensions ?? '') as string,
        allow_fallbacks: (initialProvider as any)?.allow_fallbacks ?? null, data_collection: (initialProvider as any)?.data_collection ?? 'deny',
      }
    }
    return { id: '', name: '', vendor: 'openai', endpoint: '', api_key: '', notes: '', model: '', max_output_token: '' as string | number, max_input_token: '' as string | number, timeout_ms: 30000, dimensions: '' as string, allow_fallbacks: null, data_collection: 'deny' }
  })
  const [busy, setBusy] = React.useState(false)
  const [showApiKey, setShowApiKey] = React.useState(false)
  const [showModelPicker, setShowModelPicker] = React.useState(false)
  const modelCatalog = isEmbedding ? EMBEDDING_RECOMMENDED_MODELS : RECOMMENDED_MODELS
  const hasModelSuggestions = (modelCatalog[form.vendor]?.length ?? 0) > 0

  const [allowedModels, setAllowedModels] = React.useState<AllowedModelEntry[]>(() => {
    if (!initialProvider) return []
    const prov = initialProvider as any
    if (prov.allowed_models?.length) {
      const defaultModel = prov.model || prov.allowed_models[0]
      return prov.allowed_models.map((m: string) => ({
        id: m, checked: true, isDefault: m === defaultModel,
      }))
    }
    if (prov.model) {
      return [{ id: prov.model, checked: true, isDefault: true }]
    }
    return []
  })
  const [lookupRunning, setLookupRunning] = React.useState(false)
  const [modelsError, setModelsError] = React.useState<string | null>(null)
  const [selectedModel, setSelectedModel] = React.useState<string | null>(() => {
    if (isEmbedding && initialProvider?.model) return initialProvider.model
    return null
  })
  const [lookupResults, setLookupResults] = React.useState<{ id: string; label?: string }[]>(() => {
    if (isEmbedding && initialProvider?.model) return [{ id: initialProvider.model }]
    return []
  })
  const [lookupNote, setLookupNote] = React.useState<string | null>(null)

  // Sync form.model from allowed-models default
  React.useEffect(() => {
    const def = allowedModels.find(a => a.checked && a.isDefault)
    if (def) {
      setForm(f => ({ ...f, model: def.id }))
    }
  }, [allowedModels])

  // Ensure selectedModel is always present in lookupResults
  React.useEffect(() => {
    if (!isEmbedding || !selectedModel) return
    setLookupResults(prev => {
      if (prev.some(m => m.id === selectedModel)) return prev
      return [{ id: selectedModel }, ...prev]
    })
  }, [selectedModel])

  async function handleLookupModels() {
    if (!form.endpoint) { setModelsError('Endpoint is required'); return }
    if (!form.vendor) { setModelsError('Vendor is required'); return }
    setModelsError(null)
    setLookupRunning(true)
    try {
      if (isEmbedding) {
        const result = form.id
          ? await lookupEmbeddingProviderModels(form.id)
          : await lookupEmbeddingProviderModelsAdhoc({ endpoint: form.endpoint, api_key: form.api_key || undefined, vendor: form.vendor })
        setLookupResults(prev => {
          const existing = new Set(result.models.map(m => m.id))
          const merged = [...result.models]
          for (const p of prev) {
            if (!existing.has(p.id)) merged.push(p)
          }
          return merged
        })
        setLookupNote(result.note ?? null)
      } else {
        const result = form.id
          ? await lookupAiProviderModels(form.id)
          : await lookupAiProviderModelsAdhoc({ endpoint: form.endpoint, api_key: form.api_key || undefined, vendor: form.vendor })
        setAllowedModels(prev => {
          const existing = new Map(prev.map(a => [a.id, a]))
          const merged: AllowedModelEntry[] = prev.map(a => ({ ...a }))
          for (const m of result.models) {
            if (!existing.has(m.id)) {
              merged.push({ id: m.id, label: m.label, checked: false, isDefault: false })
            }
          }
          return merged
        })
      }
    } catch (err) {
      console.error('[model-lookup]', err)
      const msg = err instanceof Error ? err.message : String(err)
      setModelsError(msg)
    } finally {
      setLookupRunning(false)
    }
  }

  function handleToggleModel(id: string) {
    setModelsError(null)
    setAllowedModels(prev => {
      const target = prev.find(a => a.id === id)
      if (!target) return prev
      if (target.isDefault && target.checked) {
        return prev
      }
      return prev.map(a => ({
        ...a, checked: a.id === id ? !a.checked : a.checked,
      }))
    })
  }

  function handleSelectAll() {
    setModelsError(null)
    setAllowedModels(prev => {
      const allChecked = prev.every(a => a.checked)
      if (allChecked) {
        return prev.map(a => ({
          ...a, checked: false, isDefault: false,
        }))
      }
      const firstUnchecked = prev.find(a => !a.checked)
      return prev.map(a => ({
        ...a, checked: true,
        isDefault: a.isDefault || (firstUnchecked && firstUnchecked.id === a.id ? prev.every(p => p.checked) : false),
      }))
    })
  }

  function handleSetDefault(id: string) {
    setModelsError(null)
    setAllowedModels(prev => prev.map(a => ({
      ...a, isDefault: a.id === id,
    })))
  }

  function setField(k: string, v: string | number) {
    setForm(f => ({ ...f, [k]: v }))
  }

  // Auto-fill endpoint/model/dimensions when vendor changes (create + edit)
  React.useEffect(() => {
    const defaults = extraFields?.length ? vendorEmbeddingDefaults[form.vendor] : vendorDefaults[form.vendor]
    if (!defaults) return
    setForm(f => ({
      ...f,
      endpoint: isEdit ? f.endpoint : defaults.endpoint,
      model:    isEdit ? f.model : (f.model === '' && defaults.model ? defaults.model : (defaults.model || '')),
      dimensions: isEdit ? f.dimensions : ((f.dimensions === undefined || f.dimensions === '') && defaults.dimensions ? String(defaults.dimensions) : f.dimensions),
    }))
  }, [form.vendor, extraFields?.length])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.vendor.trim() || !form.endpoint.trim()) return
    if (isEdit && !form.id) return
    for (const field of config.requiredFields) {
      if (!((form as any)[field] && (form as any)[field].toString().trim())) return
    }
    if (isEmbedding) {
      if (!selectedModel && config.requiredFields.includes('model')) {
        setModelsError('Select a model before saving.')
        return
      }
    } else {
      const checkedModels = allowedModels.filter(a => a.checked).map(a => a.id)
      const defaultModel = allowedModels.find(a => a.checked && a.isDefault)
      if (allowedModels.length > 0 && checkedModels.length === 0) {
        setModelsError('Select at least one allowed model before saving.')
        return
      }
      if (checkedModels.length > 0 && !defaultModel) {
        setModelsError('Choose a default model (click the star) among the selected models.')
        return
      }
    }
    setModelsError(null)
    setBusy(true)
    try {
      const payload: ProviderFormData = {
        id: isEdit ? form.id.trim() ?? '' : '',
        name: form.name.trim(), vendor: form.vendor.trim(),
        endpoint: form.endpoint.trim(),
        api_key: form.api_key || null, notes: form.notes || null,
        model: isEmbedding ? selectedModel : ((form.model as string).trim() || null),
        max_output_token: form.max_output_token !== '' ? Number(form.max_output_token) : null,
        max_input_token: form.max_input_token !== '' ? Number(form.max_input_token) : null,
        timeout_ms: form.timeout_ms,
        provider: ((form as any)['provider'] as string)?.trim() || null,
        allow_fallbacks: (form as any)['allow_fallbacks'] ?? null,
        data_collection: (form as any)['data_collection'] ?? null,
      }
      if (!isEmbedding) {
        const checkedModels = allowedModels.filter(a => a.checked).map(a => a.id)
        const defaultModel = allowedModels.find(a => a.checked && a.isDefault)
        if (checkedModels.length > 0 && defaultModel) {
          payload.allowed_models = checkedModels
          payload.default_model = defaultModel.id
          payload.model = defaultModel.id
        }
      }
      if (extraFields?.length) {
        for (const f of extraFields) {
          const val = (form as any)[f.name]
          if (val !== undefined && val !== '' && f.name !== 'provider') payload[f.name as keyof ProviderFormData] = val as never
        }
      }
      await onSave(payload)
    } finally { setBusy(false) }
  }

  const title = isEdit ? labels.editTitle : labels.createTitle

  const formFields = (
    <>
      {isEdit && (
        <Field label="Provider ID" hint="Unique identifier (read-only)">
          <input className="input" style={{ ...FORM_INPUT_STYLE, opacity: 0.6 }} value={form.id} readOnly />
        </Field>
      )}
      <Field label="Display name *" hint="Human-readable name for this provider">
        <input className="input" style={FORM_INPUT_STYLE} value={form.name}
          onChange={e => setField('name', e.target.value)}
          placeholder="e.g. OpenAI, vLLM Local, Azure OpenAI" />
      </Field>
      <Field label="Connection type *" hint="Vendor or protocol">
        <select className="select" style={FORM_INPUT_STYLE} value={form.vendor}
          onChange={e => setField('vendor', e.target.value)}>
          <option value="">Select connection type…</option>
          {vendorGroups.map(g => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map(v => <option key={v} value={v}>{v}</option>)}
            </optgroup>
          ))}
        </select>
      </Field>
      <Field label="Base endpoint *" hint="e.g. https://api.openai.com or http://localhost:11434">
        <input className="input" style={FORM_INPUT_STYLE} value={form.endpoint}
          onChange={e => setField('endpoint', e.target.value)} placeholder="https://" />
      </Field>
      <Field label="API key" hint="Optional — required by some providers">
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="input" style={{ ...FORM_INPUT_STYLE, flex: 1 }} type={showApiKey ? 'text' : 'password'} value={form.api_key}
            onChange={e => setField('api_key', e.target.value)} placeholder="sk-…" />
          {form.api_key && (
            <button type="button" className="icon-btn" onClick={() => setShowApiKey(v => !v)} style={{ padding: 6 }} title={showApiKey ? 'Hide' : 'Show'}>
              {showApiKey ? <X w={12} /> : <Settings w={12} />}
            </button>
          )}
        </div>
      </Field>
      <Field label={`Default model${config.requiredFields.includes('model') ? ' *' : ''}`} hint={config.requiredFields.includes('model') ? 'Required' : 'Optional — use the provider\'s default if left blank'} error={modelsError ?? undefined}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm"
            disabled={!form.endpoint || !form.vendor || lookupRunning}
            onClick={handleLookupModels}>
            {lookupRunning
              ? <><svg style={{ animation: 'spin 1s linear infinite' }} width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" /></svg> Looking up…</>
              : 'Look up models'}
          </button>
          {hasModelSuggestions && (
            <button type="button" className="btn btn-ghost btn-sm"
              onClick={() => setShowModelPicker(true)}>
              Browse recommended models
            </button>
          )}
          {(!form.endpoint || !form.vendor) && (
            <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>Enter vendor and endpoint first</span>
          )}
        </div>

        {isEmbedding
          ? <SingleModelPicker selected={selectedModel} options={lookupResults} onSelect={setSelectedModel} note={lookupNote} />
          : <AllowedModelsPicker entries={allowedModels} onToggle={handleToggleModel} onSelectAll={handleSelectAll} onSetDefault={handleSetDefault} />}
      </Field>
      {showModelPicker && (
        <RecommendedModelsModal
          vendor={form.vendor}
          catalog={modelCatalog}
          onSelect={m => {
            if (isEmbedding) {
              setSelectedModel(m.id)
            } else {
              setAllowedModels(prev => {
                if (prev.some(a => a.id === m.id)) return prev
                return [...prev, { id: m.id, checked: true, isDefault: prev.length === 0 }]
              })
            }
            if (m.dimensions != null) setField('dimensions', String(m.dimensions))
            if (m.max_output_token != null) setField('max_output_token', m.max_output_token)
            if (m.max_input_token != null) setField('max_input_token', m.max_input_token)
          }}
          onClose={() => setShowModelPicker(false)}
        />
      )}
      {extraFields?.find(f => f.name === 'dimensions') && (
        <Field label="Embedding dimensions" hint="Optional — vector size for embeddings">
          <input className="input" style={FORM_INPUT_STYLE} type="number" value={(form as any)['dimensions'] || ''}
            onChange={e => setField('dimensions', e.target.value)} placeholder="e.g. 1536" />
        </Field>
      )}
      <Field label="Max Input Tokens" hint="Optional — the model's maximum input/context token limit. Enforced as a hard ceiling on forwarded and classification request size.">
        <input className="input" style={FORM_INPUT_STYLE} type="number" value={form.max_input_token}
          onChange={e => setField('max_input_token', e.target.value)} placeholder="e.g. 1048576" min={1} />
      </Field>
      <Field label="Max Output Tokens" hint="Optional — the model's maximum output token limit. Used as a ceiling for forwarding, classification, and knowledge-development calls.">
        <input className="input" style={FORM_INPUT_STYLE} type="number" value={form.max_output_token}
          onChange={e => setField('max_output_token', e.target.value)} placeholder="e.g. 128000" min={1} />
      </Field>
      {form.vendor === 'openrouter' && (
        <>
          <Field label="Provider" hint="OpenRouter provider identifier">
            <input className="input" style={FORM_INPUT_STYLE} value={(form as any)['provider'] || ''}
              onChange={e => setField('provider', e.target.value)} placeholder="e.g. openai/gpt-4o" />
          </Field>
          <Field label="Allow fallbacks" hint="Allow OpenRouter to use alternative providers if primary is unavailable">
            <select className="select" style={FORM_INPUT_STYLE} value={(form as any)['allow_fallbacks'] === true ? 'true' : (form as any)['allow_fallbacks'] === false ? 'false' : ''}
              onChange={e => { const v = e.target.value; setField('allow_fallbacks', v === 'true' ? 'true' : v === 'false' ? 'false' : ''); }}>
              <option value="">Use OpenRouter default</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </Field>
          <Field label="Data collection" hint="Privacy setting for data retention and training">
            <select className="select" style={FORM_INPUT_STYLE} value={(form as any)['data_collection'] || 'deny'}
              onChange={e => setField('data_collection', e.target.value)}>
              <option value="deny">Deny (strict data retention only)</option>
              <option value="allow">Allow (providers may use data for training)</option>
            </select>
          </Field>
        </>
      )}
      <Field label="Notes" hint="Optional — usage notes or reminders">
        <textarea className="input" style={{ ...FORM_INPUT_STYLE, minHeight: 56 }} value={form.notes}
          onChange={e => setField('notes', e.target.value)}
          placeholder={extraFields?.some(f => f.name === 'dimensions')
            ? "e.g. Used for RAG embeddings, requires 1536 dimensions"
            : "e.g. Uses Claude 3.5 Sonnet, monitored via usage dashboard"} />
      </Field>
      <Field label="Timeout (ms)" hint="Max wait time before gateway cuts off">
        <input className="input" style={FORM_INPUT_STYLE} type="number" value={form.timeout_ms}
          onChange={e => setField('timeout_ms', parseInt(e.target.value) || 0)} />
      </Field>
      {extraFields?.filter(f => f.name !== 'dimensions').map(f => (
        <Field key={f.name} label={f.label}>
          <input className="input" style={FORM_INPUT_STYLE} type={f.type} value={(form as any)[f.name] || ''}
            onChange={e => setField(f.name, e.target.value)} placeholder={f.placeholder} />
        </Field>
      ))}
    </>
  )

  if (asDrawer) {
    return (
      <Drawer
        title={title}
        onClose={onClose}
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <div style={{ flex: 1 }} />
            <button type="submit" className="btn btn-primary" form="provider-form" disabled={busy}>
              {busy ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save changes' : labels.submitCreate}
            </button>
          </>
        }
      >
        <form id="provider-form" onSubmit={handleSubmit} style={{ padding: '16px 20px' }}>
          {formFields}
        </form>
      </Drawer>
    )
  }

  return (
    <FormModal
      title={title}
      onSubmit={handleSubmit}
      onClose={onClose}
      width={500}
      busy={busy}
      busyLabel={isEdit ? 'Saving…' : 'Creating…'}
      submitLabel={isEdit ? 'Save changes' : labels.submitCreate}
    >
      {formFields}
    </FormModal>
  )
}

// ── Recommended models modal ──────────────────────────────────────────────────

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${n % 1_000_000 === 0 ? n / 1_000_000 : (n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${n % 1_000 === 0 ? n / 1_000 : (n / 1_000).toFixed(1)}K`
  return String(n)
}

function RecommendedModelsModal({ vendor, catalog, onSelect, onClose }: {
  vendor: string; catalog: Record<string, RecommendedModel[]>
  onSelect: (model: RecommendedModel) => void; onClose: () => void
}) {
  const [search, setSearch] = React.useState('')
  const all: RecommendedModel[] = catalog[vendor] ?? []
  const filtered = search.trim()
    ? all.filter(m =>
        m.id.toLowerCase().includes(search.toLowerCase()) ||
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.provider.toLowerCase().includes(search.toLowerCase()) ||
        m.tags.some(t => t.includes(search.toLowerCase()))
      )
    : all

  const TAG_COLORS: Record<string, 'ok' | 'info' | 'warn' | 'danger'> = {
    recommended: 'ok', flagship: 'ok', fast: 'info', reasoning: 'info',
    'cost-effective': 'warn', 'open-source': 'warn', 'long-context': 'info',
  }

  return (
    <Drawer
      title="Recommended models"
      subtitle={`via ${vendor} · click a model to select it`}
      onClose={onClose}
      zIndex={320}
      width={580}
      footer={
        <div style={{ padding: '8px 0', fontSize: 11, color: 'var(--fg-tertiary)' }}>
          {filtered.length} of {all.length} models · IDs are passed directly to the OpenRouter API
        </div>
      }
    >
      <div style={{ padding: '10px 16px 0' }}>
        <input className="input" type="search" autoFocus
          placeholder="Filter by name, provider, or tag…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box' }} />
      </div>
      <div style={{ overflowY: 'auto', flex: 1, padding: '8px 16px 16px' }}>
        {filtered.length === 0 && (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--fg-tertiary)', fontSize: 13 }}>
            No models match "{search}"
          </div>
        )}
        {filtered.map(m => (
          <button key={m.id} type="button"
            onClick={() => { onSelect(m); onClose() }}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '10px 12px', marginBottom: 6, borderRadius: 6,
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-subtle, rgba(99,102,241,0.05))' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-surface)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</span>
              <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>by {m.provider}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                {m.dimensions != null && (
                  <span style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{m.dimensions.toLocaleString()}d</span>
                )}
                {m.max_input_token != null && (
                  <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', fontFamily: 'var(--font-mono)' }} title="Max input tokens">{formatTokenCount(m.max_input_token)} in</span>
                )}
                {m.max_output_token != null && (
                  <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', fontFamily: 'var(--font-mono)' }} title="Max output tokens">{formatTokenCount(m.max_output_token)} out</span>
                )}
              </div>
            </div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginBottom: 5 }}>{m.id}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-secondary)', marginBottom: 6 }}>{m.description}</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {m.tags.map(tag => (
                <Chip key={tag} kind={TAG_COLORS[tag] ?? 'info'} mono>{tag}</Chip>
              ))}
            </div>
          </button>
        ))}
      </div>
    </Drawer>
  )
}

// ── Classification detail drawer (read-only, no edit/remove) ──────────────────

export function ClassifierDetailDrawer({ provider, open, onClose }: {
  provider: {
    id: string; name: string; vendor: string; endpoint: string
    api_key?: string; notes?: string; model?: string; max_output_token?: number; max_input_token?: number; status: string
    timeout_ms: number; requests_24h: number; errors_24h: number; avg_latency_ms: number
    allowed_models?: string[]
  }
  open?: boolean
  onClose: () => void
}) {
  const [showKey, setShowKey] = React.useState(false)

  return (
    <Drawer
      open={open}
      icon={<Network w={14} style={{ color: 'var(--accent)' }} />}
      title={provider.name}
      subtitle={provider.id}
      onClose={onClose}
      footer={
        <>
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </>
      }
    >
      <div style={{ padding: '16px 20px' }}>
        <KV labelWidth={130} gap={8} style={{ marginBottom: 18 }} rows={[
          { label: 'Connection type', value: <Chip kind="ok" mono>{provider.vendor}</Chip> },
          { label: 'Status', value: <>
            {provider.status === 'healthy'   && <Chip kind="ok"   dot>healthy</Chip>}
            {provider.status === 'degraded'  && <Chip kind="warn" dot>degraded</Chip>}
            {provider.status === 'unhealthy' && <Chip kind="danger" dot>unhealthy</Chip>}
          </> },
          { label: 'Endpoint', value: <span style={{ fontSize: 12, wordBreak: 'break-all' }}>{provider.endpoint}</span>, mono: true },
          { label: 'API key', value: provider.api_key ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="mono" style={{ fontSize: 12 }}>{showKey ? provider.api_key : maskKey(provider.api_key)}</span>
              <button className="icon-btn" onClick={() => setShowKey(v => !v)} style={{ padding: 2 }} title={showKey ? 'Hide' : 'Show'}>
                {showKey ? <X w={12} /> : <Settings w={12} />}
              </button>
            </div>
          ) : <span style={{ color: 'var(--fg-tertiary)', fontSize: 12 }}>Not set</span> },
          { label: 'Model', value: provider.allowed_models?.length
            ? <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {provider.allowed_models.map(m => (
                  <span key={m} style={{
                    fontSize: 11, fontFamily: 'var(--font-mono)',
                    padding: '2px 6px', borderRadius: 4,
                    background: m === provider.model ? 'var(--accent-subtle, #e8f0fe)' : 'var(--bg-sunken)',
                    color: m === provider.model ? 'var(--accent)' : 'var(--fg-secondary)',
                    border: m === provider.model ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                    fontWeight: m === provider.model ? 700 : 400,
                  }}>
                    {m}
                    {m === provider.model && ' ★'}
                  </span>
                ))}
              </div>
            : <span style={{ fontSize: 12 }}>{provider.model || <span style={{ color: 'var(--fg-tertiary)' }}>Default</span>}</span> },
          { label: 'Max Input Tokens', value: <span style={{ fontSize: 12 }}>{provider.max_input_token != null ? formatTokenCount(provider.max_input_token) : <span style={{ color: 'var(--fg-tertiary)' }}>Unlimited</span>}</span>, mono: true },
          { label: 'Max Output Tokens', value: <span style={{ fontSize: 12 }}>{provider.max_output_token != null ? formatTokenCount(provider.max_output_token) : <span style={{ color: 'var(--fg-tertiary)' }}>Unlimited</span>}</span>, mono: true },
          { label: 'Notes', value: <span style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{provider.notes || <span style={{ color: 'var(--fg-tertiary)' }}>None</span>}</span>, mono: true },
          { label: 'Timeout', value: <span style={{ fontSize: 12 }}>{provider.timeout_ms}ms</span>, mono: true },
          { label: 'Requests (24h)', value: <span style={{ fontSize: 12 }}>{provider.requests_24h.toLocaleString()}</span>, mono: true },
          { label: 'Errors (24h)', value: <span style={{ fontSize: 12, color: provider.errors_24h > 0 ? 'var(--danger)' : 'inherit' }}>{provider.errors_24h}</span>, mono: true },
          { label: 'Avg Latency', value: <span style={{ fontSize: 12 }}>{provider.avg_latency_ms}ms</span>, mono: true },
        ]} />
      </div>
    </Drawer>
  )
}

// ── Provider detail drawer ────────────────────────────────────────────────────

export function ProviderDetailDrawer({ provider, open, onClose, onEdit, onDelete, onSetDefault }: {
  provider: {
    id: string; name: string; vendor: string; endpoint: string
    api_key?: string; notes?: string; model?: string; max_output_token?: number; max_input_token?: number; status: string
    timeout_ms: number; requests_24h: number; errors_24h: number; avg_latency_ms: number
    is_default?: boolean
    allowed_models?: string[]
  }
  open?: boolean
  onClose: () => void; onEdit: () => void; onDelete: () => void
  onSetDefault?: () => void
}) {
  const [showKey, setShowKey] = React.useState(false)
  const [settingDefault, setSettingDefault] = React.useState(false)

  async function handleSetDefault() {
    if (!onSetDefault) return
    setSettingDefault(true)
    try { await onSetDefault() } finally { setSettingDefault(false) }
  }

  return (
    <Drawer
      open={open}
      title={
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Network w={14} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>{provider.name}</span>
            {provider.is_default && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                background: 'var(--accent-subtle, #e8f0fe)', color: 'var(--accent)',
                border: '1px solid var(--accent)', lineHeight: '16px',
              }}>DEFAULT</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 2 }}>{provider.id}</div>
        </div>
      }
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={onDelete}>Remove</button>
          <div style={{ flex: 1 }} />
          {onSetDefault && !provider.is_default && (
            <button className="btn btn-ghost btn-sm" onClick={handleSetDefault} disabled={settingDefault}
              style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}>
              {settingDefault ? 'Setting…' : '★ Set as default'}
            </button>
          )}
          <button className="btn btn-primary" onClick={onEdit}>Edit</button>
        </>
      }
    >
      <div style={{ padding: '16px 20px' }}>
        <KV labelWidth={130} gap={8} style={{ marginBottom: 18 }} rows={[
          { label: 'Connection type', value: <Chip kind="ok" mono>{provider.vendor}</Chip> },
          { label: 'Default provider', value: provider.is_default
            ? <Chip kind="ok" dot>Yes — used when no provider is specified</Chip>
            : <span style={{ color: 'var(--fg-tertiary)', fontSize: 12 }}>No</span> },
          { label: 'Status', value: <>
            {provider.status === 'healthy'   && <Chip kind="ok"   dot>healthy</Chip>}
            {provider.status === 'degraded'  && <Chip kind="warn" dot>degraded</Chip>}
            {provider.status === 'unhealthy' && <Chip kind="danger" dot>unhealthy</Chip>}
          </> },
          { label: 'Endpoint', value: <span style={{ fontSize: 12, wordBreak: 'break-all' }}>{provider.endpoint}</span>, mono: true },
          { label: 'API key', value: provider.api_key ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="mono" style={{ fontSize: 12 }}>{showKey ? provider.api_key : maskKey(provider.api_key)}</span>
              <button className="icon-btn" onClick={() => setShowKey(v => !v)} style={{ padding: 2 }} title={showKey ? 'Hide' : 'Show'}>
                {showKey ? <X w={12} /> : <Settings w={12} />}
              </button>
            </div>
          ) : <span style={{ color: 'var(--fg-tertiary)', fontSize: 12 }}>Not set</span> },
          { label: 'Model', value: provider.allowed_models?.length
            ? <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {provider.allowed_models.map(m => (
                  <span key={m} style={{
                    fontSize: 11, fontFamily: 'var(--font-mono)',
                    padding: '2px 6px', borderRadius: 4,
                    background: m === provider.model ? 'var(--accent-subtle, #e8f0fe)' : 'var(--bg-sunken)',
                    color: m === provider.model ? 'var(--accent)' : 'var(--fg-secondary)',
                    border: m === provider.model ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                    fontWeight: m === provider.model ? 700 : 400,
                  }}>
                    {m}
                    {m === provider.model && ' ★'}
                  </span>
                ))}
              </div>
            : <span style={{ fontSize: 12 }}>{provider.model || <span style={{ color: 'var(--fg-tertiary)' }}>Default</span>}</span> },
          { label: 'Max Input Tokens', value: <span style={{ fontSize: 12 }}>{provider.max_input_token != null ? formatTokenCount(provider.max_input_token) : <span style={{ color: 'var(--fg-tertiary)' }}>Unlimited</span>}</span>, mono: true },
          { label: 'Max Output Tokens', value: <span style={{ fontSize: 12 }}>{provider.max_output_token != null ? formatTokenCount(provider.max_output_token) : <span style={{ color: 'var(--fg-tertiary)' }}>Unlimited</span>}</span>, mono: true },
          { label: 'Notes', value: <span style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{provider.notes || <span style={{ color: 'var(--fg-tertiary)' }}>None</span>}</span>, mono: true },
          { label: 'Timeout', value: <span style={{ fontSize: 12 }}>{provider.timeout_ms}ms</span>, mono: true },
          { label: 'Requests (24h)', value: <span style={{ fontSize: 12 }}>{provider.requests_24h.toLocaleString()}</span>, mono: true },
          { label: 'Errors (24h)', value: <span style={{ fontSize: 12, color: provider.errors_24h > 0 ? 'var(--danger)' : 'inherit' }}>{provider.errors_24h}</span>, mono: true },
          { label: 'Avg Latency', value: <span style={{ fontSize: 12 }}>{provider.avg_latency_ms}ms</span>, mono: true },
        ]} />
      </div>
    </Drawer>
  )
}

// ── Provider test modal ───────────────────────────────────────────────────────

const DEFAULT_TEST_PROMPT = "Hello! Please respond with a brief confirmation that you are working correctly."

interface TestResult {
  success: boolean
  latency_ms: number
  response?: string
  error?: string
}

export function ProviderTestModal({ provider, apiBase, onClose }: {
  provider: { id: string; name: string; vendor: string; endpoint: string; status: string }
  apiBase: string   // e.g. '/api/providers' or '/api/classifiers'
  onClose: () => void
}) {
  const [prompt, setPrompt] = React.useState(DEFAULT_TEST_PROMPT)
  const [running, setRunning] = React.useState(false)
  const [result, setResult] = React.useState<TestResult | null>(null)

  async function runTest() {
    setRunning(true)
    setResult(null)
    try {
      const res = await apiFetch<{ data: TestResult }>(`${apiBase}/${provider.id}/test`, {
        method: 'POST',
        body: JSON.stringify({ prompt }),
      })
      setResult(res.data)
    } catch (err) {
      setResult({ success: false, latency_ms: 0, error: (err as Error).message })
    } finally {
      setRunning(false)
    }
  }

  return (
    <Drawer
      title="Test provider"
      onClose={onClose}
      width={560}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={runTest} disabled={running || !prompt.trim()}>
            {running
              ? <><Play w={13} /> Running…</>
              : <><Play w={13} /> Run test</>}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 20px' }}>
        {/* Provider info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-sunken)', borderRadius: 6 }}>
          <Network w={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{provider.name}</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{provider.endpoint}</div>
          </div>
          <Chip kind="ok" mono>{provider.vendor}</Chip>
        </div>

        {/* Prompt */}
        <div>
          <label className="label" style={{ display: 'block', marginBottom: 6 }}>Test prompt</label>
          <textarea
            className="input"
            style={{ ...FORM_INPUT_STYLE, minHeight: 88, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12 }}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            disabled={running}
          />
        </div>

        {/* Result */}
        {result && (
          <div style={{
            borderRadius: 6,
            border: `1px solid ${result.success ? 'var(--ok, #76B400)' : 'var(--danger)'}`,
            background: result.success ? 'var(--ok-bg, rgba(118,180,0,0.12))' : 'var(--danger-bg)',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 14px',
              borderBottom: `1px solid ${result.success ? 'var(--ok, #76B400)' : 'var(--danger)'}`,
              background: result.success ? 'rgba(26,122,74,0.08)' : 'rgba(220,38,38,0.08)',
            }}>
              {result.success
                ? <Check w={14} style={{ color: 'var(--ok, #76B400)', flexShrink: 0 }} />
                : <AlertTri w={14} style={{ color: 'var(--danger)', flexShrink: 0 }} />}
              <span style={{ fontWeight: 600, fontSize: 13, color: result.success ? 'var(--ok, #76B400)' : 'var(--danger)' }}>
                {result.success ? 'Success' : 'Failed'}
              </span>
              {result.latency_ms > 0 && (
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginLeft: 'auto' }}>
                  {result.latency_ms}ms
                </span>
              )}
            </div>
            <pre style={{
              margin: 0, padding: '12px 14px',
              fontSize: 12, fontFamily: 'var(--font-mono)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              color: result.success ? 'var(--fg-primary, #111)' : 'var(--danger)',
              background: result.success ? 'var(--bg-surface, #fff)' : undefined,
              maxHeight: 260, overflowY: 'auto',
            }}>
              {result.response ?? result.error ?? '(empty response)'}
            </pre>
          </div>
        )}
      </div>
    </Drawer>
  )
}

// ── Embedding test modal ──────────────────────────────────────────────────────

export interface EmbeddingTestResult {
  success: boolean
  latency_ms: number
  dimensions?: number
  preview?: number[]
  error?: string
}

export function EmbeddingTestModal({ provider, onClose }: {
  provider: { id: string; name: string; vendor: string; endpoint: string; model?: string | null }
  onClose: () => void
}) {
  const [prompt, setPrompt] = React.useState('Test embedding.')
  const [running, setRunning] = React.useState(false)
  const [result, setResult] = React.useState<EmbeddingTestResult | null>(null)

  async function runTest() {
    setRunning(true)
    setResult(null)
    try {
      const res = await apiFetch<{ data: EmbeddingTestResult }>('/api/embedding-providers/' + provider.id + '/test', {
        method: 'POST',
        body: JSON.stringify({ text: prompt }),
      })
      setResult(res.data)
    } catch (err) {
      setResult({ success: false, latency_ms: 0, error: (err as Error).message })
    } finally {
      setRunning(false)
    }
  }

  return (
    <Drawer
      title="Test embedding provider"
      onClose={onClose}
      width={560}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className={`btn ${running ? 'btn-accent' : 'btn-primary'}`} onClick={runTest} disabled={running || !prompt.trim()}>
            {running
              ? <><svg style={{ animation: 'spin 1s linear infinite' }} width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" /></svg> Running…</>
              : <><Play w={13} /> Run test</>}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 20px' }}>
        {/* Provider info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-sunken)', borderRadius: 6 }}>
          <Network w={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{provider.name}</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{provider.endpoint}</div>
          </div>
          {provider.model && (
            <Chip kind="ok" mono>{provider.model}</Chip>
          )}
        </div>

        {/* Prompt */}
        <div>
          <label className="label" style={{ display: 'block', marginBottom: 6 }}>Test text</label>
          <textarea
            className="input"
            style={{ ...FORM_INPUT_STYLE, minHeight: 88, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12 }}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            disabled={running}
          />
        </div>

        {/* Result */}
        {result && (
          <div style={{
            borderRadius: 6,
            border: `1px solid ${result.success ? 'var(--ok, #76B400)' : 'var(--danger)'}`,
            background: result.success ? 'var(--ok-bg, rgba(118,180,0,0.12))' : 'var(--danger-bg)',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 14px',
              borderBottom: `1px solid ${result.success ? 'var(--ok, #76B400)' : 'var(--danger)'}`,
              background: result.success ? 'rgba(26,122,74,0.08)' : 'rgba(220,38,38,0.08)',
            }}>
              {result.success
                ? <Check w={14} style={{ color: 'var(--ok, #76B400)', flexShrink: 0 }} />
                : <AlertTri w={14} style={{ color: 'var(--danger)', flexShrink: 0 }} />}
              <span style={{ fontWeight: 600, fontSize: 13, color: result.success ? 'var(--ok, #76B400)' : 'var(--danger)' }}>
                {result.success ? 'Success' : 'Failed'}
              </span>
              {result.latency_ms > 0 && (
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginLeft: 'auto' }}>
                  {result.latency_ms}ms
                </span>
              )}
            </div>

            {/* Embedding stats */}
            {result.success && result.dimensions !== undefined && (
              <div style={{ display: 'flex', gap: 16, padding: '12px 14px', borderBottom: '1px solid var(--ok, #76B400)' }}>
                <div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>{result.dimensions}</div>
                  <div className="label" style={{ fontSize: 10 }}>Dimensions</div>
                </div>
              </div>
            )}

            {/* Preview or error */}
            {result.success && result.preview && (
              <pre style={{
                margin: 0, padding: '12px 14px',
                fontSize: 12, fontFamily: 'var(--font-mono)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                color: 'var(--fg-primary)',
                maxHeight: 260, overflowY: 'auto',
              }}>
                {result.preview.map((v, i) => `${i}:${(v as number).toFixed(4)} `).join('')}
              </pre>
            )}
            {result.error && (
              <pre style={{
                margin: 0, padding: '12px 14px',
                fontSize: 12, fontFamily: 'var(--font-mono)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                color: 'var(--danger)',
              }}>
                {result.error}
              </pre>
            )}
          </div>
        )}
      </div>
    </Drawer>
  )
}

function maskKey(key: string): string {
  if (key.length <= 8) return '••••'
  return key.slice(0, 4) + '••' + key.slice(-4)
}

import { Field } from '../../components/ui'

