import React from 'react'
import { Check, AlertTri, Eye, EyeOff } from '../components/ui/Icons'
import { PageHeader, Breadcrumbs, LoadingState } from '../components/ui'
import { CodeSnippet } from '../components/ui/CodeSnippet'
import {
  getContentQualityProvider, updateContentQualityProvider, getContentQualityVendors,
  testContentQualityProviderConnection, evaluateContentQualityTest,
  type ContentQualityProviderConfig, type ContentQualityVendor, type ContentQualityTestResult,
} from '../api/contentQualityProvider'
import { getAiProviders, type AiProvider } from '../api/aiProviders'

interface SamplePair { label: string; context: string; response: string; expected: { groundedness: string; relevance: string; hallucination: string } }
const SAMPLE_PAIRS: SamplePair[] = [
  { label: 'Correct grounded', context: 'What is the capital of France?\nParis has been the capital of France since the 10th century.', response: 'The capital of France is Paris.', expected: { groundedness: '≥90%', relevance: '≥90%', hallucination: '≤10%' } },
  { label: 'Hallucinated', context: 'Who won the 2024 World Series?\nThe 2024 World Series was won by the Los Angeles Dodgers, defeating the New York Yankees 4 games to 1.', response: 'The New York Yankees won the 2024 World Series in 7 games.', expected: { groundedness: '≤20%', relevance: '≤30%', hallucination: '≥80%' } },
  { label: 'Off-topic', context: 'How do I reset my password?\nGo to Settings → Security → Reset Password, enter your email and follow the link.', response: 'Paris is known for its beautiful architecture, museums, and cuisine. The Eiffel Tower is a popular tourist destination.', expected: { groundedness: '≤10%', relevance: '≤10%', hallucination: '≥90%' } },
  { label: 'Concise correct', context: 'What is 2+2?\n2+2 equals 4.', response: '2+2 equals 4.', expected: { groundedness: '≥90%', relevance: '≥90%', hallucination: '≤10%' } },
  { label: 'Mixed accuracy', context: 'Tell me about Earth.\nEarth is the third planet from the Sun. It has one moon. The atmosphere is 78% nitrogen and 21% oxygen.', response: 'Earth is the third planet from the Sun. It has two moons. The atmosphere is mostly nitrogen and oxygen.', expected: { groundedness: '≈67%', relevance: '≥90%', hallucination: '≈33%' } },
]

const TAB_STYLE = (active: boolean): React.CSSProperties => ({
  padding: '10px 20px', cursor: 'pointer', fontWeight: active ? 600 : 400, fontSize: 13,
  borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
  color: active ? 'var(--fg)' : 'var(--fg-tertiary)',
  transition: 'color 150ms, border-color 150ms',
})

