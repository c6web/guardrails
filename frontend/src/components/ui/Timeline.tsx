import React, { type ReactNode } from 'react'

export interface TimelineEvent {
  time?: string
  dot?: ReactNode
  label: string
  detail?: string
  hit?: boolean
  err?: boolean
}

export interface TimelineProps {
  events: TimelineEvent[]
  variant?: 'compact' | 'detailed'
  timeWidth?: number
}

function dotBg(ev: TimelineEvent): string {
  if (ev.hit) return 'var(--danger)'
  if (ev.err) return 'var(--warning)'
  return 'var(--accent)'
}

function labelFg(ev: TimelineEvent): string {
  if (ev.hit) return 'var(--danger)'
  if (ev.err) return 'var(--warning)'
  return 'var(--fg-primary)'
}

const Timeline: React.FC<TimelineProps> = ({
  events,
  variant = 'detailed',
  timeWidth,
}) => {
  const tw = timeWidth ?? (variant === 'compact' ? 60 : 72)
  const hasTime = events.some(e => e.time != null)
  const gridTemplateCols = hasTime ? `${tw}px 14px 1fr` : '14px 1fr'

  return (
    <div className="stack" style={{ gap: 0 }}>
      {events.map((ev, i) => {
        const isLast = i === events.length - 1
        return (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: gridTemplateCols,
              gap: 10,
              padding: variant === 'compact' ? '8px 0' : '10px 0',
              borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
            }}
          >
            {hasTime && (
              <span
                className="mono"
                style={{
                  fontSize: 11,
                  color: 'var(--fg-tertiary)',
                  alignSelf: variant === 'compact' ? 'center' : undefined,
                  paddingTop: variant === 'detailed' ? 2 : 0,
                }}
              >
                {ev.time ?? ''}
              </span>
            )}
            <span
              style={{
                display: 'flex',
                alignItems: variant === 'detailed' ? 'flex-start' : 'center',
                justifyContent: 'center',
                paddingTop: variant === 'compact' ? 4 : 5,
              }}
            >
              {ev.dot ?? (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: dotBg(ev),
                  }}
                />
              )}
            </span>
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: variant === 'compact' ? 600 : 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: labelFg(ev),
                }}
              >
                {ev.label}
              </div>
              {ev.detail && (
                <div
                  className="caption"
                  style={{
                    fontSize: 11,
                    color: 'var(--fg-secondary)',
                    marginTop: 2,
                  }}
                >
                  {ev.detail}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default Timeline
