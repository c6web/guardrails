import React from 'react'
import { Chip, KV, Drawer } from '../../components/ui'
import { Trash2, DatabaseRi } from '../../components/ui/Icons'
import type { AiProviderCallLogRecord } from '../../api/aiProviderCallLogs'
import { fmtAgeFromIso, copyToClipboard } from '../../utils/format'

export function fmtMs(ms: number) {
  if (!ms && ms !== 0) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`
}

export function isTimeoutError(errorMessage?: string | null): boolean {
  return !!errorMessage && errorMessage.startsWith('[timeout')
}

export function callTypeKind(ct: string): 'info' | 'warn' | 'ok' | 'muted' {
  if (ct === 'upstream') return 'ok'
  if (ct === 'classifier' || ct === 'knowledge_dev' || ct === 'cache') return 'info'
  if (ct === 't2' || ct === 'content_quality') return 'warn'
  return 'muted'
}

export { Pagination } from '../../components/ui'

function JsonPayload({ label, data }: { label: string; data: unknown }) {
  const [copied, setCopied] = React.useState(false)
  const text = data === null ? null : (typeof data === 'string' ? data : JSON.stringify(data, null, 2))

  function handleCopy() {
    if (!text) return
    copyToClipboard(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }).catch(() => {})
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span className="label">{label}</span>
        {text && (
          <button className="icon-btn" style={{ gap: 4, fontSize: 11 }} onClick={handleCopy}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        )}
      </div>
      {text ? (
        <pre style={{
          margin: 0, padding: '8px 10px', borderRadius: 4,
          background: 'var(--bg-sunken)', fontSize: 11,
          fontFamily: 'var(--font-mono)', overflowX: 'auto',
          color: 'var(--fg-secondary)', lineHeight: 1.5,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          maxHeight: 360, overflowY: 'auto',
          border: '1px solid var(--border-subtle)',
        }}>
          {text}
        </pre>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', fontStyle: 'italic' }}>Not recorded.</div>
      )}
    </div>
  )
}

export function DetailDrawer({ row, open, onClose, onDelete }: { row: AiProviderCallLogRecord; onClose: () => void; onDelete?: () => void; open?: boolean }) {
  return (
    <Drawer
      open={open}
      title={
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DatabaseRi w={14} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>{row.id}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 2 }}>
            {row.provider_name ?? '—'} · {row.model ?? '—'} · <Chip kind={callTypeKind(row.call_type)}>{row.call_type}</Chip>
          </div>
        </>
      }
      onClose={onClose}
      footer={onDelete && (
        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={onDelete}>
          <Trash2 w={13} /> Delete this record
        </button>
      )}
    >
      <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
        <KV labelWidth={100} gap={8} style={{ marginBottom: 18 }} rows={[
          { label: 'Status', value: row.success
              ? <Chip kind="ok" dot>Success</Chip>
              : <span style={{ display: 'flex', gap: 6 }}>
                  <Chip kind="err" dot>Failed</Chip>
                  {isTimeoutError(row.error_message) && <Chip kind="warn">Timeout</Chip>}
                </span> },
          { label: 'Call type', value: <Chip kind={callTypeKind(row.call_type)}>{row.call_type}</Chip> },
          { label: 'Source', value: <Chip kind="muted">{row.source}</Chip> },
          { label: 'Duration', value: <span style={{ fontSize: 12 }}>{fmtMs(row.duration_ms)}</span>, mono: true },
          { label: 'HTTP status', value: <span style={{ fontSize: 12 }}>{row.status_code ?? '—'}</span>, mono: true },
          { label: 'Tokens in', value: <span style={{ fontSize: 12 }}>{row.tokens_in?.toLocaleString() ?? '—'}</span>, mono: true },
          { label: 'Tokens out', value: <span style={{ fontSize: 12 }}>{row.tokens_out?.toLocaleString() ?? '—'}</span>, mono: true },
          { label: 'Tokens total', value: <span style={{ fontSize: 12 }}>{row.tokens_total?.toLocaleString() ?? '—'}</span>, mono: true },
          { label: 'Time', value: <span style={{ fontSize: 12 }}>{fmtAgeFromIso(row.created_at)}</span>, mono: true },
          { label: 'Provider', value: <span>{row.provider_name ?? '—'}</span> },
          { label: 'Vendor', value: <span style={{ fontSize: 12 }}>{row.vendor ?? '—'}</span>, mono: true },
          { label: 'Model', value: <span style={{ fontSize: 12 }}>{row.model ?? '—'}</span>, mono: true },
          row.endpoint && { label: 'Endpoint', value: <span style={{ fontSize: 11, wordBreak: 'break-all' }}>{row.endpoint}</span>, mono: true },
          row.app_name && { label: 'App', value: <span>{row.app_name}</span> },
          row.request_id && { label: 'Request ID', value: <span style={{ fontSize: 11, wordBreak: 'break-all' }}>{row.request_id}</span>, mono: true },
          row.triggered_by && { label: 'Triggered by', value: <span>{row.triggered_by}</span> },
        ]} />

        {row.error_message && (
          <div style={{ marginBottom: 18 }}>
            <div className="label" style={{ marginBottom: 6 }}>Error</div>
            <pre style={{
              margin: 0, padding: '8px 10px', borderRadius: 4,
              background: 'var(--bg-sunken)', fontSize: 11,
              fontFamily: 'var(--font-mono)', color: 'var(--err)', lineHeight: 1.5,
              border: '1px solid var(--border-subtle)',
            }}>
              {row.error_message}
            </pre>
          </div>
        )}

        <JsonPayload label="Request payload" data={row.request_payload} />
        <JsonPayload label="Response payload" data={row.response_payload} />
      </div>
    </Drawer>
  )
}
