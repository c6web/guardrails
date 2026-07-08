import React from 'react'
import { AlertO, Terminal, Eye } from '../ui/Icons'
import { copyToClipboard } from '../../utils/format'

interface KeyRevealModalProps {
  title: string
  fullKey: string
  graceHours?: number
  onClose: () => void
}

export default function KeyRevealModal({ title, fullKey, graceHours, onClose }: KeyRevealModalProps) {
  const [copied, setCopied] = React.useState(false)
  const gatewayUrl = window.location.origin.replace(':3634', ':8080')

  async function handleCopy() {
    try {
      await copyToClipboard(fullKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch (e) {
      console.error('Copy failed', e)
    }
  }

  return (
    <div className="drawer-scrim" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 560, padding: 0 }} onClick={e => e.stopPropagation()}>
        <div className="card-hdr">
          <h3>{title}</h3>
          <div className="right"><button className="icon-btn" onClick={onClose}><Eye w={14} /></button></div>
        </div>
        <div style={{ padding: '16px 20px 20px' }}>

          {/* One-time warning */}
          <div style={{
            display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 6, marginBottom: 12,
            background: 'var(--warning-bg)', border: '1px solid var(--warning)',
            fontSize: 12, color: 'var(--warning)',
          }}>
            <AlertO w={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>This key is shown <strong>once only</strong>. Copy it now — it cannot be retrieved again. Rotate the key if you lose it.</span>
          </div>

          {/* Propagation notice */}
          <div style={{
            padding: '8px 12px', borderRadius: 6, marginBottom: 16,
            background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
            fontSize: 12, color: 'var(--fg-secondary)',
          }}>
            New API keys take <strong>up to 15 minutes</strong> to propagate to all gateway instances.
            The key will not be accepted until propagation completes.
          </div>

          {/* Grace period notice (rotation only) */}
          {graceHours !== null && (
            <div style={{
              padding: '8px 12px', borderRadius: 6, marginBottom: 16,
              background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
              fontSize: 12, color: 'var(--fg-secondary)',
            }}>
              Your <strong>previous key remains valid for {graceHours} hours</strong> to allow a smooth transition.
              Go to key details → Force revoke the old key once your app is confirmed working with the new one.
            </div>
          )}

          {/* Key display */}
          <div className="label" style={{ marginBottom: 6 }}>Your API key</div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 12px', borderRadius: 6, marginBottom: 20,
            background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
          }}>
            <span className="mono" style={{ flex: 1, fontSize: 12, wordBreak: 'break-all', lineHeight: 1.5, userSelect: 'all' }}>
              {fullKey}
            </span>
            <button className="btn btn-secondary btn-sm" onClick={handleCopy} style={{ flexShrink: 0 }}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          {/* Usage example */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Terminal w={13} style={{ color: 'var(--fg-tertiary)' }} />
              <span className="label">How to use this key</span>
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, padding: '10px 12px',
              background: 'var(--bg-sunken)', borderRadius: 6, border: '1px solid var(--border-subtle)',
              lineHeight: 1.8, color: 'var(--fg-secondary)',
            }}>
              <div style={{ color: 'var(--fg-tertiary)', marginBottom: 2 }}># OpenAI-compatible endpoint</div>
              <div>POST {gatewayUrl}/v1/chat/completions</div>
              <div style={{ marginTop: 6, color: 'var(--fg-tertiary)' }}># Authorization header</div>
              <div>Authorization: Bearer <span style={{ color: 'var(--accent)' }}>{fullKey.slice(0, 20)}…</span></div>
              <div style={{ marginTop: 6, color: 'var(--fg-tertiary)' }}># Or use as OPENAI_API_KEY / base_url</div>
              <div>OPENAI_BASE_URL={gatewayUrl}/v1</div>
              <div>OPENAI_API_KEY=<span style={{ color: 'var(--accent)' }}>{fullKey.slice(0, 20)}…</span></div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={handleCopy}>Copy key</button>
            <button className="btn btn-primary" onClick={onClose}>I've saved the key</button>
          </div>
        </div>
      </div>
    </div>
  )
}
