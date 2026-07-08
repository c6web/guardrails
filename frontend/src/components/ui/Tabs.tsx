export interface TabItem {
  key: string
  label: string
}

export interface TabsProps<K extends string = string> {
  tabs: TabItem[]
  activeKey: K
  onChange: (key: K) => void
}

function Tabs<K extends string = string>({ tabs, activeKey, onChange }: TabsProps<K>) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px', gap: 16 }}>
      {tabs.map(tab => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key as K)}
          style={{
            padding: '10px 0', fontSize: 13, fontWeight: activeKey === tab.key ? 600 : 400,
            background: 'transparent', border: 'none', cursor: 'pointer',
            borderBottom: activeKey === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
            color: activeKey === tab.key ? 'var(--accent)' : 'var(--fg-secondary)',
            transition: 'all 0.15s ease',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export default Tabs
