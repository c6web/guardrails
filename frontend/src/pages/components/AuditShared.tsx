import { Chip, FILTER_INPUT_STYLE } from '../../components/ui'

// ── Shared form input style (re-exported from ui/forms) ───────────────────────

export const inputStyle = FILTER_INPUT_STYLE

// ── JSON block display ────────────────────────────────────────────────────────

export function JsonBlock({ data }: { data: string | Record<string, unknown> | null }) {
  if (!data) return <span className="caption">—</span>
  const text = typeof data === 'string' ? data : JSON.stringify(data)
  return (
    <pre style={{
      margin: 0, padding: '8px 10px', borderRadius: 4,
      background: 'var(--bg-sunken)', fontSize: 11,
      fontFamily: 'var(--font-mono)', overflowX: 'auto',
      color: 'var(--fg-secondary)', lineHeight: 1.5,
      border: '1px solid var(--border-subtle)',
    }}>
      {text.slice(0, 200)}{text.length > 200 ? '…' : ''}
    </pre>
  )
}

// ── Pagination (re-exported from ui for backward compat) ──────────────────────

export { Pagination } from '../../components/ui'

// ── Audit row helpers (ComplianceTab) ─────────────────────────────────────────

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'user.invite':        'User invited',
  'apikey.rotate':      'API key rotated',
  'app.create':         'App created',
  'apikey.revoke':      'API key revoked',
  'user.role_change':   'User role changed',
  'app.status_change':  'App status changed',
  'apikey.create':      'API key created',
}

export const ALL_AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABELS) as string[]

export const AUDIT_RESOURCE_LABELS: Record<string, string> = {
  'user':          'User',
  'api_key':       'API Key',
  'connected_app': 'Connected App',
}

export const ALL_RESOURCE_TYPES = Object.keys(AUDIT_RESOURCE_LABELS) as string[]

export function auditActionChip(action: string) {
  const label = AUDIT_ACTION_LABELS[action] ?? action
  return <span className="caption">{label}</span>
}

export function resourceChip(resourceType: string) {
  const label = AUDIT_RESOURCE_LABELS[resourceType] ?? resourceType
  return <Chip kind="muted" dot>{label}</Chip>
}
