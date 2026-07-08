import { StatRow, StatCard } from '../../components/ui'

interface QualityStats {
  qualityGood?: number
  qualityPoison?: number
  qualityPoor?: number
  qualityReviewed?: number
  qualityNotReviewed?: number
}

export function QualityStatsRow({ stats, total }: { stats: QualityStats | null; total: number }) {
  if (!stats) return null
  return (
    <StatRow>
      <StatCard variant="compact" label="Poison" value={stats.qualityPoison ?? 0} accent="var(--danger)" borderColor="var(--danger)" />
      <StatCard variant="compact" label="Poor quality" value={stats.qualityPoor ?? 0} accent="var(--warn)" borderColor="var(--warn)" />
      <StatCard variant="compact" label="Good" value={stats.qualityGood ?? 0} accent="var(--ok)" borderColor="var(--ok)" />
      <StatCard variant="compact" label="Not reviewed" value={stats.qualityNotReviewed ?? total} accent="var(--fg-tertiary)" />
    </StatRow>
  )
}