function ReasonView({ reason }: { reason: string }) {
  // Strip Python dict wrapper {'reasons': '...'} — handle anywhere in text
  // Convert literal \n sequences to real newlines (API may return escaped newlines)
  let clean = reason.replace(/\{'reasons':\s*'/g, '').replace(/'}/g, '').replace(/\\n/g, '\n').trim()

  // Parse structured fields from a text block
  function parseBlock(text: string) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    return {
      statement: lines.find(l => /^STATEMENT\s+\d+:/.test(l))?.replace(/^STATEMENT\s+\d+:\s*/, '').trim(),
      criteria: lines.find(l => /^Criteria\s*:/.test(l))?.replace(/^Criteria\s*:\s*/, '').trim(),
      evidence: lines.find(l => /^Supporting Evidence\s*:/.test(l))?.replace(/^Supporting Evidence\s*:\s*/, '').trim(),
      score: lines.filter(l => /^Score\s*:/.test(l)).pop()?.replace(/^Score\s*:\s*/, '').trim(),
      narrative: lines.filter(l => !/^(STATEMENT\s+\d+:|Criteria|Supporting Evidence|Score|Groundedness Scan|Relevance Assessment)\s*:?/i.test(l)).join('\n').trim(),
    }
  }

  function scoreColor(score: string | undefined, isRelevance: boolean): string {
    if (!score) return 'var(--fg-tertiary)'
    const num = parseFloat(score) || 0
    const ratio = isRelevance ? (num / 3) : num
    return ratio >= 0.7 ? 'var(--ok, #76B400)' : ratio > 0 ? 'var(--warn, #D9A32E)' : 'var(--danger)'
  }

  function BlockCard({ block, isRelevance }: { block: ReturnType<typeof parseBlock>; isRelevance: boolean }) {
    const sColor = scoreColor(block.score, isRelevance)
    return (
      <div style={{ fontSize: 11, lineHeight: 1.5, padding: '8px 10px', borderLeft: `3px solid ${sColor}`, background: 'var(--bg-surface)', borderRadius: '0 4px 4px 0', marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {block.statement && <div style={{ fontWeight: 600, marginBottom: 2, color: 'var(--fg)' }}>{block.statement}</div>}
            {block.criteria && <div style={{ color: 'var(--fg-secondary)', marginBottom: 1, fontSize: 10 }}><span style={{ fontWeight: 500 }}>Criteria:</span> {block.criteria}</div>}
            {block.evidence && <div style={{ color: 'var(--fg-tertiary)', marginBottom: 1, fontSize: 10, whiteSpace: 'pre-wrap' }}><span style={{ fontWeight: 500 }}>Evidence:</span> {block.evidence}</div>}
            {block.narrative && <div style={{ color: 'var(--fg-tertiary)', marginTop: 2, whiteSpace: 'pre-wrap' }}>{block.narrative}</div>}
          </div>
          {block.score && (
            <div style={{ flexShrink: 0, padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: sColor, color: '#fff', lineHeight: '18px', whiteSpace: 'nowrap' }}>
              {block.score}
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderSection(heading: string, content: string, isRelevance: boolean) {
    // Find STATEMENT blocks within this section's content
    const stmtRegex = /STATEMENT\s+\d+:[\s\S]*?Score:\s*.+/gi
    const stmtMatches = [...content.matchAll(stmtRegex)]
    const stmtTexts = stmtMatches.map(m => m[0].trim())
    const afterStmts = content.replace(stmtRegex, '').trim()

    // Parse any non-STATEMENT structured content
    const nonStmtParsed = parseBlock(afterStmts)
    const hasNonStmt = nonStmtParsed.criteria || nonStmtParsed.evidence || nonStmtParsed.score || nonStmtParsed.narrative

    // Nothing to render
    if (stmtTexts.length === 0 && !hasNonStmt) return null

    return (
      <div style={{ background: 'var(--bg-subtle)', borderRadius: 6, padding: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 6, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {heading}
        </div>
        {hasNonStmt && <BlockCard block={nonStmtParsed} isRelevance={isRelevance} />}
        {stmtTexts.map((text, i) => <BlockCard key={i} block={parseBlock(text)} isRelevance={isRelevance} />)}
      </div>
    )
  }

  // ── Render by strategy ──

  // Strategy 1: Section headers (Groundedness Scan / Relevance Assessment)
  const groundednessMatch = clean.match(/(?:^|\n)Groundedness Scan\s*\n([\s\S]*?)(?=\n\s*(?:Relevance Assessment|$))/i)
  const relevanceMatch = clean.match(/(?:^|\n)Relevance Assessment\s*\n([\s\S]*)$/i)

  if (groundednessMatch || relevanceMatch) {
    const gContent = groundednessMatch ? groundednessMatch[1].trim() : null
    const rContent = relevanceMatch ? relevanceMatch[1].trim() : null
    const gSection = gContent ? renderSection('Groundedness Scan', gContent, false) : null
    const rSection = rContent ? renderSection('Relevance Assessment', rContent, true) : null
    if (gSection || rSection) {
      return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{gSection}{rSection}</div>
    }
  }

  // Strategy 2: STATEMENT blocks without section headers
  const stmtRegex = /STATEMENT\s+\d+:[\s\S]*?Score:\s*.+/gi
  const stmtBlocks = [...clean.matchAll(stmtRegex)].map(m => m[0].trim())
  if (stmtBlocks.length > 0) {
    const afterStmts = clean.replace(stmtRegex, '').trim()
    const parsedRemainder = parseBlock(afterStmts)
    const hasRemainder = parsedRemainder.criteria || parsedRemainder.evidence || parsedRemainder.score || parsedRemainder.narrative

    // Check if remainder looks like Relevance (score contains "/ 3") or Groundedness
    const isRelRemainder = parsedRemainder.score ? /\/\s*3\b/.test(parsedRemainder.score) : false

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {renderSection('Groundedness Scan', stmtBlocks.join('\n'), false)}
        {hasRemainder && renderSection(isRelRemainder ? 'Relevance Assessment' : 'Groundedness Scan', afterStmts, isRelRemainder)}
      </div>
    )
  }

  // Strategy 3: Structured content without STATEMENT prefix or section headers
  const structured = parseBlock(clean)
  if (structured.score || structured.criteria || structured.evidence) {
    const isRel = structured.score ? /\/\s*3\b/.test(structured.score) : false
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {renderSection(isRel ? 'Relevance Assessment' : 'Groundedness Scan', clean, isRel)}
      </div>
    )
  }

  // Strategy 4: Fallback — show raw text with any Score highlighted
  const scoreLine = clean.split('\n').find(l => /^Score\s*:/.test(l.trim()))
  const rawScore = scoreLine?.replace(/^Score\s*:\s*/, '').trim()
  return (
    <div style={{ background: 'var(--bg-subtle)', borderRadius: 6, padding: 10 }}>
      <div style={{ fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap', color: 'var(--fg-tertiary)' }}>{clean}</div>
      {rawScore && (
        <div style={{ color: 'var(--fg)', fontWeight: 600, fontSize: 11, marginTop: 6 }}>
          Score: {rawScore}
        </div>
      )}
    </div>
  )
}

function ScoreBar({ label, value, hint, reverse }: { label: string; value: number | null; hint: string; reverse?: boolean }) {
  const pct = value !== null ? Math.round(value * 100) : 0
  const color = value === null ? 'var(--border-subtle)'
    : reverse
      ? value <= 0.3 ? 'var(--ok, #76B400)'
        : value <= 0.6 ? 'var(--warn, #D9A32E)'
        : 'var(--danger)'
      : value >= 0.7 ? 'var(--ok, #76B400)'
        : value >= 0.4 ? 'var(--warn, #D9A32E)'
        : 'var(--danger)'
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ color }}>{value !== null ? `${pct}%` : '—'}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-subtle)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: value !== null ? `${pct}%` : 0, borderRadius: 4, background: color, transition: 'width 400ms ease' }} />
      </div>
      <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', marginTop: 2 }}>{hint}</div>
    </div>
  )
}

export default function ContentQualityProviderPage() {
  const [activeTab, setActiveTab] = React.useState<'provider' | 'testing'>('provider')

  // ── Provider tab state ──
  const [config, setConfig] = React.useState<ContentQualityProviderConfig | null>(null)
  const [vendors, setVendors] = React.useState<ContentQualityVendor[]>([])
  const [providers, setProviders] = React.useState<AiProvider[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [testing, setTesting] = React.useState(false)
  const [health, setHealth] = React.useState<{ success: boolean; error?: string; checkedAt: Date } | null>(null)
  const [healthLoading, setHealthLoading] = React.useState(false)
  const [testResult, setTestResult] = React.useState<{ success: boolean; error?: string } | null>(null)
  const [saveResult, setSaveResult] = React.useState<{ ok: boolean; msg: string } | null>(null)

  const [vendor, setVendor] = React.useState('trulens')
  const [serviceUrl, setServiceUrl] = React.useState('')
  const [serviceApiKey, setServiceApiKey] = React.useState('')
  const [showKey, setShowKey] = React.useState(false)
  const [timeoutMs, setTimeoutMs] = React.useState(10000)
  const [providerId, setProviderId] = React.useState('')

  // ── Testing tab state ──
  const [testContext, setTestContext] = React.useState('')
  const [testResponse, setTestResponse] = React.useState('')
  const [evalRunning, setEvalRunning] = React.useState(false)
  const [evalResult, setEvalResult] = React.useState<ContentQualityTestResult | null>(null)
  const [evalError, setEvalError] = React.useState<string | null>(null)

  const load = React.useCallback(() => {
    setLoading(true)
    setSaveResult(null)
    Promise.all([
      getContentQualityProvider(),
      getContentQualityVendors(),
      getAiProviders(),
    ]).then(([cfg, vends, prov]) => {
      setConfig(cfg)
      setVendors(vends)
      setProviders(prov)
      setVendor(cfg.vendor)
      setServiceUrl(cfg.service_url ?? '')
      setTimeoutMs(cfg.timeout_ms)
      setProviderId(cfg.provider_id ?? '')
      setServiceApiKey('')
    }).catch((err) => {
      setSaveResult({ ok: false, msg: (err as Error)?.message || 'Failed to load' })
    }).finally(() => setLoading(false))
  }, [])

  React.useEffect(() => { load() }, [load])

  // Auto-check connection health on load
  React.useEffect(() => {
    if (!loading && config?.service_url) {
      setHealthLoading(true)
      testContentQualityProviderConnection()
        .then(r => setHealth({ ...r, checkedAt: new Date() }))
        .catch(() => setHealth({ success: false, error: 'Health check failed', checkedAt: new Date() }))
        .finally(() => setHealthLoading(false))
    }
  }, [loading])

  React.useEffect(() => {
    if (!saveResult) return
    const t = setTimeout(() => setSaveResult(null), 4000)
    return () => clearTimeout(t)
  }, [saveResult])

  // ── Provider tab handlers ──

  async function handleSave() {
    if (!isDirty) {
      setSaveResult({ ok: true, msg: 'No changes to save' })
      return
    }
    setSaving(true)
    setTestResult(null)
    setSaveResult(null)
    try {
      const payload: Parameters<typeof updateContentQualityProvider>[0] = {
        vendor,
        service_url: serviceUrl.trim() || null,
        timeout_ms: timeoutMs,
        provider_id: providerId || null,
      }
      if (serviceApiKey.trim()) payload.service_api_key = serviceApiKey.trim()
      const cfg = await updateContentQualityProvider(payload)
      setConfig(cfg)
      setServiceApiKey('')
      setSaveResult({ ok: true, msg: 'Content Quality Provider updated' })
    } catch (err) {
      setSaveResult({ ok: false, msg: (err as Error)?.message || 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testContentQualityProviderConnection()
      setTestResult(result)
    } catch (err) {
      setTestResult({ success: false, error: (err as Error).message || 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  // ── Testing tab handlers ──

  function loadSample(idx: number) {
    const s = SAMPLE_PAIRS[idx]
    if (s) { setTestContext(s.context); setTestResponse(s.response); setEvalResult(null); setEvalError(null) }
  }

  async function handleEvaluate() {
    if (!testContext.trim() || !testResponse.trim()) return
    setEvalRunning(true)
    setEvalResult(null)
    setEvalError(null)
    try {
      const r = await evaluateContentQualityTest({ context: testContext, response: testResponse })
      setEvalResult(r)
    } catch (err) {
      setEvalError((err as Error)?.message || 'Evaluation failed')
    } finally {
      setEvalRunning(false)
    }
  }

  const selectedProvider = providers.find(p => p.id === providerId)
  const isDirty = config != null && (
    vendor !== config.vendor
    || (serviceUrl.trim() || null) !== config.service_url
    || timeoutMs !== config.timeout_ms
    || (providerId || null) !== config.provider_id
    || serviceApiKey.trim() !== ''
  )

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="content-quality-provider" />
      <PageHeader title="Content Quality Provider" subtitle="Configure the plugin backend (TruLens by default) and judge LLM used for Content Quality Scanning — grounding/relevance evaluation of live AI traffic. Distinct from the Data Review Provider, which reviews config records for poisoning." />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border-subtle)', marginBottom: 20 }}>
        <div style={TAB_STYLE(activeTab === 'provider')} onClick={() => setActiveTab('provider')}>Provider</div>
        <div style={TAB_STYLE(activeTab === 'testing')} onClick={() => setActiveTab('testing')}>Testing</div>
      </div>

      {/* Health status — shown above both tabs */}
      {!loading && config && (
        config.vendor === 'builtin' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 6, marginBottom: 16, maxWidth: 640, background: config.provider ? 'rgba(118,180,0,0.06)' : 'rgba(217,163,46,0.08)', border: `1px solid ${config.provider ? 'rgba(118,180,0,0.2)' : 'rgba(217,163,46,0.2)'}` }}>
            {config.provider ? <Check w={16} style={{ color: 'var(--ok)', flexShrink: 0 }} />
              : <AlertTri w={16} style={{ color: 'var(--warn)', flexShrink: 0 }} />}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Built-in judge</div>
              <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>
                {config.provider
                  ? <><span style={{ color: 'var(--ok)' }}>●</span> Judge LLM: {config.provider.name} ({config.provider.vendor})</>
                  : <><span style={{ color: 'var(--warn)' }}>●</span> No judge LLM selected</>
                }
              </div>
            </div>
          </div>
        ) : config?.service_url ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 6, marginBottom: 16, maxWidth: 640, background: health === null && !healthLoading ? 'rgba(91,141,239,0.06)' : health?.success ? 'rgba(118,180,0,0.06)' : 'rgba(232,79,54,0.06)', border: `1px solid ${health === null && !healthLoading ? 'rgba(91,141,239,0.2)' : health?.success ? 'rgba(118,180,0,0.2)' : 'rgba(232,79,54,0.2)'}` }}>
            {healthLoading ? (
              <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid var(--fg-tertiary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite', flexShrink: 0 }} />
            ) : health?.success ? <Check w={16} style={{ color: 'var(--ok)', flexShrink: 0 }} />
              : <AlertTri w={16} style={{ color: health ? 'var(--danger)' : 'var(--info)', flexShrink: 0 }} />}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{config.vendor} @ {config.service_url}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>
                {healthLoading ? 'Checking connection…'
                  : health?.success ? <><span style={{ color: 'var(--ok)' }}>●</span> Online</>
                  : health ? <><span style={{ color: 'var(--danger)' }}>●</span> Offline — {health.error}</>
                  : 'Status unknown'}
                {' · '}{config.provider ? `Judge LLM: ${config.provider.name} (${config.provider.vendor})` : 'No judge LLM selected'}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 6, marginBottom: 16, maxWidth: 640, background: 'rgba(217,163,46,0.08)', border: '1px solid rgba(217,163,46,0.2)' }}>
            <AlertTri w={16} style={{ color: 'var(--warn)', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--warn)' }}>No service URL configured — Content Quality Scanning is inert until an admin points it at a running plugin backend.</span>
          </div>
        )
      )}

      {loading ? (
        <LoadingState />
      ) : activeTab === 'provider' ? (
        /* ════════════════════════════════════════════ Provider tab ════════════════════════════════════════════ */
        <div className="card" style={{ maxWidth: 640 }}>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div>
              <label className="label" style={{ display: 'block', marginBottom: 6 }}>Plugin vendor</label>
              <select className="input" style={{ width: '100%' }} value={vendor} onChange={e => setVendor(e.target.value)}>
                {vendors.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>

            {vendor !== 'builtin' && (
              <div>
                <label className="label" style={{ display: 'block', marginBottom: 6 }}>Service URL</label>
                <input className="input" style={{ width: '100%' }} value={serviceUrl}
                  onChange={e => setServiceUrl(e.target.value)}
                  placeholder="http://localhost:8090" />
                <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 4 }}>
                  Wherever the {vendors.find(v => v.value === vendor)?.label ?? vendor} service is reachable — a bare process, a container, or an externally hosted instance.
                </div>
              </div>
            )}

            {vendor !== 'builtin' && (
              <div>
                <label className="label" style={{ display: 'block', marginBottom: 6 }}>
                  Service API key {config?.has_service_api_key && <span style={{ color: 'var(--fg-tertiary)', fontWeight: 400 }}>(configured — leave blank to keep)</span>}
                </label>
                <div style={{ position: 'relative' }}>
                  <input className="input" style={{ width: '100%', paddingRight: 36, boxSizing: 'border-box' }}
                    type={showKey ? 'text' : 'password'}
                    value={serviceApiKey}
                    onChange={e => setServiceApiKey(e.target.value)}
                    placeholder={config?.has_service_api_key ? '••••••••••••' : 'Optional bearer token'} />
                  <button type="button" className="icon-btn" onClick={() => setShowKey(s => !s)}
                    style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)' }}>
                    {showKey ? <EyeOff w={14} /> : <Eye w={14} />}
                  </button>
                </div>
              </div>
            )}

            {vendor !== 'builtin' && (
              <div>
                <label className="label" style={{ display: 'block', marginBottom: 6 }}>Timeout (ms)</label>
                <input className="input" type="number" step="100" min={100} max={600000} style={{ width: 200 }}
                  value={timeoutMs} onChange={e => setTimeoutMs(Number(e.target.value))} />
                <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 4 }}>
                  Waits up to 600,000 ms (10 min); flag/monitor scans in background after the response; block/redact hold the response.
                </div>
              </div>
            )}

            <div>
              <label className="label" style={{ display: 'block', marginBottom: 6 }}>Judge LLM provider</label>
              <select className="input" style={{ width: '100%' }} value={providerId} onChange={e => setProviderId(e.target.value)}>
                <option value="">— None selected —</option>
                {providers.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.vendor})</option>
                ))}
              </select>
              {selectedProvider && (
                <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 4 }}>
                  Model: {selectedProvider.model ?? 'default'} · Endpoint: {selectedProvider.endpoint}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 4 }}>
                The plugin needs real chat-completion credentials to actually score anything — this is not optional.
              </div>
            </div>

            {vendor === 'builtin' && (
              <div style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(91,141,239,0.08)', border: '1px solid rgba(91,141,239,0.2)', fontSize: 12, color: 'var(--fg-secondary)', lineHeight: 1.5 }}>
                Runs in-process on the gateway — one call to the judge LLM per scan, using that provider's timeout. Judge criteria come from the <strong>Content Quality Judge</strong> page.
              </div>
            )}

            {testResult && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 6, fontSize: 12,
                background: testResult.success ? 'rgba(118,180,0,0.08)' : 'var(--danger-bg)',
                color: testResult.success ? 'var(--ok)' : 'var(--danger)',
              }}>
                {testResult.success ? <Check w={13} /> : <AlertTri w={13} />}
                {testResult.success ? 'Connection succeeded' : (testResult.error || 'Connection failed')}
              </div>
            )}

            {saveResult && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 6, marginTop: 4,
                background: saveResult.ok ? 'rgba(118,180,0,0.08)' : 'var(--danger-bg)',
                color: saveResult.ok ? 'var(--ok)' : 'var(--danger)',
              }}>
                {saveResult.ok ? <Check w={13} /> : <AlertTri w={13} />}
                {saveResult.msg}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="btn btn-ghost" onClick={handleTest} disabled={testing || (vendor !== 'builtin' && !serviceUrl.trim())}>
                {testing ? 'Testing…' : 'Test Connection'}
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ════════════════════════════════════════════ Testing tab ════════════════════════════════════════════ */
        <div className="card" style={{ maxWidth: 720 }}>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div>
              <label className="label" style={{ display: 'block', marginBottom: 8 }}>Sample pairs</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {SAMPLE_PAIRS.map((s, i) => (
                  <button key={i} className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}
                    onClick={() => loadSample(i)}>{s.label}</button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', padding: '6px 10px', background: 'var(--bg-subtle)', borderRadius: 6 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Expected scores per sample:</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <th style={{ textAlign: 'left', padding: '3px 6px' }}>Sample</th>
                      <th style={{ textAlign: 'center', padding: '3px 6px' }}>Groundedness</th>
                      <th style={{ textAlign: 'center', padding: '3px 6px' }}>Relevance</th>
                      <th style={{ textAlign: 'center', padding: '3px 6px' }}>Hallucination</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SAMPLE_PAIRS.map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '3px 6px', fontWeight: 500 }}>{s.label}</td>
                        <td style={{ textAlign: 'center', padding: '3px 6px', color: 'var(--ok, #76B400)' }}>{s.expected.groundedness}</td>
                        <td style={{ textAlign: 'center', padding: '3px 6px', color: 'var(--ok, #76B400)' }}>{s.expected.relevance}</td>
                        <td style={{ textAlign: 'center', padding: '3px 6px', color: 'var(--danger)' }}>{s.expected.hallucination}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <label className="label" style={{ display: 'block', marginBottom: 6 }}>Context <span style={{ fontWeight: 400, color: 'var(--fg-tertiary)' }}>(the full prompt sent to the judge)</span></label>
              <textarea className="input" style={{ width: '100%', minHeight: 100, resize: 'vertical', fontFamily: 'var(--font-mono, monospace)', fontSize: 12, lineHeight: 1.5, padding: 10, boxSizing: 'border-box' }}
                value={testContext}
                onChange={e => { setTestContext(e.target.value); setEvalResult(null); setEvalError(null) }}
                placeholder="Paste the context/prompt here…" />
            </div>

            <div>
              <label className="label" style={{ display: 'block', marginBottom: 6 }}>Response <span style={{ fontWeight: 400, color: 'var(--fg-tertiary)' }}>(the AI reply to score)</span></label>
              <textarea className="input" style={{ width: '100%', minHeight: 80, resize: 'vertical', fontFamily: 'var(--font-mono, monospace)', fontSize: 12, lineHeight: 1.5, padding: 10, boxSizing: 'border-box' }}
                value={testResponse}
                onChange={e => { setTestResponse(e.target.value); setEvalResult(null); setEvalError(null) }}
                placeholder="Paste the AI response here…" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn btn-primary" onClick={handleEvaluate}
                  disabled={evalRunning || !testContext.trim() || !testResponse.trim()}>
                  {evalRunning ? 'Evaluating…' : 'Run Test'}
                </button>
                {evalRunning && <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>Calling the judge LLM — this may take several minutes…</span>}
              </div>
              {evalRunning && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg-tertiary)', fontSize: 12 }}>
                  <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid var(--fg-tertiary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                  Evaluating content quality…
                </div>
              )}
            </div>

            {/* Error */}
            {evalError && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', borderRadius: 6, background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 13 }}>
                <AlertTri w={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>{evalError}</div>
              </div>
            )}

            {/* Results */}
            {evalResult && (
              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Scores</div>

                <ScoreBar label="Groundedness" value={evalResult.groundedness} hint="Does the response trace back to the context?" />
                <ScoreBar label="Relevance" value={evalResult.relevance} hint="Does the response actually answer what was asked?" />
                <ScoreBar label="Hallucination" value={evalResult.hallucination} hint="Derived from groundedness — higher means more unsupported claims." reverse />

                {evalResult.duration_ms !== null && (
                  <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 8 }}>
                    Duration: {(evalResult.duration_ms / 1000).toFixed(1)}s
                  </div>
                )}

                {evalResult.reason && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>Judge reasoning</div>
                    <ReasonView reason={evalResult.reason} />
                  </div>
                )}
              </div>
            )}

            {/* ── API code snippets ── */}
            <CqScanCodePanel context={testContext} response={testResponse} />
          </div>
        </div>
      )}
    </div>
  )
}

