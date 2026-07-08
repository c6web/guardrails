import React from 'react'
import { X } from '../../components/ui'
export { Toast } from '../../components/ui'
import type { FrameworkSummary } from '../../api/detectors'
import { testDetectorLocal } from '../../api/detectors'

// ── Framework selector ────────────────────────────────────────────────────────

export function FrameworkSelector({ selectedIds, onChange, frameworks }: {
  selectedIds: string[]
  onChange: (ids: string[]) => void
  frameworks: Record<string, FrameworkSummary>
}) {
   function toggle(id: string) {
    const next = selectedIds.includes(id)
      ? selectedIds.filter(x => x !== id)
      : [...selectedIds, id]
    onChange(next)
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {Object.values(frameworks).map(fw => {
          const sel = selectedIds.includes(fw.id)
          return (
            <button
              key={fw.id}
              type="button"
              onClick={() => toggle(fw.id)}
              style={{
                padding: '3px 10px', borderRadius: 4, fontSize: 11,
                border: sel ? '2px solid var(--accent)' : '1px solid var(--border-subtle)',
                background: sel ? 'var(--bg-sunken)' : 'transparent',
                color: sel ? 'var(--accent)' : 'var(--fg-secondary)',
                cursor: 'pointer', fontWeight: sel ? 600 : 400,
              }}>
              {fw.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Keyword tag input ─────────────────────────────────────────────────────────

export function KeywordInput({ keywords, onChange }: { keywords: string[]; onChange: (kw: string[]) => void }) {
  const [draft, setDraft] = React.useState('')

  function add() {
    const val = draft.trim()
    if (!val || keywords.includes(val)) { setDraft(''); return }
    onChange([...keywords, val])
    setDraft('')
  }

  function remove(kw: string) {
    onChange(keywords.filter(k => k !== kw))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); add() }
    if (e.key === 'Backspace' && !draft && keywords.length > 0) {
      remove(keywords[keywords.length - 1])
    }
  }

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center',
      padding: '6px 8px', borderRadius: 5,
      border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
      minHeight: 38,
    }}>
      {keywords.map(kw => (
        <span key={kw} style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '2px 6px', borderRadius: 4,
          background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
          fontSize: 11, fontFamily: 'var(--font-mono)',
        }}>
          {kw}
          <button
            type="button"
            onClick={() => remove(kw)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--fg-tertiary)', lineHeight: 1 }}>
            <X w={10} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={add}
        placeholder={keywords.length === 0 ? 'Type a keyword and press Enter…' : ''}
        style={{
          flex: 1, minWidth: 120, border: 'none', outline: 'none',
          background: 'transparent', fontSize: 12, fontFamily: 'var(--font-ui)',
          color: 'var(--fg-primary)',
        }}
      />
    </div>
  )
}

// ── Rule type toggle ──────────────────────────────────────────────────────────

export function RuleTypeToggle({ value, onChange }: {
  value: 'keyword' | 'regex'
  onChange: (v: 'keyword' | 'regex') => void
}) {
  const btn = (type: 'keyword' | 'regex', label: string) => (
    <button
      type="button"
      onClick={() => onChange(type)}
      style={{
        flex: 1, padding: '5px 0', fontSize: 12, cursor: 'pointer', border: 'none',
        borderRadius: 4, fontWeight: value === type ? 600 : 400,
        background: value === type ? 'var(--accent)' : 'var(--bg-surface)',
        color: value === type ? '#fff' : 'var(--fg-secondary)',
        transition: 'background 0.15s, color 0.15s',
      }}>
      {label}
    </button>
  )
  return (
    <div style={{
      display: 'flex', gap: 4, padding: 4, borderRadius: 6,
      background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
    }}>
      {btn('keyword', 'Keyword')}
      {btn('regex', 'Regex')}
    </div>
  )
}

// ── Scanning scope toggle ─────────────────────────────────────────────────────

export function ScopeToggle({ value, onChange }: {
  value: 'input' | 'output' | 'both'
  onChange: (v: 'input' | 'output' | 'both') => void
}) {
  const btn = (scope: 'input' | 'output' | 'both', label: string) => (
    <button
      type="button"
      onClick={() => onChange(scope)}
      style={{
        flex: 1, padding: '5px 0', fontSize: 12, cursor: 'pointer', border: 'none',
        borderRadius: 4, fontWeight: value === scope ? 600 : 400,
        background: value === scope ? 'var(--accent)' : 'var(--bg-surface)',
        color: value === scope ? '#fff' : 'var(--fg-secondary)',
        transition: 'background 0.15s, color 0.15s',
      }}>
      {label}
    </button>
  )
  return (
    <div style={{
      display: 'flex', gap: 4, padding: 4, borderRadius: 6,
      background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
    }}>
      {btn('input', 'Input')}
      {btn('output', 'Output')}
      {btn('both', 'Both')}
    </div>
  )
}

// ── Mode toggle ───────────────────────────────────────────────────────────────

export type DetectorMode = 'block' | 'flag' | 'redact'

export function ModeToggle({ value, onChange, disabledOptions }: {
  value: DetectorMode
  onChange: (v: DetectorMode) => void
  disabledOptions?: DetectorMode[]
}) {
  const options: Array<{ v: DetectorMode; label: string }> = [
    { v: 'block',  label: 'Block'  },
    { v: 'flag',   label: 'Flag'   },
    { v: 'redact', label: 'Redact' },
  ]
  return (
    <div style={{
      display: 'flex', gap: 4, padding: 4, borderRadius: 6,
      background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
    }}>
      {options.map(({ v, label }) => {
        const disabled = disabledOptions?.includes(v)
        return (
          <button
            key={v}
            type="button"
            onClick={() => { if (!disabled) onChange(v) }}
            style={{
              flex: 1, padding: '5px 0', fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer', border: 'none',
              borderRadius: 4, fontWeight: value === v ? 600 : 400,
              background: value === v ? 'var(--accent)' : 'var(--bg-surface)',
              color: disabled ? 'var(--fg-tertiary)' : value === v ? '#fff' : 'var(--fg-secondary)',
              opacity: disabled ? 0.45 : 1,
              transition: 'background 0.15s, color 0.15s',
            }}>
            {label}
          </button>
        )
      })}
    </div>
  )
}

// ── Pattern tester ────────────────────────────────────────────────────────────

export function PatternTester({ ruleType, patterns }: {
  ruleType: 'keyword' | 'regex'
  patterns: string[]
}) {
  const [prompt, setPrompt] = React.useState('')
  const [result, setResult] = React.useState<{ matched: boolean; matched_pattern: string | null; error?: string } | null>(null)

  function runTest() {
    if (!prompt.trim()) return
    setResult(testDetectorLocal(ruleType, patterns, prompt.trim()))
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); runTest() }
  }

  return (
    <div style={{
      marginTop: 4, padding: '10px 12px', borderRadius: 6,
      background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)', marginBottom: 7 }}>
        Pattern tester
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="input"
          style={{ flex: 1, fontSize: 12 }}
          placeholder="Paste a sample prompt to test…"
          value={prompt}
          onChange={e => { setPrompt(e.target.value); setResult(null) }}
          onKeyDown={handleKey}
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={runTest}
          disabled={!prompt.trim() || patterns.length === 0}
          style={{ whiteSpace: 'nowrap' }}>
          Test ▶
        </button>
      </div>
      {result && (
        <div style={{
          marginTop: 7, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5,
          color: result.error ? 'var(--warning)' : result.matched ? 'var(--ok)' : 'var(--fg-tertiary)',
        }}>
          {result.error
            ? <>⚠ {result.error}</>
            : result.matched
              ? <>✓ Matched: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--bg-surface)', padding: '1px 5px', borderRadius: 3 }}>{result.matched_pattern}</code></>
              : <>✗ No match</>}
        </div>
      )}
    </div>
  )
}


