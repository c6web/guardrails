import { useEffect, useMemo, useState } from 'react'
import { AlertTri, Check, Code, Copy, LayersRi, Network, Play } from '../components/ui/Icons'
import { PageHeader, Breadcrumbs, Chip } from '../components/ui'
import { getGateways, type GatewayInstance } from '../api/gateways'
import { getApiKeys, revealApiKey, type UIKey } from '../api/apikeys'
import { getApps } from '../api/apps'
import { testGatewayEmbedding, type EmbeddingTestResult, type EmbeddingResultData } from '../api/embeddings'
import { getEmbeddingProviderConfig, getEmbeddingProviders, type EmbeddingProvider, type EmbeddingProviderConfig } from '../api/embeddingProviders'
import type { App } from '../types'
import { GatewayEmbeddingTestCodePanel } from './components/GatewayEmbeddingTestCodePanel'
import EmbeddingTestProviderPanel from './components/EmbeddingTestProviderPanel'

const SAMPLE_TEXTS = [
  { label: '1.  Short — greeting',               text: 'Hello world' },
  { label: '2.  Short — code (fibonacci)',        text: 'def fibonacci(n): return n if n <= 1 else fibonacci(n-1) + fibonacci(n-2)' },
  { label: '3.  Short — factual question',         text: 'What is the capital of France?' },
  { label: '4.  Medium — embeddings explanation',  text: 'Text embeddings convert natural language into dense vector representations that capture semantic meaning, enabling similarity search and clustering.' },
  { label: '5.  Medium — poem ("Fog")',            text: 'The fog comes on little cat feet. It sits looking over harbor and city on silent haunches and then moves on.' },
  { label: '6.  Medium — business description',    text: 'Our platform provides real-time monitoring and alerting for AI application security, with automatic threat detection and policy enforcement.' },
  { label: '7.  Long — ML concepts paragraph',     text: 'Machine learning embeddings are a way to convert categorical data, such as words or sentences, into continuous vector spaces. Unlike one-hot encoding which produces sparse, high-dimensional vectors, embeddings learn dense representations where similar items are close together in the vector space. This makes them particularly useful for semantic search, clustering, and as features for downstream ML tasks. The dimensionality of the embedding space is a hyperparameter that trades off capacity for computational efficiency.' },
  { label: '8.  Semantic pair A — warm weather',   text: 'The weather today is warm and sunny with clear skies.' },
  { label: '9.  Semantic pair B — sunny day',      text: 'It is a bright and sunny day with warm temperatures outside.' },
  { label: '10. Dissimilar — integral calculus',   text: 'The integral of x squared from 0 to 1 equals one third.' },
  { label: '11. Multilingual — Spanish (ML)',      text: 'El aprendizaje automático está transformando la forma en que procesamos y entendemos el lenguaje natural.' },
  { label: '12. Multilingual — French (embeddings)', text: 'Les embeddings de texte permettent de représenter le sens sémantique des phrases dans un espace vectoriel continu.' },
  { label: '13. PII-like — email + phone',         text: 'My email is john.doe@company.com and my phone is 555-0123.' },
]

const GUIDE_STEPS = [
  'Pick a gateway and the API key of the app whose providers you want to test.',
  'Enter text — or load a sample — and choose single or array mode.',
  'Inspect the resulting embedding vector, dimensions, and token usage.',
]

function vecPreview(vec: number[], showFull: boolean): string {
  if (!vec || vec.length === 0) return '[]'
  const display = showFull ? vec : vec.slice(0, 10)
  const parts = display.map(v => v.toFixed(6))
  const suffix = !showFull && vec.length > 10 ? `, … (${vec.length} total)` : ''
  return `[${parts.join(', ')}${suffix}]`
}

