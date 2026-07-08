import { useState } from 'react'
import { Eye, EyeOff } from './Icons'

export default function JsonPayload({ data, label }: { data: string | null; label: string }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  if (!data) {
    return (
      <div style={{ marginBottom: 16 }}>
        <div className="label-strong" style={{ marginBottom: 6 }}>{label}</div>
        <div className="caption" style={{ fontStyle: 'italic' }}>Not recorded for this request.</div>
      </div>
    )
  }
  let formatted = data
  try {
    formatted = JSON.stringify(JSON.parse(data), null, 2)
  } catch {
    // not valid JSON — show raw text
  }
  const lineCount = formatted.split('\n').length
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: open ? 6 : 0 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 8px' }}>
          {open ? <EyeOff w={14} /> : <Eye w={14} />}
          <span className="label-strong">{label}</span>
          <span className="caption" style={{ marginLeft: 4 }}>({lineCount} lines)</span>
        </button>
        {open && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={() => {
              navigator.clipboard.writeText(formatted)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
      {open && (
        <pre style={{
          margin: 0, padding: '10px 12px', borderRadius: 6,
          background: 'var(--bg-sunken)', fontSize: 12,
          fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap',
          wordBreak: 'break-word', color: 'var(--fg-secondary)',
          border: '1px solid var(--border-subtle)', lineHeight: 1.6,
          maxHeight: 400, overflow: 'auto',
        }}>
          {formatted}
        </pre>
      )}
    </div>
  )
}
