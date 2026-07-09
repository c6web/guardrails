export interface AllowedModelEntry {
  id: string; label?: string; checked: boolean; isDefault: boolean
}

export function AllowedModelsPicker({ entries, onToggle, onSelectAll, onSetDefault }: {
  entries: AllowedModelEntry[]
  onToggle: (id: string) => void
  onSelectAll: () => void
  onSetDefault: (id: string) => void
}) {
  return (
    <div>
      {entries.length > 0 && (
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px', alignItems: 'center', gap: 6, padding: '6px 8px', fontSize: 10, color: 'var(--fg-tertiary)', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)' }}>
            <input type="checkbox" checked={entries.length > 0 && entries.every(a => a.checked)}
              onChange={onSelectAll} style={{ cursor: 'pointer', margin: 0 }} />
            <span>Model ID</span>
            <span>Default</span>
          </div>
          {entries.map(entry => (
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
    </div>
  )
}

export function SingleModelPicker({ selected, options, onSelect, note }: {
  selected: string | null
  options: { id: string; label?: string }[]
  onSelect: (id: string) => void
  note: string | null
}) {
  return (
    <div>
      {options.length > 0 && (
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
          {options.map(opt => (
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
      {note && (
        <p style={{ fontSize: 11, color: 'var(--fg-tertiary)', margin: '4px 0 0' }}>{note}</p>
      )}
    </div>
  )
}