export default function GatewayEmbeddingTestPage() {
  const [gateways, setGateways]   = useState<GatewayInstance[]>([])
  const [apiKeys, setApiKeys]     = useState<UIKey[]>([])
  const [apps, setApps]           = useState<App[]>([])
  const [selectedGatewayId, setSelectedGatewayId] = useState('')
  const [selectedKeyId, setSelectedKeyId] = useState('')
  const [inputMode, setInputMode] = useState<'single' | 'array'>('single')
  const [inputSingle, setInputSingle] = useState('')
  const [inputList, setInputList] = useState<string[]>([''])
  const [model, setModel]         = useState('')
  const [modelAutoFilled, setModelAutoFilled] = useState(false)
  const [running, setRunning]     = useState(false)
  const [result, setResult]       = useState<EmbeddingTestResult | null>(null)
  const [attempted, setAttempted] = useState(false)
  const [showCode, setShowCode]   = useState(false)
  const [revealedKeyValue, setRevealedKeyValue] = useState<string | null>(null)
  const [expandedVectors, setExpandedVectors] = useState<Set<number>>(new Set())
  const [showRawJson, setShowRawJson] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [embedProviders, setEmbedProviders] = useState<EmbeddingProvider[]>([])
  const [embedConfig, setEmbedConfig] = useState<EmbeddingProviderConfig | null>(null)

  useEffect(() => {
    getGateways().then(setGateways).catch(() => {})
    getApiKeys().then(keys => setApiKeys(keys.filter(k => k.status === 'active'))).catch(() => {})
    getApps().then(setApps).catch(() => {})
    Promise.all([
      getEmbeddingProviders().catch(() => [] as EmbeddingProvider[]),
      getEmbeddingProviderConfig().catch(() => null),
    ]).then(([p, c]) => {
      setEmbedProviders(p)
      setEmbedConfig(c)
    })
  }, [])

  const primaryProvider = useMemo(() => {
    if (!embedConfig?.primary_id) return null
    return embedProviders.find(p => p.id === embedConfig.primary_id) ?? null
  }, [embedConfig, embedProviders])

  useEffect(() => {
    if (primaryProvider && !modelAutoFilled) {
      const m = primaryProvider.model
      if (m) { setModel(m); setModelAutoFilled(true) }
    }
  }, [primaryProvider])

  useEffect(() => {
    if (gateways.length === 1 && !selectedGatewayId) setSelectedGatewayId(gateways[0].id)
  }, [gateways, selectedGatewayId])

  useEffect(() => {
    if (apiKeys.length === 1 && !selectedKeyId) setSelectedKeyId(apiKeys[0].id)
  }, [apiKeys, selectedKeyId])

  const appById = useMemo(() => new Map(apps.map(a => [a.id, a])), [apps])
  const selectedGateway = gateways.find(g => g.id === selectedGatewayId) ?? null
  const selectedKey     = apiKeys.find(k => k.id === selectedKeyId) ?? null
  const selectedApp      = selectedKey ? appById.get(selectedKey.appId) ?? null : null
  void selectedApp

  const effectiveInput: string | string[] = inputMode === 'single'
    ? inputSingle
    : inputList.filter(s => s.trim() !== '')

  const canRun = !!selectedGateway && !!selectedKey &&
    (inputMode === 'single' ? !!inputSingle.trim() : inputList.some(s => s.trim() !== '')) && !running

  function keyOptionLabel(k: UIKey): string {
    const app = appById.get(k.appId)
    const appLabel = app?.name ?? k.appName ?? 'no app'
    return app ? `${k.name} · ${appLabel}` : `${k.name} · ${appLabel}`
  }

  function handleKeyChange(id: string) {
    setSelectedKeyId(id)
    setRevealedKeyValue(null)
    setAttempted(false)
  }

  const missingFields = useMemo(() => {
    const missing: string[] = []
    if (!selectedGateway) missing.push('Gateway')
    if (!selectedKey) missing.push('API Key')
    const hasInput = inputMode === 'single' ? !!inputSingle.trim() : inputList.some(s => s.trim() !== '')
    if (!hasInput) missing.push('input text')
    return missing
  }, [selectedGateway, selectedKey, inputMode, inputSingle, inputList])

  function loadSample(idx: string) {
    const i = parseInt(idx, 10)
    if (isNaN(i) || i < 0) return
    const s = SAMPLE_TEXTS[i]
    if (!s) return
    if (inputMode === 'single') {
      setInputSingle(s.text)
    } else {
      const list = [...inputList]
      list[0] = s.text
      setInputList(list)
    }
    setResult(null)
    setAttempted(false)
  }

  function setArrayItem(index: number, value: string) {
    const next = [...inputList]
    next[index] = value
    setInputList(next)
    setResult(null)
    setAttempted(false)
  }

  function addArrayItem() {
    setInputList([...inputList, ''])
  }

  function removeArrayItem(index: number) {
    if (inputList.length <= 1) return
    setInputList(inputList.filter((_, i) => i !== index))
    setResult(null)
    setAttempted(false)
  }

  function toggleVectorExpand(idx: number) {
    setExpandedVectors(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }

  async function copyVector(vec: number[], idx: number) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(vec))
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 2000)
    } catch {}
  }

  async function runTest() {
    if (missingFields.length > 0) { setAttempted(true); return }
    if (!selectedGateway || !selectedKey) { setRunning(false); return }
    setRunning(true)
    setResult(null)
    setExpandedVectors(new Set())
    setShowRawJson(false)
    let apiKey = revealedKeyValue
    if (!apiKey) {
      try {
        const data = await revealApiKey(selectedKey.id)
        apiKey = data.full_key
        setRevealedKeyValue(apiKey)
      } catch {
        setResult({ success: false, latency_ms: 0, error: 'Could not retrieve API key — check permissions' })
        setRunning(false)
        return
      }
    }
    const r = await testGatewayEmbedding(selectedGateway, effectiveInput, model || undefined, apiKey)
    setResult(r)
    setRunning(false)
  }

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="gateway-embedding-test" />
      <PageHeader title="Gateway Embedding Testing" subtitle="Send text through a gateway's embedding endpoint and inspect the generated vector representations" />

      {/* Guidance banner */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 14, alignItems: 'flex-start', background: 'var(--bg-sunken)' }}>
        <LayersRi w={18} style={{ color: 'var(--accent)', marginTop: 2, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Test your gateway's embedding pipeline</div>
          <div style={{ fontSize: 12, color: 'var(--fg-secondary)', lineHeight: 1.5, marginBottom: 8 }}>
            This page sends text to the gateway's <code className="mono" style={{ fontSize: 11 }}>/v1/embeddings</code> endpoint
            using a connected app's API key — exactly as your production traffic would. Use it to verify that the embedding
            provider chain is working and inspect the vector output.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {GUIDE_STEPS.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--fg-secondary)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: 'var(--accent)', color: '#0D1117', fontWeight: 700, fontSize: 10, flexShrink: 0 }}>{i + 1}</span>
                {s}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Studio grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(300px, 1fr)', gap: 16, alignItems: 'start' }}>

        {/* ── Composer column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="card-hdr">
              <h3>Composer</h3>
              <div className="right">
                <button
                  className={`btn btn-ghost${showCode ? ' active' : ''}`}
                  style={{ height: 24, fontSize: 11, gap: 5, background: showCode ? 'var(--bg-hover)' : undefined, color: showCode ? 'var(--fg-primary)' : undefined }}
                  onClick={() => setShowCode(v => !v)}
                >
                  <Code w={12} /> Code
                </button>
              </div>
            </div>
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Selectors */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="label" style={{ display: 'block', marginBottom: 5 }}>Gateway</label>
                  <select className="input" style={{ width: '100%' }} value={selectedGatewayId}
                    onChange={e => { setSelectedGatewayId(e.target.value); setResult(null); setAttempted(false) }} disabled={running}>
                    <option value="">Select gateway…</option>
                    {gateways.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" style={{ display: 'block', marginBottom: 5 }}>API Key · App</label>
                  <select className="input" style={{ width: '100%' }} value={selectedKeyId}
                    onChange={e => { handleKeyChange(e.target.value); setResult(null); setAttempted(false) }} disabled={running}>
                    <option value="">Select API key…</option>
                    {apiKeys.map(k => <option key={k.id} value={k.id}>{keyOptionLabel(k)}</option>)}
                  </select>
                </div>
              </div>

              {/* Endpoint line */}
              {selectedGateway && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-sunken)', borderRadius: 6 }}>
                  <Network w={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <code className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedGateway.url}/v1/embeddings
                  </code>
                  {selectedKey && <Chip kind={revealedKeyValue ? 'ok' : 'muted'}>{revealedKeyValue ? 'Key ready' : 'Key selected'}</Chip>}
                </div>
              )}

              {/* Model name */}
              <div>
                <label className="label" style={{ display: 'block', marginBottom: 5 }}>Model</label>
                <input type="text" className="input mono" style={{ width: '100%' }}
                  placeholder={primaryProvider?.model ? `Empty uses default: ${primaryProvider.model}` : 'Leave empty for default'}
                  value={model} onChange={e => { setModel(e.target.value); setModelAutoFilled(true); setResult(null) }} disabled={running} />
              </div>

              {/* Input mode toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label className="label" style={{ whiteSpace: 'nowrap', marginBottom: 0 }}>Input mode:</label>
                <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border-subtle)', borderRadius: 6, overflow: 'hidden' }}>
                  <button className={`btn btn-ghost${inputMode === 'single' ? ' active' : ''}`}
                    style={{ borderRadius: 0, padding: '4px 14px', fontSize: 11, background: inputMode === 'single' ? 'var(--bg-hover)' : undefined, color: inputMode === 'single' ? 'var(--fg-primary)' : 'var(--fg-tertiary)' }}
                    onClick={() => { setInputMode('single'); setResult(null); setAttempted(false) }} disabled={running}>
                    Single
                  </button>
                  <button className={`btn btn-ghost${inputMode === 'array' ? ' active' : ''}`}
                    style={{ borderRadius: 0, padding: '4px 14px', fontSize: 11, background: inputMode === 'array' ? 'var(--bg-hover)' : undefined, color: inputMode === 'array' ? 'var(--fg-primary)' : 'var(--fg-tertiary)', borderLeft: '1px solid var(--border-subtle)' }}
                    onClick={() => { setInputMode('array'); setResult(null); setAttempted(false) }} disabled={running}>
                    Array
                  </button>
                </div>
                {inputMode === 'array' && (
                  <span className="caption" style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>
                    Each input gets its own embedding
                  </span>
                )}
              </div>

              {/* Sample loader */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label className="label" style={{ whiteSpace: 'nowrap', marginBottom: 0 }}>Load sample:</label>
                <select className="input" style={{ flex: 1 }} defaultValue="" onChange={e => loadSample(e.target.value)} disabled={running}>
                  <option value="">— pick a sample text —</option>
                  {SAMPLE_TEXTS.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
                </select>
              </div>

              {/* Input editor(s) */}
              {inputMode === 'single' ? (
                <div>
                  <label className="label" style={{ display: 'block', marginBottom: 6 }}>Input text</label>
                  <textarea className="input"
                    style={{ width: '100%', boxSizing: 'border-box', minHeight: 120, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.5 }}
                    placeholder="Enter text to embed…"
                    value={inputSingle} onChange={e => { setInputSingle(e.target.value); setResult(null); setAttempted(false) }} disabled={running} />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label className="label" style={{ display: 'block', marginBottom: 0 }}>Input texts</label>
                  {inputList.map((text, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, position: 'relative' }}>
                        <textarea className="input"
                          style={{ width: '100%', boxSizing: 'border-box', minHeight: 60, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.5, paddingTop: 20 }}
                          placeholder={`Input #${i + 1}…`}
                          value={text} onChange={e => setArrayItem(i, e.target.value)} disabled={running} />
                        <span style={{ position: 'absolute', top: 3, left: 8, fontSize: 10, color: 'var(--fg-tertiary)' }}>#{i + 1}</span>
                      </div>
                      {inputList.length > 1 && (
                        <button className="btn btn-ghost" style={{ height: 60, padding: '0 8px', fontSize: 14, color: 'var(--fg-tertiary)' }}
                          onClick={() => removeArrayItem(i)} disabled={running}>×</button>
                      )}
                    </div>
                  ))}
                  <button className="btn btn-ghost" style={{ alignSelf: 'flex-start', fontSize: 11, padding: '4px 12px', gap: 4 }}
                    onClick={addArrayItem} disabled={running}>
                    + Add input
                  </button>
                </div>
              )}

              {/* Toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }} />
                <button className="btn btn-primary" onClick={runTest}
                  style={{ opacity: canRun && !running ? 1 : 0.5, cursor: canRun && !running ? 'pointer' : 'not-allowed' }}>
                  {running
                    ? <>Running… (up to 1 min)</>
                    : <><Play w={13} /> Run test</>}
                </button>
                {attempted && missingFields.length > 0 && (
                  <div style={{ width: '100%', fontSize: 12, color: 'var(--warn, #D9A32E)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTri w={13} />
                    <span>Please select {missingFields.join(' and ')} before running.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Code examples panel */}
            {showCode && (
              <GatewayEmbeddingTestCodePanel
                url={selectedGateway?.url ?? ''}
                apiKey={revealedKeyValue ?? '<YOUR_API_KEY>'}
                input={effectiveInput || 'Your text here'}
                model={model || undefined}
              />
            )}
          </div>

          {/* Response */}
          {result && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card-hdr">
                <h3>Response</h3>
                <div className="right">
                  {result.success && result.raw_json && (
                    <button className={`btn btn-ghost${showRawJson ? ' active' : ''}`}
                      style={{ height: 24, fontSize: 11, background: showRawJson ? 'var(--bg-hover)' : undefined }}
                      onClick={() => setShowRawJson(v => !v)}>
                      <Code w={11} /> Raw JSON
                    </button>
                  )}
                </div>
              </div>

              {/* Status bar */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', flexWrap: 'wrap',
                borderBottom: showRawJson ? 'none' : '1px solid var(--border-subtle)',
                background: result.success ? 'rgba(118,180,0,0.06)' : 'rgba(220,38,38,0.06)',
              }}>
                {result.success
                  ? <Check w={14} style={{ color: 'var(--ok, #76B400)', flexShrink: 0 }} />
                  : <AlertTri w={14} style={{ color: 'var(--danger)', flexShrink: 0 }} />}
                <span style={{ fontWeight: 600, fontSize: 13, color: result.success ? 'var(--ok, #76B400)' : 'var(--danger)' }}>
                  {result.success ? 'Embedding generated' : 'Error'}
                </span>
                {result.model && (
                  <Chip kind="muted" mono>{result.model}</Chip>
                )}
                {result.usage && (
                  <Chip kind="muted" mono>{result.usage.prompt_tokens} tokens</Chip>
                )}
                {result.latency_ms > 0 && (
                  <span className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginLeft: 'auto' }}>{result.latency_ms}ms</span>
                )}
              </div>

              {/* Raw JSON */}
              {showRawJson && result.raw_json && (
                <pre style={{
                  margin: 0, padding: '14px 18px', fontSize: 11, fontFamily: 'var(--font-mono)',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  color: 'var(--fg-primary)',
                  maxHeight: 400, overflowY: 'auto',
                  borderBottom: '1px solid var(--border-subtle)',
                }}>
                  {result.raw_json}
                </pre>
              )}

              {/* Embedding results */}
              {result.success && result.data && !showRawJson && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {result.data.map((item: EmbeddingResultData, idx: number) => {
                    const vec = item.embedding
                    const expanded = expandedVectors.has(idx)
                    const dims = vec?.length ?? 0
                    return (
                      <div key={idx} style={{
                        padding: '12px 18px',
                        borderBottom: idx < result.data!.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <Chip kind="info" mono>#{item.index}</Chip>
                          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{dims} dimensions</span>
                          <div style={{ flex: 1 }} />
                          <button className="btn btn-ghost" style={{ height: 22, fontSize: 10, gap: 4 }}
                            onClick={() => toggleVectorExpand(idx)}>
                            {expanded ? 'Collapse' : 'Show full'}
                          </button>
                          <button className="btn btn-ghost" style={{ height: 22, fontSize: 10, gap: 4 }}
                            onClick={() => copyVector(vec, idx)}>
                            {copiedIdx === idx ? <Check w={10} style={{ color: 'var(--ok)' }} /> : <Copy w={10} />}
                            {copiedIdx === idx ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        <pre className="mono" style={{
                          margin: 0, fontSize: 11, lineHeight: 1.6,
                          color: 'var(--fg-secondary)',
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          maxHeight: expanded ? 600 : 80,
                          overflowY: expanded ? 'auto' : 'hidden',
                        }}>
                          {vecPreview(vec, expanded)}
                        </pre>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Error */}
              {!result.success && (
                <pre style={{
                  margin: 0, padding: '14px 18px', fontSize: 12, fontFamily: 'var(--font-mono)',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  color: 'var(--danger)',
                  maxHeight: 320, overflowY: 'auto',
                }}>
                  {result.error ?? '(unknown error)'}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* ── Provider Info column ── */}
        <EmbeddingTestProviderPanel />
      </div>
    </div>
  )
}
