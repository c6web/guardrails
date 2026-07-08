import React, { useEffect, useState } from 'react'
import { getEncryptionStatus, triggerLogMigration, type EncryptionStatusData, type TableStatus } from '../../api/settings'
import { Check, AlertTri, RefreshCw } from '../../components/ui/Icons'
import { LoadingState } from '../../components/ui'

const EncryptionStatusCard: React.FC = () => {
  const [status, setStatus] = useState<EncryptionStatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [migrating, setMigrating] = useState(false)
  const [migrateMsg, setMigrateMsg] = useState<string | null>(null)

  const fetchStatus = () => {
    setLoading(true)
    getEncryptionStatus()
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchStatus() }, [])

  const handleMigrate = async () => {
    setMigrating(true)
    try {
      const res = await triggerLogMigration()
      setMigrateMsg(res.message)
      if (res.status === 'started') {
        setTimeout(fetchStatus, 2000)
      }
    } catch (err) {
      setMigrateMsg((err as Error).message || 'Migration failed')
    } finally {
      setMigrating(false)
    }
  }

  if (loading) return <LoadingState message="Loading encryption status…" size="sm" />

  if (!status) return null

  const allMigrated = status.all_v2
  const tier1Tables = status.tables.filter(t => !['ai_request_logs', 'embedding_logs', 'ai_provider_call_logs'].includes(t.table))
  const tier2Tables = status.tables.filter(t => ['ai_request_logs', 'embedding_logs', 'ai_provider_call_logs'].includes(t.table))
  const totalLegacy = status.tables.reduce((sum, t) => sum + t.legacy, 0)

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            {allMigrated ? <> <Check w={14} /> All ciphertext migrated to v2 (HKDF)</> : <>Encryption Migration Status</>}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
            color: allMigrated ? 'var(--accent)' : 'var(--text-warning)',
            background: allMigrated ? 'rgba(118, 180, 0, 0.12)' : 'rgba(217, 163, 46, 0.12)',
            padding: '2px 8px', borderRadius: 4,
          }}>
            {allMigrated ? 'migrated' : `${totalLegacy} legacy`}
          </span>
        </div>

        {!allMigrated && (
          <div style={{ fontSize: 13, color: 'var(--fg-secondary)', marginBottom: 12 }}>
            Encryption uses domain-separated HKDF keys. Legacy ciphertext encrypted with the old single-key scheme should be re-encrypted.
          </div>
        )}

        {/* Tier-1 tables */}
        {tier1Tables.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>
              Tier 1 — Admin tables (auto-migrated via npm run migrate)
            </div>
            {tier1Tables.map(t => (
              <TableRow key={t.table} status={t} />
            ))}
          </div>
        )}

        {/* Tier-2 tables */}
        {tier2Tables.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>
              Tier 2 — Log tables (on-demand backfill)
            </div>
            {tier2Tables.map(t => (
              <TableRow key={t.table} status={t} />
            ))}
            {tier2Tables.some(t => t.legacy > 0) && (
              <button
                className="btn btn-sm btn-primary"
                onClick={handleMigrate}
                disabled={migrating}
                style={{ marginTop: 8 }}
              >
                {migrating ? <><RefreshCw w={12} /> Migrating…</> : 'Migrate Log Fields'}
              </button>
            )}
          </div>
        )}

        {migrateMsg && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--fg-secondary)' }}>{migrateMsg}</div>
        )}
      </div>
    </div>
  )
}

function TableRow({ status: t }: { status: TableStatus }) {
  const done = t.legacy === 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
      <span style={{ color: 'var(--fg-secondary)', fontFamily: 'monospace' }}>
        {t.table}.{t.column}
      </span>
      <span style={{ color: done ? 'var(--accent)' : 'var(--text-warning)', fontWeight: 500 }}>
        {done ? <Check w={11} /> : <AlertTri w={11} />}
        {' '}v2: {t.v2} / legacy: {t.legacy}
        {t.total > 0 && ` (${t.total})`}
      </span>
    </div>
  )
}

export default EncryptionStatusCard
