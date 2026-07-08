import { useEffect, useState } from 'react'
import { Chip, LoadingState } from '../../components/ui'
import {
  getEmbeddingProviders,
  getEmbeddingProviderConfig,
  type EmbeddingProvider,
  type EmbeddingProviderConfig,
} from '../../api/embeddingProviders'
import { LayersRi, ExternalLink } from '../../components/ui/Icons'

function ProviderCard({ provider, role, connected }: {
  provider: EmbeddingProvider
  role: string
  connected?: boolean
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: '10px 12px', borderRadius: 6,
      background: 'var(--bg-sunken)',
      border: '1px solid var(--border-subtle)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
        <Chip kind="muted" mono>{role}</Chip>
        <Chip kind={connected ? 'ok' : 'muted'} dot>{connected ? 'connected' : 'configured'}</Chip>
      </div>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{provider.name}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Chip kind="info" mono>{provider.vendor}</Chip>
        {provider.model && <Chip kind="muted" mono>{provider.model}</Chip>}
        {provider.dimensions && <Chip kind="muted" mono>{provider.dimensions}d</Chip>}
      </div>
    </div>
  )
}

export default function EmbeddingTestProviderPanel() {
  const [providers, setProviders] = useState<EmbeddingProvider[]>([])
  const [config, setConfig] = useState<EmbeddingProviderConfig | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getEmbeddingProviders().catch(() => [] as EmbeddingProvider[]),
      getEmbeddingProviderConfig().catch(() => null),
    ]).then(([p, c]) => {
      setProviders(p)
      setConfig(c)
    }).finally(() => setLoading(false))
  }, [])

  const byId = new Map(providers.map(p => [p.id, p]))
  const primary   = config?.primary_id ? byId.get(config.primary_id) ?? null : null
  const backup1   = config?.backup1_id ? byId.get(config.backup1_id) ?? null : null
  const backup2   = config?.backup2_id ? byId.get(config.backup2_id) ?? null : null

  const hasChain = !!primary

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card-hdr">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <LayersRi w={14} />
          <h3>Embedding Providers</h3>
        </div>
        <div className="right">
          <a href="/#/embedding-providers" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent)' }}>
            Manage <ExternalLink w={10} />
          </a>
        </div>
      </div>
      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <LoadingState message="Loading providers…" size="sm" />
        ) : !hasChain ? (
          <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', lineHeight: 1.5 }}>
            No embedding providers configured. The gateway requires at least a primary provider to generate embeddings.
          </div>
        ) : (
          <>
            <ProviderCard provider={primary} role="Primary" connected />
            {backup1 && <ProviderCard provider={backup1} role="Backup 1" />}
            {backup2 && <ProviderCard provider={backup2} role="Backup 2" />}
          </>
        )}
      </div>
    </div>
  )
}
