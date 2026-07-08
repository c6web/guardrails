import { useEffect, useMemo, useState } from 'react'
import { AlertTri, Check, Code, Network, Play, ShieldCheck, Terminal } from '../components/ui/Icons'
import { PageHeader, Breadcrumbs, Chip, OwaspPill, KV, LoadingState } from '../components/ui'
import { getGateways, testGateway, testGatewayScan, type GatewayInstance, type GatewayTestResult, type GatewayScanResult } from '../api/gateways'
import { getApiKeys, revealApiKey, type UIKey } from '../api/apikeys'
import { getApps } from '../api/apps'
import { getTrafficLogByGuardrailRequestId, getRecentTrafficLog } from '../api/logs'
import type { App, TrafficRow } from '../types'
import { PromptTestingInspector, MODE_META } from './components/PromptTestingInspector'
import { PromptTestingCodePanel } from './components/PromptTestingCodePanel'
import { RowDetail } from './components/AIActivitiesModals'
import { STAGE_LABELS, stageNote } from './components/AIActivitiesShared'
import { ScannerBadge } from '../components/ui'
import testPromptsData from '../data/test-prompts.json'

interface TestPromptEntry {
  id: string; group: string; label: string; text: string
  expected: 'pass' | 'fail'
  expected_by_mode?: Partial<Record<'guard' | 'soft' | 'monitor' | 'bypass', 'pass' | 'fail'>>
}
interface GroupDef { id: string; label: string; color: string }

const testGroups: GroupDef[] = testPromptsData.groups
const testPrompts: TestPromptEntry[] = testPromptsData.prompts as TestPromptEntry[]

type ExpectedMatch = 'match' | 'unexpected' | 'no-log' | 'no-scan'

function checkModeExpected(
  appMode: App['mode'], expected: 'pass' | 'fail', success: boolean, logRow: TrafficRow | null, isScan: boolean,
): { status: ExpectedMatch; verdict: string; detail: string; color: string } {
  if (isScan) {
    // scan mode is mode-independent: detected = !success or verdict === 'block'
    const detected = !success
    const ok = (expected === 'pass') !== detected
    return ok
      ? { status: 'match', verdict: detected ? 'Blocked' : 'Allowed', detail: 'Result matches what was expected', color: 'var(--ok, #76B400)' }
      : { status: 'unexpected', verdict: detected ? 'Blocked' : 'Allowed', detail: 'Result does not match what was expected', color: 'var(--warn, #D9A32E)' }
  }
  if (appMode === 'bypass') {
    return { status: 'no-scan', verdict: 'Forwarded (bypass)', detail: 'Bypass mode is on — no scanning happens', color: 'var(--fg-tertiary)' }
  }
  if (appMode === 'guard') {
    const detected = !success
    const ok = (expected === 'pass') !== detected
    return ok
      ? { status: 'match', verdict: detected ? 'Blocked (403)' : 'Allowed', detail: detected ? 'Correct — the attack was blocked' : 'Correct — the harmless prompt was forwarded to the model', color: detected ? 'var(--danger)' : 'var(--ok, #76B400)' }
      : { status: 'unexpected', verdict: detected ? 'Blocked (403)' : 'Allowed', detail: detected ? 'Unexpected — a harmless prompt was blocked. Check the settings or test it again.' : 'Missed — the attack was not detected. The request went through to the model.', color: 'var(--warn, #D9A32E)' }
    }
    if (appMode === 'soft') {
      if (!success) {
        const ok = expected === 'fail'
        return ok
          ? { status: 'match', verdict: 'Error-blocked', detail: 'Correct — the attack was blocked', color: 'var(--danger)' }
          : { status: 'unexpected', verdict: 'Error-blocked', detail: 'Unexpected error', color: 'var(--warn, #D9A32E)' }
      }
      const flagged = !!logRow?.flag
      const ok = (expected === 'pass') !== flagged
      if (!logRow && expected === 'fail') {
        return { status: 'no-log', verdict: 'Forwarded', detail: 'Waiting for traffic log to confirm…', color: 'var(--fg-tertiary)' }
      }
      return ok
        ? { status: 'match', verdict: flagged ? 'Declined (soft block)' : 'Forwarded', detail: flagged ? 'Correct — the attack was politely declined. The model was not called.' : 'Correct — the harmless prompt was forwarded to the model', color: flagged ? 'var(--info, #0EA5E9)' : 'var(--ok, #76B400)' }
        : { status: 'unexpected', verdict: flagged ? 'Declined (soft block)' : 'Forwarded', detail: flagged ? 'Unexpected — a harmless prompt was declined. Check the settings or test it again.' : 'Missed — the attack was not detected. The request went through to the model.', color: 'var(--warn, #D9A32E)' }
    }
    if (appMode === 'monitor') {
      if (!success) {
        const ok = expected === 'fail'
        return ok
          ? { status: 'match', verdict: 'Error-blocked', detail: 'Correct — the attack was blocked', color: 'var(--danger)' }
          : { status: 'unexpected', verdict: 'Error-blocked', detail: 'Unexpected error', color: 'var(--warn, #D9A32E)' }
      }
      const flagged = !!logRow?.flag
      const ok = (expected === 'pass') !== flagged
      if (!logRow && expected === 'fail') {
        return { status: 'no-log', verdict: 'Forwarded', detail: 'Waiting for traffic log to confirm…', color: 'var(--fg-tertiary)' }
      }
      return ok
        ? { status: 'match', verdict: flagged ? 'Forwarded (flagged)' : 'Forwarded', detail: flagged ? 'Correct — the attack was flagged in the log and forwarded for monitoring' : 'Correct — the harmless prompt was forwarded to the model', color: flagged ? 'var(--warn, #D9A32E)' : 'var(--ok, #76B400)' }
        : { status: 'unexpected', verdict: flagged ? 'Forwarded (flagged)' : 'Forwarded', detail: flagged ? 'Unexpected — a harmless prompt was flagged. Check the settings or test it again.' : 'Missed — the attack was not detected. The request went through to the model.', color: 'var(--warn, #D9A32E)' }
    }
  return { status: 'no-scan', verdict: 'Unknown', detail: '', color: 'var(--fg-tertiary)' }
}

