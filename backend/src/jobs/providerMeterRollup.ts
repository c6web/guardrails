/**
 * Single-writer rollup job: aggregates ai_provider_call_logs → provider_usage_daily.
 *
 * Correctness guarantees (multi-gateway fleet):
 *   - Advisory lock: only one backend instance runs aggregation per tick.
 *   - Watermark: last_processed_at advances inside the same transaction as the UPSERT,
 *     so a crash/rollback leaves the watermark unchanged → idempotent retry, no double-count.
 *   - Allowed lateness: upper bound = now() − 60s so late-committing gateway rows settle first.
 *   - Purge safety: nothing in ai_provider_call_logs should be deleted until
 *     created_at < last_processed_at (callers must check the watermark before purging).
 */

import type { Sequelize } from 'sequelize'

const ADVISORY_LOCK_KEY = 2026061001   // arbitrary stable integer key
const LAG_SECONDS       = 60
const INTERVAL_MS       = 30_000

export function startProviderMeterRollup(logsDb: Sequelize): void {
  const tick = () => runRollup(logsDb).catch(err =>
    console.error('[providerMeterRollup] tick error:', err)
  )

  const intervalHandle = setInterval(tick, INTERVAL_MS)
  // Also fire once after a short delay on startup to warm the rollup quickly
  setTimeout(tick, 5_000)

  // Cleanup on shutdown
  const cleanup = () => { clearInterval(intervalHandle) }
  process.on('SIGTERM', cleanup)
  process.on('SIGINT', cleanup)
}

async function tryAdvisoryLock(logsDb: Sequelize): Promise<boolean> {
  const [rows] = await logsDb.query(
    `SELECT pg_try_advisory_lock(:key) AS acquired`,
    { replacements: { key: ADVISORY_LOCK_KEY }, raw: true }
  ) as [Array<{ acquired: boolean }>, unknown]
  return rows[0]?.acquired === true
}

async function releaseAdvisoryLock(logsDb: Sequelize): Promise<void> {
  await logsDb.query(
    `SELECT pg_advisory_unlock(:key)`,
    { replacements: { key: ADVISORY_LOCK_KEY }, raw: true }
  )
}

async function runRollup(logsDb: Sequelize): Promise<void> {
  const acquired = await tryAdvisoryLock(logsDb)
  if (!acquired) {
    // Another backend instance owns the lock — skip this tick
    return
  }

  try {
    await logsDb.transaction(async (t) => {
      // Lock the singleton state row for update — prevents any concurrent run
      // that somehow bypassed the advisory lock
      const [stateRows] = await logsDb.query(
        `SELECT last_processed_at FROM provider_usage_rollup_state WHERE id = 1 FOR UPDATE`,
        { transaction: t, raw: true }
      ) as [Array<{ last_processed_at: Date }>, unknown]

      if (!stateRows.length) {
        console.warn('[providerMeterRollup] rollup state row missing — skipping')
        return
      }

      const lastProcessedAt = stateRows[0].last_processed_at
      // upper = now() − LAG so in-flight gateway transactions have committed
      const upper = new Date(Date.now() - LAG_SECONDS * 1000)

      if (upper <= lastProcessedAt) {
        // Nothing to process yet
        return
      }

      // Aggregate the window and UPSERT into the rollup table
      await logsDb.query(
        `INSERT INTO provider_usage_daily
           (provider_id, provider_name, vendor, call_type, day, requests, errors, tokens_in, tokens_out, updated_at)
         SELECT
           provider_id,
           coalesce(max(provider_name), 'unknown')           AS provider_name,
           coalesce(max(vendor), 'unknown')                  AS vendor,
           call_type,
           (created_at AT TIME ZONE 'UTC')::date             AS day,
           count(*)                                          AS requests,
           count(*) FILTER (WHERE NOT success)               AS errors,
           coalesce(sum(tokens_in),  0)                      AS tokens_in,
           coalesce(sum(tokens_out), 0)                      AS tokens_out,
           now()                                             AS updated_at
         FROM ai_provider_call_logs
         WHERE provider_id IS NOT NULL
           AND created_at >= :lower
           AND created_at <  :upper
         GROUP BY provider_id, call_type, (created_at AT TIME ZONE 'UTC')::date
         ON CONFLICT (provider_id, call_type, day) DO UPDATE SET
           requests   = provider_usage_daily.requests   + EXCLUDED.requests,
           errors     = provider_usage_daily.errors     + EXCLUDED.errors,
           tokens_in  = provider_usage_daily.tokens_in  + EXCLUDED.tokens_in,
           tokens_out = provider_usage_daily.tokens_out + EXCLUDED.tokens_out,
           updated_at = now()`,
        { replacements: { lower: lastProcessedAt, upper }, transaction: t, raw: true }
      )

      // Advance the watermark — same transaction, so rollback = no advance
      await logsDb.query(
        `UPDATE provider_usage_rollup_state
         SET last_processed_at = :upper, updated_at = now()
         WHERE id = 1`,
        { replacements: { upper }, transaction: t, raw: true }
      )
    })
  } finally {
    await releaseAdvisoryLock(logsDb)
  }
}