function CqScanCodePanel({ context, response }: { context: string; response: string }) {
  type Lang = 'curl' | 'python' | 'js'
  const [lang, setLang] = React.useState<Lang>('curl')

  function jsonEscape(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t')
  }

  const escapedContext = jsonEscape(context)
  const escapedResponse = jsonEscape(response)
  const gwUrl = `http://${window.location.hostname}:8082`

  const code = lang === 'curl'
    ? `curl -X POST ${gwUrl}/v1/cq_scan \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <GATEWAY_API_KEY>" \\
  -d @- <<'EOF'
{
  "context": "${escapedContext}",
  "response": "${escapedResponse}"
}
EOF`
    : lang === 'python'
    ? `import requests

url = "${gwUrl}/v1/cq_scan"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer <GATEWAY_API_KEY>",
}
payload = {
    "context": "${escapedContext}",
    "response": "${escapedResponse}",
}

response = requests.post(url, headers=headers, json=payload)
data = response.json()
print(f"Groundedness: {data['groundedness']}")
print(f"Relevance: {data['relevance']}")
print(f"Hallucination: {data['hallucination']}")`
    : `const response = await fetch(
  \`${gwUrl}/v1/cq_scan\`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer <GATEWAY_API_KEY>",
    },
    body: JSON.stringify({
      context: ${JSON.stringify(context)},
      response: ${JSON.stringify(response)},
    }),
  }
);
const data = await response.json();
console.log("Groundedness:", data.groundedness);
console.log("Relevance:", data.relevance);
console.log("Hallucination:", data.hallucination);`

  const LANGS: { id: Lang; label: string }[] = [
    { id: 'curl', label: 'cURL' },
    { id: 'python', label: 'Python' },
    { id: 'js', label: 'JavaScript' },
  ]

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16, marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 12 }}>
        <span className="label-strong" style={{ fontSize: 12, marginRight: 12 }}>API Code Example</span>
        {LANGS.map(l => (
          <button
            key={l.id}
            onClick={() => setLang(l.id)}
            style={{
              padding: '3px 12px', fontSize: 11, fontWeight: lang === l.id ? 600 : 400,
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: lang === l.id ? '2px solid var(--accent)' : '2px solid transparent',
              color: lang === l.id ? 'var(--fg-primary)' : 'var(--fg-tertiary)',
              marginBottom: -1,
            }}
          >
            {l.label}
          </button>
        ))}
      </div>
      <CodeSnippet code={code} />
      <div style={{ fontSize: 10, color: 'var(--fg-tertiary)', marginTop: 8 }}>
        Replace <code style={{ background: 'var(--bg-subtle)', padding: '1px 4px', borderRadius: 3 }}>&lt;GATEWAY_API_KEY&gt;</code> with a valid gateway API key. The gateway must have a Content Quality Provider configured (built-in or TruLens) and a judge LLM selected.
      </div>
    </div>
  )
}
