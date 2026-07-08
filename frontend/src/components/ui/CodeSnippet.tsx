import { useState } from 'react'
import { Copy, Check } from './Icons'

export interface CodeSnippetProps {
  code: string
  language?: string
  title?: string
  copyable?: boolean
  children?: React.ReactNode
}

export function CodeSnippet({ code, language, title, copyable = true, children }: CodeSnippetProps) {
  const [copied, setCopied] = useState(false)
  function doCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="code-block" style={{ position: 'relative', fontSize: 11, maxHeight: 280, overflowY: 'auto' }}>
      {title ? (
        <div style={{ fontSize: 11, padding: '6px 10px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--fg-secondary)', fontWeight: 600 }}>
          {title}
        </div>
      ) : null}
      {copyable ? (
        <button
          className="icon-btn"
          title="Copy to clipboard"
          onClick={doCopy}
          style={{ position: 'absolute', top: title ? 34 : 8, right: 8, opacity: 0.7, zIndex: 1 }}
        >
          {copied ? <Check w={13} style={{ color: 'var(--ok)' }} /> : <Copy w={13} />}
        </button>
      ) : null}
      {language ? (
        <span style={{
          position: 'absolute', bottom: 6, right: 8,
          fontSize: 10, color: 'var(--fg-tertiary)',
          textTransform: 'uppercase', letterSpacing: '0.5px',
        }}>
          {language}
        </span>
      ) : null}
      <pre style={{ margin: 0, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {children ?? code}
      </pre>
    </div>
  )
}
