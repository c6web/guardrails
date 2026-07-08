import React, { useEffect, useState } from 'react'
import { Chip, LoadingState } from '../../components/ui'
import { Shield, ShieldCheck, Eye, Bolt, Filter, BookOpen, ZapRi, Cpu } from '../../components/ui/Icons'
import type { App, AppDetectorItem, AppThreatKnowledgeItem, AppToolGuardrailItem } from '../../types'
import { getAppDetectors, getAppThreatKnowledge, getAppToolGuardrails } from '../../api/apps'

type ChipKind = 'ok' | 'warn' | 'muted'

export const MODE_META: Record<App['mode'], {
  label: string; color: string; chip: ChipKind
  Icon: React.FC<{ w?: number; style?: React.CSSProperties }>; desc: string
}> = {
  guard:   { label: 'Guard',   color: 'var(--ok, #76B400)',     chip: 'ok',    Icon: Shield,     desc: 'Analyses every prompt and response, and blocks anything over policy thresholds.' },
  soft:    { label: 'Soft',    color: 'var(--info, #0EA5E9)',   chip: 'ok',    Icon: ShieldCheck, desc: 'Analyses every prompt; on a policy hit it returns a polite, AI-written decline instead of an error — and never forwards the unsafe prompt.' },
  monitor: { label: 'Monitor', color: 'var(--warn, #D9A32E)',   chip: 'warn',  Icon: Eye,        desc: 'Analyses traffic but never blocks — violations are logged only.' },
  bypass:  { label: 'Bypass',  color: 'var(--fg-tertiary)',     chip: 'muted', Icon: Bolt,       desc: 'Skips all prompt analysis — requests are forwarded immediately.' },
}

function Section({ icon, title, count, total, children }: {
  icon: React.ReactNode; title: string; count: number; total?: number; children: React.ReactNode
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {icon}
        <span className="label-strong" style={{ fontSize: 12 }}>{title}</span>
        <Chip kind={count > 0 ? 'ok' : 'muted'} mono>
          {total != null ? `${count}/${total}` : `${count}`}
        </Chip>
      </div>
      {children}
    </div>
  )
}

function ListBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      border: '1px solid var(--border-subtle)', borderRadius: 6,
      maxHeight: 150, overflowY: 'auto', background: 'var(--bg-canvas)',
    }}>
      {children}
    </div>
  )
}

function emptyRow(text: string) {
  return <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', padding: '10px 12px' }}>{text}</div>
}

export function PromptTestingInspector({ app }: { app: App | null }) {
  const [loading, setLoading] = useState(false)
  const [dets, setDets]       = useState<AppDetectorItem[]>([])
  const [tk, setTk]           = useState<AppThreatKnowledgeItem[]>([])
  const [tools, setTools]     = useState<AppToolGuardrailItem[]>([])

  useEffect(() => {
    if (!app) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      getAppDetectors(app.id),
      getAppThreatKnowledge(app.id),
      getAppToolGuardrails(app.id),
    ]).then(([d, k, t]) => {
      if (cancelled) return
      setDets(d.data); setTk(k.data); setTools(t.data)
    }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [app?.id])

  const activeDets   = dets.filter(d => d.enabled)
  const enabledTk    = tk.filter(t => t.enabled)
  const blockedTools = tools.filter(t => t.blocked)

  if (!app) {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="card-hdr"><h3>Policy Inspector</h3></div>
        <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--fg-tertiary)', fontSize: 12 }}>
          <Cpu w={22} style={{ opacity: 0.4, marginBottom: 10 }} />
          <div>Select an API key to inspect the connected app's active security policy.</div>
        </div>
      </div>
    )
  }

  const mode = MODE_META[app.mode] ?? MODE_META.guard
  const ModeIcon = mode.Icon
  const scanSkipped = app.mode === 'bypass'

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card-hdr"><h3>Policy Inspector</h3></div>

      <div style={{ padding: '14px 16px', overflowY: 'auto' }}>
        {/* App + mode */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Cpu w={14} style={{ color: 'var(--accent)' }} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>{app.name}</span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, color: mode.color, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <ModeIcon w={13} /> {mode.label}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', lineHeight: 1.45 }}>{mode.desc}</div>

        {loading ? (
          <LoadingState message="Loading policy…" size="sm" />
        ) : (
          <>
            {/* Scanners */}
            <Section
              icon={<Filter w={13} style={{ color: 'var(--fg-secondary)' }} />}
              title="Detection Rules" count={activeDets.length}
            >
              {scanSkipped && (
                <div style={{ fontSize: 10, color: 'var(--warn, #D9A32E)', marginBottom: 6 }}>
                  Skipped while app is in bypass mode.
                </div>
              )}
              <ListBox>
                {activeDets.length === 0 ? emptyRow('No detection rules active.') : activeDets.map(d => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--border-subtle)', fontSize: 11, opacity: scanSkipped ? 0.55 : 1 }}>
                    <span style={{ flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                    <span className="filter-chip active" style={{ height: 16, padding: '0 5px', fontSize: 9 }}>{d.scanning_scope}</span>
                  </div>
                ))}
              </ListBox>
            </Section>

            {/* Threat Knowledge */}
            <Section
              icon={<BookOpen w={13} style={{ color: 'var(--fg-secondary)' }} />}
              title="Threat Knowledge" count={enabledTk.length} total={tk.length}
            >
              <ListBox>
                {enabledTk.length === 0 ? emptyRow('No threat knowledge enabled.') : enabledTk.map(t => (
                  <div key={t.id} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-subtle)', fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                ))}
              </ListBox>
            </Section>

            {/* Tool Guardrails */}
            <Section
              icon={<ZapRi w={13} style={{ color: 'var(--fg-secondary)' }} />}
              title="Tool Use Blocking" count={blockedTools.length}
            >
              <ListBox>
                {blockedTools.length === 0 ? emptyRow('No tools blocked for this app.') : blockedTools.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--border-subtle)', fontSize: 11 }}>
                    <span className="mono" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.tool_name}</span>
                    <Chip kind="err">blocked</Chip>
                  </div>
                ))}
              </ListBox>
            </Section>
          </>
        )}
      </div>
    </div>
  )
}
