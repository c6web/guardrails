import React from 'react'

export interface AllowedModelEntry {
  id: string; label?: string; checked: boolean; isDefault: boolean
}

function matchFilter(text: string, filter: string): boolean {
  const q = filter.toLowerCase()
  return text.toLowerCase().includes(q)
}

const FILTER_THRESHOLD = 100

function FilterInput({ value, onChange, count, expanded, onToggle }: {
  value: string; onChange: (v: string) => void; count: number
  expanded: boolean; onToggle: () => void
}) {
  return (
    <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 6, alignItems: 'center' }}>
      <input className="input" type="search"
        placeholder={count > FILTER_THRESHOLD && !value ? `Filter ${count} models…` : 'Filter models…'}
        value={value} onChange={e => onChange(e.target.value)}
        style={{ flex: 1, boxSizing: 'border-box', fontSize: 12 }} />
      {count > FILTER_THRESHOLD && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onToggle}
          style={{ padding: '2px 6px', fontSize: 10, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {expanded ? 'Hide' : 'Show all'}
        </button>
      )}
    </div>
  )
}

function ListPlaceholder({ count }: { count: number }) {
  return (
    <div style={{
      padding: '28px 16px', textAlign: 'center', color: 'var(--fg-tertiary)', fontSize: 12,
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      {count.toLocaleString()} models available<br />
      <span style={{ fontSize: 11 }}>type in the filter above to browse</span>
    </div>
  )
}

export function AllowedModelsPicker({ entries, onToggle, onSelectAll, onSetDefault }: {
  entries: AllowedModelEntry[]
  onToggle: (id: string) => void
  onSelectAll: () => void
  onSetDefault: (id: string) => void
}) {
  const [filter, setFilter] = React.useState('')
  const [expanded, setExpanded] = React.useState(entries.length <= FILTER_THRESHOLD)
  const sorted = React.useMemo(() =>
    [...entries].sort((a, b) => a.id.localeCompare(b.id)),
    [entries])
  const filtered = filter
    ? sorted.filter(e => matchFilter(e.id, filter) || (e.label && matchFilter(e.label, filter)))
    : sorted
  const showList = (filter || entries.length <= FILTER_THRESHOLD || expanded)

  React.useEffect(() => {
    if (filter) setExpanded(true)
  }, [filter])

  return (
    <div>
      {entries.length > 0 && (
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
          <FilterInput value={filter} onChange={setFilter} count={entries.length} expanded={expanded} onToggle={() => setExpanded(v => !v)} />
          <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px', alignItems: 'center', gap: 6, padding: '6px 8px', fontSize: 10, color: 'var(--fg-tertiary)', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)' }}>
            <input type="checkbox" checked={entries.length > 0 && entries.every(a => a.checked)}
              onChange={onSelectAll} style={{ cursor: 'pointer', margin: 0 }} />
            <span>Model ID {filter && <span style={{ fontWeight: 400 }}>({filtered.length} of {entries.length})</span>}</span>
            <span>Default</span>
          </div>
          {showList ? (
            <>
              {filtered.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', fontSize: 12, color: 'var(--fg-tertiary)' }}>
                  No models match "{filter}"
                </div>
              ) : (
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {filtered.map(entry => (
                    <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px', alignItems: 'center', gap: 6, padding: '8px', borderBottom: '1px solid var(--border-subtle)', fontSize: 12, opacity: entry.checked ? 1 : 0.5 }}>
                      <input type="checkbox" checked={entry.checked} onChange={() => onToggle(entry.id)} style={{ cursor: 'pointer', margin: 0 }} />
                      <div>
                        <span style={{ fontWeight: 500 }}>{entry.id}</span>
                        {entry.label && <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginLeft: 4 }}>{entry.label}</span>}
                      </div>
                      {entry.checked && (
                        <button type="button" className="icon-btn" style={{ fontSize: 14, color: entry.isDefault ? 'var(--accent)' : 'var(--fg-tertiary)' }}
                          onClick={() => onSetDefault(entry.id)} title={entry.isDefault ? 'Default model' : 'Set as default model'}>
                          {entry.isDefault ? '\u2605' : '\u2606'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <ListPlaceholder count={entries.length} />
          )}
        </div>
      )}
    </div>
  )
}

export function SingleModelPicker({ selected, options, onSelect, note }: {
  selected: string | null
  options: { id: string; label?: string }[]
  onSelect: (id: string) => void
  note: string | null
}) {
  const [filter, setFilter] = React.useState('')
  const [expanded, setExpanded] = React.useState(options.length <= FILTER_THRESHOLD)
  const sorted = React.useMemo(() =>
    [...options].sort((a, b) => a.id.localeCompare(b.id)),
    [options])
  const filtered = filter
    ? sorted.filter(o => matchFilter(o.id, filter) || (o.label && matchFilter(o.label, filter)))
    : sorted
  const showList = (filter || options.length <= FILTER_THRESHOLD || expanded)
  const selectedOpt = selected ? options.find(o => o.id === selected) : undefined

  React.useEffect(() => {
    if (filter) setExpanded(true)
  }, [filter])

  return (
    <div>
      {options.length > 0 && (
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
          <FilterInput value={filter} onChange={setFilter} count={options.length} expanded={expanded} onToggle={() => setExpanded(v => !v)} />
          {filter && (
            <div style={{ padding: '4px 8px', fontSize: 10, color: 'var(--fg-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}>
              {filtered.length} of {options.length} models
            </div>
          )}
          {showList ? (
            <>
              {filtered.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', fontSize: 12, color: 'var(--fg-tertiary)' }}>
                  No models match "{filter}"
                </div>
              ) : (
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {filtered.map(opt => (
                    <label key={opt.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                      cursor: 'pointer', fontSize: 12,
                      borderBottom: '1px solid var(--border-subtle)',
                      background: selected === opt.id ? 'var(--accent-subtle, rgba(99,102,241,0.08))' : 'transparent',
                    }}>
                      <input type="radio" name="single-model" checked={selected === opt.id}
                        onChange={() => onSelect(opt.id)} style={{ cursor: 'pointer', margin: 0 }} />
                      <div>
                        <span style={{ fontWeight: 500 }}>{opt.id}</span>
                        {opt.label && <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginLeft: 4 }}>{opt.label}</span>}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {selectedOpt && (
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                  cursor: 'pointer', fontSize: 12,
                  borderBottom: '1px solid var(--border-subtle)',
                  background: 'var(--accent-subtle, rgba(99,102,241,0.08))',
                }}>
                  <input type="radio" name="single-model" checked={true}
                    onChange={() => onSelect(selectedOpt.id)} style={{ cursor: 'pointer', margin: 0 }} />
                  <div>
                    <span style={{ fontWeight: 500 }}>{selectedOpt.id}</span>
                    {selectedOpt.label && <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginLeft: 4 }}>{selectedOpt.label}</span>}
                  </div>
                </label>
              )}
              <ListPlaceholder count={options.length} />
            </>
          )}
        </div>
      )}
      {note && (
        <p style={{ fontSize: 11, color: 'var(--fg-tertiary)', margin: '4px 0 0' }}>{note}</p>
      )}
    </div>
  )
}