const GUIDE_STEPS = [
  'Pick a gateway and the API key of the app you want to exercise.',
  'Compose a prompt — or load a red-team sample — and run it.',
  "Compare the gateway's verdict against the app's active policy on the right.",
]

type TestMode = 'prompt' | 'scan'

export default function PromptTestingPage() {
  const [mode, setMode]           = useState<TestMode>('prompt')
  const [gateways, setGateways]   = useState<GatewayInstance[]>([])
  const [apiKeys, setApiKeys]     = useState<UIKey[]>([])
  const [apps, setApps]           = useState<App[]>([])
  const [selectedGatewayId, setSelectedGatewayId] = useState('')
  const [selectedKeyId, setSelectedKeyId] = useState('')
  const [prompt, setPrompt]       = useState('')
  const [maxTokens, setMaxTokens] = useState(4096)
  const [running, setRunning]     = useState(false)
  const [result, setResult]       = useState<GatewayTestResult | null>(null)
  const [scanResult, setScanResult] = useState<GatewayScanResult | null>(null)
  const [expectedOutcome, setExpectedOutcome] = useState<'pass' | 'fail' | null>(null)
  const [showCode, setShowCode]   = useState(false)
  const [activeGroup, setActiveGroup] = useState<string>('all')
  // Revealed key value — fetched on first test run, cached for session
  const [revealedKeyValue, setRevealedKeyValue] = useState<string | null>(null)
  const [logRow, setLogRow]           = useState<TrafficRow | null>(null)
  const [logLoading, setLogLoading]   = useState(false)
  const [showLogDetail, setShowLogDetail] = useState(false)

  useEffect(() => {
    getGateways().then(setGateways).catch(() => {})
    getApiKeys().then(keys => setApiKeys(keys.filter(k => k.status === 'active'))).catch(() => {})
    getApps().then(setApps).catch(() => {})
  }, [])

  useEffect(() => {
    if (gateways.length === 1 && !selectedGatewayId) setSelectedGatewayId(gateways[0].id)
  }, [gateways, selectedGatewayId])

  useEffect(() => {
    if (apiKeys.length === 1 && !selectedKeyId) setSelectedKeyId(apiKeys[0].id)
  }, [apiKeys, selectedKeyId])

  const appById = useMemo(() => new Map(apps.map(a => [a.id, a])), [apps])
  const selectedGateway = gateways.find(g => g.id === selectedGatewayId) ?? null
  const selectedKey     = apiKeys.find(k => k.id === selectedKeyId) ?? null
  const selectedApp     = selectedKey ? appById.get(selectedKey.appId) ?? null : null
  const filteredPrompts = useMemo(() => {
    if (activeGroup === 'all') return testPrompts
    return testPrompts.filter(p => p.group === activeGroup)
  }, [activeGroup])
  const canRun = !running

  function keyOptionLabel(k: UIKey): string {
    const app = appById.get(k.appId)
    const appLabel = app?.name ?? k.appName ?? 'no app'
    return app ? `${k.name} · ${appLabel} (${MODE_META[app.mode]?.label ?? app.mode})` : `${k.name} · ${appLabel}`
  }

  async function handleKeyChange(id: string) {
    setSelectedKeyId(id)
    setRevealedKeyValue(null)
    if (!id) return
    try {
      const data = await revealApiKey(id)
      setRevealedKeyValue(data.full_key)
    } catch { /* key will be fetched on first test run */ }
  }

  function loadSample(idx: string) {
    const i = parseInt(idx, 10)
    if (isNaN(i) || i < 0) { setExpectedOutcome(null); return }
    const s = filteredPrompts[i]
    if (!s) return
    setPrompt(s.text)
    const mode = selectedApp?.mode ?? 'guard'
    const modeExpected = s.expected_by_mode?.[mode] ?? s.expected
    setExpectedOutcome(modeExpected)
    setResult(null)
    setScanResult(null)
  }

  async function resolveApiKey(): Promise<string | null> {
    if (!selectedKey) return null
    if (revealedKeyValue) return revealedKeyValue
    try {
      const data = await revealApiKey(selectedKey.id)
      setRevealedKeyValue(data.full_key)
      return data.full_key
    } catch {
      return null
    }
  }

  async function runPromptTest() {
    if (!selectedGateway || !selectedKey) return
    setRunning(true)
    setResult(null)
    setLogRow(null)
    const apiKey = await resolveApiKey()
    if (!apiKey) {
      setResult({ success: false, latency_ms: 0, error: 'Could not retrieve API key — check permissions' })
      setRunning(false)
      return
    }
    const testStartedAt = new Date().toISOString()
    const r = await testGateway(selectedGateway, prompt, maxTokens, apiKey)
    setResult(r)
    setRunning(false)
    setLogLoading(true)
    try {
      let row: TrafficRow | null = null
      const maxAttempts = 5
      const baseDelay  = 300
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (r.guardrailRequestId) {
          row = await getTrafficLogByGuardrailRequestId(r.guardrailRequestId)
        } else if (selectedApp) {
          row = await getRecentTrafficLog(selectedApp.id, testStartedAt)
        }
        if (row) break
        if (attempt < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, baseDelay * (attempt + 1)))
        }
      }
      setLogRow(row)
    } finally {
      setLogLoading(false)
    }
  }

  async function runScanTest() {
    if (!selectedGateway || !selectedKey) return
    setRunning(true)
    setScanResult(null)
    setLogRow(null)
    const apiKey = await resolveApiKey()
    if (!apiKey) {
      setScanResult({ success: false, latency_ms: 0, error: 'Could not retrieve API key — check permissions' })
      setRunning(false)
      return
    }
    const r = await testGatewayScan(selectedGateway, prompt, apiKey)
    setScanResult(r)
    setRunning(false)
    if (r.request_id) {
      setLogLoading(true)
      try {
        setLogRow(await getTrafficLogByGuardrailRequestId(r.request_id))
      } finally {
        setLogLoading(false)
      }
    }
  }

  async function runTest() {
    if (!selectedGateway || !selectedKey || !prompt.trim()) return
    if (mode === 'scan') await runScanTest()
    else await runPromptTest()
  }

  return (
    <div className="page fade-in">
      <Breadcrumbs pageId="prompt-testing" />
      <PageHeader title="Prompt Testing" subtitle="Send live prompts through a gateway with a real app's API key and inspect the firewall verdict" />

      {/* Mode switch */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        <div className={`tab ${mode === 'prompt' ? 'active' : ''}`}
          onClick={() => { setMode('prompt'); setResult(null); setScanResult(null); setLogRow(null) }}>
          Seamless Mode
        </div>
        <div className={`tab ${mode === 'scan' ? 'active' : ''}`}
          onClick={() => { setMode('scan'); setResult(null); setScanResult(null); setLogRow(null) }}>
          Scan Mode
        </div>
      </div>

      {/* Guidance banner */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 14, alignItems: 'flex-start', background: 'var(--bg-sunken)' }}>
        <Terminal w={18} style={{ color: 'var(--accent)', marginTop: 2, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            {mode === 'scan' ? 'Detect-only firewall verdicts — no model call' : 'An interactive playground for your LLM firewall'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-secondary)', lineHeight: 1.5, marginBottom: 8 }}>
            {mode === 'scan'
              ? "Scan Mode runs the same detection pipeline (keyword/regex, semantic search, LLM classifier, and T2 intent analysis) but never forwards to an upstream model. Use it to check arbitrary text — RAG chunks, agent steps, tool arguments — and always get an explicit allow/block verdict with a reason and request ID."
              : "This page proxies a prompt straight to a selected gateway using the API key of a connected app — exactly as that app's traffic would flow. Use it to validate that detection rules, threat knowledge and tool-use blocking behave as expected before shipping. Nothing is saved; pick the key for each run."}
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

      {/* Bypass warning */}
      {selectedApp?.mode === 'bypass' && (
        <div className="card" style={{ padding: '10px 16px', marginBottom: 16, borderColor: 'var(--warn, #D9A32E)', borderWidth: 1, background: 'rgba(217, 163, 46, 0.08)' }}>
          <div className="row-tight" style={{ gap: 8 }}>
            <AlertTri w={15} style={{ color: 'var(--warn, #D9A32E)', flexShrink: 0 }} />
            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--warn, #D9A32E)' }}>Bypass mode active</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-secondary)', marginTop: 4, lineHeight: 1.5 }}>
            This app is in bypass mode — no security scanning occurs. All requests are forwarded to the upstream provider without any safety analysis. Test results for FAIL prompts will always show "no-scan".
          </div>
        </div>
      )}

      {/* Studio grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(300px, 1fr)', gap: 16, alignItems: 'start' }} className="prompt-testing-grid">

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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }} className="composer-selectors">
                <div>
                  <label className="label" style={{ display: 'block', marginBottom: 5 }}>Gateway</label>
                  <select className="input" style={{ width: '100%' }} value={selectedGatewayId}
                    onChange={e => { setSelectedGatewayId(e.target.value); setResult(null) }} disabled={running}>
                    <option value="">Select gateway…</option>
                    {gateways.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  {!selectedGateway && (
                    <div style={{ color: 'var(--warning)', fontSize: 11, marginTop: 4 }}>Select a Gateway to enable testing</div>
                  )}
                </div>
                <div>
                  <label className="label" style={{ display: 'block', marginBottom: 5 }}>API Key · App</label>
                  <select className="input" style={{ width: '100%' }} value={selectedKeyId}
                    onChange={e => { handleKeyChange(e.target.value); setResult(null) }} disabled={running}>
                    <option value="">Select API key…</option>
                    {apiKeys.map(k => <option key={k.id} value={k.id}>{keyOptionLabel(k)}</option>)}
                  </select>
                  {!selectedKey && (
                    <div style={{ color: 'var(--warning)', fontSize: 11, marginTop: 4 }}>Select an API Key to enable testing</div>
                  )}
                </div>
              </div>

              {/* Endpoint line */}
              {selectedGateway && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-sunken)', borderRadius: 6 }}>
                  <Network w={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <code className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedGateway.url}{mode === 'scan' ? '/v1/scan' : '/v1/chat/completions'}
                  </code>
                  {selectedKey && <Chip kind={revealedKeyValue ? 'ok' : 'muted'}>{revealedKeyValue ? 'Key ready' : 'Key selected'}</Chip>}
                </div>
              )}

              {/* Group filter */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button className={`btn btn-ghost btn-sm${activeGroup === 'all' ? ' active' : ''}`}
                  style={{ fontSize: 10, padding: '2px 8px', height: 22 }}
                  onClick={() => setActiveGroup('all')}>All</button>
                {testGroups.map(g => (
                  <button key={g.id} className={`btn btn-ghost btn-sm${activeGroup === g.id ? ' active' : ''}`}
                    style={{ fontSize: 10, padding: '2px 8px', height: 22, borderColor: activeGroup === g.id ? g.color : undefined, color: activeGroup === g.id ? g.color : undefined }}
                    onClick={() => setActiveGroup(g.id)}>{g.label}</button>
                ))}
              </div>

              {/* Sample loader */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label className="label" style={{ whiteSpace: 'nowrap', marginBottom: 0 }}>Load sample:</label>
                <select className="input" style={{ flex: 1 }} defaultValue="" onChange={e => loadSample(e.target.value)} disabled={running}>
                  <option value="">— pick a red-team / harmless sample —</option>
                  {filteredPrompts.map((s, i) => <option key={s.id} value={i}>{s.label}</option>)}
                </select>
                {expectedOutcome === 'pass' && <Chip kind="ok">Expected: PASS</Chip>}
                {expectedOutcome === 'fail' && <Chip kind="err">Expected: FAIL</Chip>}
              </div>

              {/* Prompt editor */}
              <div>
                <label className="label" style={{ display: 'block', marginBottom: 6 }}>Prompt</label>
                <textarea className="input"
                  style={{ width: '100%', boxSizing: 'border-box', minHeight: 180, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.5 }}
                  placeholder={mode === 'scan' ? 'Enter text to scan for threats…' : 'Enter a prompt to send through the gateway…'}
                  value={prompt} onChange={e => { setPrompt(e.target.value); setResult(null); setScanResult(null); setLogRow(null) }} disabled={running} />
                  {!prompt.trim() && (
                    <div style={{ color: 'var(--warning)', fontSize: 11, marginTop: 4 }}>Enter a prompt to test</div>
                  )}
              </div>

              {/* Toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {mode === 'prompt' && (
                  <>
                    <label className="label" style={{ whiteSpace: 'nowrap', marginBottom: 0 }}>Max tokens</label>
                    <input type="number" className="input mono" style={{ width: 96 }} min={64} max={131072} step={256}
                      value={maxTokens} onChange={e => setMaxTokens(Math.max(64, parseInt(e.target.value) || 4096))} disabled={running} />
                  </>
                )}
                <div style={{ flex: 1 }} />
                <button className="btn btn-primary" onClick={runTest} disabled={!canRun}>
                  {running
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />{mode === 'scan' ? 'Scanning…' : 'Running… (up to 5 min)'}</span>
                    : <><Play w={13} /> {mode === 'scan' ? 'Run scan' : 'Run test'}</>}
                </button>
              </div>
            </div>

            {/* Code examples panel */}
            {showCode && (
              <PromptTestingCodePanel
                url={selectedGateway?.url ?? ''}
                apiKey={revealedKeyValue ?? '<YOUR_API_KEY>'}
                prompt={prompt || 'Your prompt here'}
                maxTokens={maxTokens}
                mode={mode}
              />
            )}
          </div>

          {/* Response — Prompt Mode */}
          {mode === 'prompt' && result && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card-hdr">
                <h3>Response</h3>
                <div className="right">
                  {logLoading && <LoadingState message="Loading details…" size="sm" />}
                  {!logLoading && logRow && (
                    <button className="btn btn-secondary" style={{ height: 24, fontSize: 11 }} onClick={() => setShowLogDetail(true)}>
                      View Details
                    </button>
                  )}
                  {!logLoading && result && !logRow && (
                    <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>Log record not found</span>
                  )}
                </div>
              </div>
              {(() => {
                const appMode = selectedApp?.mode ?? 'guard'
                const ec = expectedOutcome ? checkModeExpected(appMode, expectedOutcome, result.success, logRow, false) : null
                const bgColor = ec?.status === 'match' ? 'rgba(118,180,0,0.06)' : ec?.status === 'unexpected' ? 'rgba(217,163,46,0.06)' : result.success ? 'rgba(118,180,0,0.06)' : 'rgba(220,38,38,0.06)'
                const iconColor = ec?.status === 'match' ? 'var(--ok, #76B400)' : ec?.status === 'unexpected' ? 'var(--warn, #D9A32E)' : result.success ? 'var(--ok, #76B400)' : 'var(--danger)'
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', flexWrap: 'wrap', borderBottom: '1px solid var(--border-subtle)', background: bgColor }}>
                    {ec?.status === 'no-scan' ? <AlertTri w={14} style={{ color: 'var(--fg-tertiary)', flexShrink: 0 }} /> :
                     ec?.status === 'match' ? <Check w={14} style={{ color: 'var(--ok, #76B400)', flexShrink: 0 }} /> :
                     <AlertTri w={14} style={{ color: iconColor, flexShrink: 0 }} />}
                    <span style={{ fontWeight: 600, fontSize: 13, color: iconColor }}>
                      {ec?.verdict ?? (result.success ? 'Allowed' : 'Blocked or error')}
                    </span>
                    <Chip kind={appMode === 'guard' ? 'ok' : appMode === 'soft' ? 'ok' : appMode === 'monitor' ? 'warn' : 'muted'} mono>{MODE_META[appMode]?.label ?? appMode}</Chip>
                    {ec && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: ec.color }}>{ec.detail}</span>
                    )}
                    {result.latency_ms > 0 && (
                      <span className="mono" style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginLeft: 'auto' }}>{result.latency_ms}ms</span>
                    )}
                  </div>
                )
              })()}
              <pre style={{
                margin: 0, padding: '14px 18px', fontSize: 12, fontFamily: 'var(--font-mono)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                color: result.success ? 'var(--fg-primary)' : 'var(--danger)',
                maxHeight: 320, overflowY: 'auto',
              }}>
                {result.response ?? result.error ?? '(empty response)'}
              </pre>
            </div>
          )}

          {/* Response — Scan Mode */}
          {mode === 'scan' && scanResult && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card-hdr">
                <h3>Scan Verdict</h3>
                <div className="right">
                  {logLoading && <LoadingState message="Loading details…" size="sm" />}
                  {!logLoading && logRow && (
                    <button className="btn btn-secondary" style={{ height: 24, fontSize: 11 }} onClick={() => setShowLogDetail(true)}>
                      View Details
                    </button>
                  )}
                </div>
              </div>

              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {!scanResult.success ? (
                  <div className="row-tight" style={{ color: 'var(--danger)' }}>
                    <AlertTri w={15} style={{ flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{scanResult.error ?? 'Scan request failed'}</span>
                  </div>
                ) : (
                  <>
                    {/* Verdict card — same idiom as the Audit log's request-detail "Verdict" panel */}
                    {scanResult.verdict === 'block' ? (
                      <div className="card" style={{ padding: 14, borderColor: 'var(--danger)', borderWidth: 1, background: 'var(--danger-bg)' }}>
                        <div className="row-tight" style={{ marginBottom: scanResult.reason ? 8 : 0 }}>
                          <span className="dot-sev crit" />
                          <span style={{ fontWeight: 600 }}>Blocked</span>
                        </div>
                        <div className="row-tight" style={{ flexWrap: 'wrap', gap: 6, marginBottom: scanResult.reason ? 8 : 0 }}>
                          <ScannerBadge row={{
                            blockedStage: scanResult.blocked_stage,
                            detector: scanResult.detector,
                            confidence: scanResult.confidence,
                            t2Flagged: scanResult.blocked_stage === 't2_intent',
                            pipelineTrace: scanResult.trace ?? null,
                          }} />
                          <OwaspPill id={scanResult.framework_id ?? null} withName />
                          {scanResult.detector && <Chip kind="muted" mono>{scanResult.detector}</Chip>}
                          {typeof scanResult.confidence === 'number' && <Chip kind="muted" mono>conf {(scanResult.confidence * 100).toFixed(0)}%</Chip>}
                        </div>
                        {scanResult.reason && (
                          <div style={{ fontSize: 12, color: 'var(--fg-secondary)', lineHeight: 1.5 }}>{scanResult.reason}</div>
                        )}
                      </div>
                    ) : (
                      <div className="card" style={{ padding: 14, borderColor: 'var(--accent)', background: 'var(--success-bg)' }}>
                        <div className="row-tight">
                          <ShieldCheck w={15} style={{ color: 'var(--accent)' }} />
                          <span style={{ fontWeight: 600 }}>Allowed · scan pipeline clear</span>
                        </div>
                        <div className="caption" style={{ marginTop: 4 }}>
                          No matches across keyword, semantic, classifier, and intent-analysis layers.
                        </div>
                      </div>
                    )}

                    {expectedOutcome && (() => {
                      const blocked = scanResult.verdict === 'block'
                      const ec = checkModeExpected('guard', expectedOutcome, !blocked, null, true)
                      return (
                        <div style={{ fontSize: 11, fontWeight: 600, marginTop: -8, color: ec.color }}>
                          {ec.status === 'match' ? '✓ ' : '⚠ '}{ec.detail}
                        </div>
                      )
                    })()}

                    {/* Key facts */}
                    <KV rows={[
                      { label: 'Verdict', value: <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>{scanResult.verdict}</span> },
                      { label: 'Blocked stage', value: scanResult.blocked_stage ? (STAGE_LABELS[scanResult.blocked_stage] ?? scanResult.blocked_stage) : '—' },
                      { label: 'Duration', value: typeof scanResult.duration_ms === 'number' ? `${scanResult.duration_ms}ms` : '—' },
                      { label: 'Request ID', value: scanResult.request_id ?? '—' },
                    ]} labelWidth={110} gap={7} />

                    {/* Semantic threat-knowledge matches */}
                    {!!scanResult.semantic_matches?.length && (
                      <div>
                        <div className="label-strong" style={{ marginBottom: 6 }}>Threat knowledge matches</div>
                        <table className="t" style={{ fontSize: 12 }}>
                          <thead><tr><th>Entry</th><th>ID</th><th>Similarity</th></tr></thead>
                          <tbody>
                            {scanResult.semantic_matches.map((m, i) => (
                              <tr key={i}>
                                <td>{m.name}</td>
                                <td className="mono" style={{ fontSize: 11 }}>{m.id}</td>
                                <td className="mono">{(m.similarity * 100).toFixed(1)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Pipeline trace */}
                    {!!scanResult.trace?.stages?.length && (
                      <div>
                        <div className="label-strong" style={{ marginBottom: 6 }}>Pipeline trace</div>
                        <table className="t" style={{ fontSize: 12 }}>
                          <thead><tr><th>Stage</th><th>Decision</th><th>Time</th><th>Detail</th></tr></thead>
                          <tbody>
                            {scanResult.trace.stages.map((stage, i) => (
                              <tr key={i}>
                                <td className="mono">{STAGE_LABELS[stage.stage] ?? stage.stage.replace(/_/g, ' ')}</td>
                                <td>
                                  <Chip kind={stage.decision?.toLowerCase().includes('block') || stage.decision === 'attack' ? 'err' : stage.decision === 'skipped_no_classifier' ? 'muted' : 'ok'} mono>
                                    {stage.decision}
                                  </Chip>
                                </td>
                                <td className="mono">{typeof stage.ms === 'number' ? `${stage.ms}ms` : '—'}</td>
                                <td style={{ color: 'var(--fg-secondary)' }}>{stageNote(stage)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Inspector column ── */}
        <PromptTestingInspector app={selectedApp} />
      </div>

      {showLogDetail && logRow && (
        <RowDetail
          row={logRow}
          onClose={() => setShowLogDetail(false)}
          detectors={[]}
        />
      )}
    </div>
  )
}
