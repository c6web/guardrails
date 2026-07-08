import { Router } from 'express'
import type { Request, Response } from 'express'
import { Op, type Sequelize } from 'sequelize'
import type { ILogStore } from '../logs/ILogStore'
import { requireAuth } from '../middleware/auth'
import { getAccessibleAppIds } from '../utils/appAccess'
import { AiRequestLog } from '../models/logs-db/AiRequestLog'

export function createStatsRouter(logStore: ILogStore, dataSequelize?: Sequelize): Router {
  const router = Router()

  async function queryRaw(sequelize: NonNullable<typeof logStore.sequelize>, sql: string, params: unknown[]): Promise<Record<string, unknown>[]> {
    const [rows] = await sequelize.query(sql, { replacements: params, raw: true }) as [unknown[], unknown]
    return rows as Record<string, unknown>[]
  }

  async function queryDataRaw(sql: string, params: unknown[]): Promise<Record<string, unknown>[]> {
    if (!dataSequelize) return []
    const [rows] = await dataSequelize.query(sql, { replacements: params, raw: true }) as [unknown[], unknown]
    return rows as Record<string, unknown>[]
  }

  // Classifies a request row into one of 4 traffic states based on `action` (what the
  // gateway actually did) and `status_code` — never `flagged` (which only means "a threat
  // was detected", not "was blocked") and never `status_code` alone (a blocked_output row
  // can still carry status_code=200).
  //   block = real firewall block (threat block, invalid/missing key, ACL, rate limit, etc.)
  //   flag  = threat detected but forwarded per policy (flag/guard or monitor mode)
  //   error = forwarded past the firewall, but the upstream provider itself failed
  //   allow = forwarded past the firewall and a real 2xx response came back
  const ACTION_STATE_CASE = `
    CASE
      WHEN action IN ('blocked', 'blocked_output') THEN 'block'
      WHEN action IN ('flagged', 'monitored') THEN 'flag'
      WHEN action IN ('forwarded', 'bypassed', 'redacted', 'redacted_output', 'embedding') AND status_code BETWEEN 200 AND 299 THEN 'allow'
      ELSE 'error'
    END
  `

  // Build an app_id filter clause for raw SQL. Returns { clause, params } where
  // clause is either '' (unrestricted) or 'AND app_id IN (...)'.
  function buildAppFilter(appIds: string[] | null): { clause: string; params: string[] } {
    if (appIds === null) return { clause: '', params: [] }
    if (appIds.length === 0) return { clause: 'AND 1=0', params: [] }
    const placeholders = appIds.map(() => '?').join(', ')
    return { clause: `AND app_id IN (${placeholders})`, params: appIds }
  }

  router.get('/overview', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const sequelize = logStore.sequelize
      if (!sequelize) throw new Error('Sequelize not initialized')

      const appIds = await getAccessibleAppIds(req)

      const now = new Date()
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      if (appIds !== null && appIds.length === 0) {
        const hourMs = 60 * 60 * 1000
        const startOfFirstBin = new Date(Math.floor(twentyFourHoursAgo.getTime() / hourMs) * hourMs)
        const numBars = Math.floor((now.getTime() - startOfFirstBin.getTime()) / hourMs) + 1
        const volume_bars = Array.from({ length: numBars }, (_, i) => ({ hour: new Date(startOfFirstBin.getTime() + i * hourMs).toISOString(), total: 0, allowed: 0, flagged: 0, error: 0, blocked: 0, tokens: 0 }))
        res.json({ requests_24h: 0, allowed_24h: 0, flagged_24h: 0, error_24h: 0, blocked_24h: 0, threat_rate: 0, flag_rate: 0, error_rate: 0, avg_latency_ms: 0, top_model: 'unknown', tokens_in_24h: 0, tokens_out_24h: 0, volume_bars })
        return
      }

      const where: Record<string, unknown> = { created_at: { [Op.gte]: twentyFourHoursAgo } }
      if (appIds !== null) {
        where.app_id = { [Op.in]: appIds }
      }

      const [latencyRow, modelRows, tokenRow, countsRow, volumeRows] = await Promise.all([
        AiRequestLog.findOne({
          attributes: [[sequelize.fn('ROUND', sequelize.fn('AVG', sequelize.col('duration_ms'))), 'avg']],
          where,
          raw: true,
        }),
        AiRequestLog.findAll({
          attributes: ['model', [sequelize.fn('COUNT', sequelize.col('*')), 'cnt']],
          where,
          group: [sequelize.col('model')],
          order: [[sequelize.literal('cnt'), 'DESC']],
          limit: 1,
          raw: true,
        }),
        AiRequestLog.findOne({
          attributes: [
            [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('tokens_in')), 0), 'tokens_in'],
            [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('tokens_out')), 0), 'tokens_out'],
          ],
          where,
          raw: true,
        }),
        AiRequestLog.findOne({
          attributes: [
            [sequelize.fn('COUNT', sequelize.col('*')), 'total'],
            [sequelize.literal(`COUNT(*) FILTER (WHERE (${ACTION_STATE_CASE}) = 'allow')`), 'allowed'],
            [sequelize.literal(`COUNT(*) FILTER (WHERE (${ACTION_STATE_CASE}) = 'flag')`), 'flagged'],
            [sequelize.literal(`COUNT(*) FILTER (WHERE (${ACTION_STATE_CASE}) = 'error')`), 'error'],
            [sequelize.literal(`COUNT(*) FILTER (WHERE (${ACTION_STATE_CASE}) = 'block')`), 'blocked'],
          ],
          where,
          raw: true,
        }),
        AiRequestLog.findAll({
          attributes: [
            [sequelize.fn('date_trunc', 'hour', sequelize.col('created_at')), 'hour_bucket'],
            [sequelize.fn('COUNT', sequelize.col('*')), 'total'],
            [sequelize.literal(`COUNT(*) FILTER (WHERE (${ACTION_STATE_CASE}) = 'allow')`), 'allowed'],
            [sequelize.literal(`COUNT(*) FILTER (WHERE (${ACTION_STATE_CASE}) = 'flag')`), 'flagged'],
            [sequelize.literal(`COUNT(*) FILTER (WHERE (${ACTION_STATE_CASE}) = 'error')`), 'error'],
            [sequelize.literal(`COUNT(*) FILTER (WHERE (${ACTION_STATE_CASE}) = 'block')`), 'blocked'],
            [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('tokens_in')), 0), 'tokens_in'],
            [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('tokens_out')), 0), 'tokens_out'],
          ],
          where,
          group: [sequelize.fn('date_trunc', 'hour', sequelize.col('created_at'))],
          order: [[sequelize.fn('date_trunc', 'hour', sequelize.col('created_at')), 'ASC']],
          raw: true,
        }),
      ])

      const avg_latency_ms = Number((latencyRow as unknown as Record<string, unknown> | null)?.avg || 0)
      const top_model = ((modelRows as unknown as Record<string, unknown>[])?.[0]?.model as string) || 'unknown'
      const tokens_in_24h = Number((tokenRow as unknown as Record<string, unknown> | null)?.tokens_in || 0)
      const tokens_out_24h = Number((tokenRow as unknown as Record<string, unknown> | null)?.tokens_out || 0)

      const counts = countsRow as unknown as Record<string, unknown> | null
      const requests_24h = Number(counts?.total || 0)
      const allowed_24h = Number(counts?.allowed || 0)
      const flagged_24h = Number(counts?.flagged || 0)
      const error_24h = Number(counts?.error || 0)
      const blocked_24h = Number(counts?.blocked || 0)
      const threat_rate = requests_24h > 0 ? Math.round((blocked_24h / requests_24h) * 1000) / 1000 : 0
      const flag_rate = requests_24h > 0 ? Math.round((flagged_24h / requests_24h) * 1000) / 1000 : 0
      const error_rate = requests_24h > 0 ? Math.round((error_24h / requests_24h) * 1000) / 1000 : 0

      const volumeByHour = new Map<string, { total: number; allowed: number; flagged: number; error: number; blocked: number; tokens: number }>()
      for (const r of (volumeRows as unknown as Record<string, unknown>[])) {
        const key = new Date(r.hour_bucket as string).toISOString().substring(0, 13)
        volumeByHour.set(key, {
          total: Number(r.total || 0),
          allowed: Number(r.allowed || 0),
          flagged: Number(r.flagged || 0),
          error: Number(r.error || 0),
          blocked: Number(r.blocked || 0),
          tokens: Number(r.tokens_in || 0) + Number(r.tokens_out || 0),
        })
      }

      const hourMs = 60 * 60 * 1000
      const startOfFirstBin = new Date(Math.floor(twentyFourHoursAgo.getTime() / hourMs) * hourMs)
      const numBars = Math.floor((now.getTime() - startOfFirstBin.getTime()) / hourMs) + 1
      const volume_bars: { hour: string; total: number; allowed: number; flagged: number; error: number; blocked: number; tokens: number }[] = []
      for (let i = 0; i < numBars; i++) {
        const binStart = new Date(startOfFirstBin.getTime() + i * hourMs)
        const key = binStart.toISOString().substring(0, 13)
        const data = volumeByHour.get(key) || { total: 0, allowed: 0, flagged: 0, error: 0, blocked: 0, tokens: 0 }
        volume_bars.push({ hour: binStart.toISOString(), ...data })
      }

      res.json({ requests_24h, allowed_24h, flagged_24h, error_24h, blocked_24h, threat_rate, flag_rate, error_rate, avg_latency_ms, top_model, tokens_in_24h, tokens_out_24h, volume_bars })
    } catch (err) {
      console.error('[Stats] Overview error:', err)
      res.status(500).json({ error: 'Failed to fetch overview stats' })
    }
  })

  router.get('/framework-counts', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const sequelize = logStore.sequelize
      if (!sequelize) throw new Error('Sequelize not initialized')

      const appIds = await getAccessibleAppIds(req)
      const { clause: appClause, params: appParams } = buildAppFilter(appIds)

      if (appIds !== null && appIds.length === 0) {
        res.json({ counts: [] })
        return
      }

      const now = new Date()
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      const rows = await queryRaw(sequelize, `
        SELECT framework_id AS fw_id, COUNT(*)::int AS count
        FROM ai_request_logs
        WHERE flagged = true AND framework_id IS NOT NULL AND created_at >= ? ${appClause}
        GROUP BY framework_id
        ORDER BY count DESC
      `, [twentyFourHoursAgo, ...appParams])

      const fwRows = await queryDataRaw(
        `SELECT id AS fw_id, framework_code, name AS fw_name FROM detection_frameworks ORDER BY name`,
        []
      )

      const fwMap = new Map<string, { framework_code: string; fw_name: string }>()
      for (const fw of fwRows) {
        fwMap.set(fw.fw_id as string, {
          framework_code: fw.framework_code as string,
          fw_name: fw.fw_name as string,
        })
      }

      const counts = rows.map(r => {
        const rawId = r.fw_id as string
        const fw = fwMap.get(rawId) || {
          framework_code: rawId === 'OTHER' ? 'Other' : rawId.startsWith('t2-') ? 'T2' : rawId.substring(0, 8),
          fw_name: rawId.startsWith('t2-') ? 'T2 Intent Analysis' : 'Other / Unclassified',
        }
        return {
          fw_id: rawId,
          framework_code: fw.framework_code,
          fw_name: fw.fw_name,
          count: Number(r.count || 0),
        }
      })

      res.json({ counts })
    } catch (err) {
      console.error('[Stats] Framework counts error:', err)
      res.status(500).json({ error: 'Failed to fetch framework counts' })
    }
  })

  router.get('/heatmap', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const sequelize = logStore.sequelize
      if (!sequelize) throw new Error('Sequelize not initialized')

      const appIds = await getAccessibleAppIds(req)
      const { clause: appClause, params: appParams } = buildAppFilter(appIds)

      if (appIds !== null && appIds.length === 0) {
        const fwRows = await queryDataRaw(
          `SELECT id AS fw_id, framework_code, name AS fw_name, display_order FROM detection_frameworks ORDER BY display_order`,
          []
        )
        res.json({ cells: [], frameworks: fwRows })
        return
      }

      const now = new Date()
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      const rows = await queryRaw(
        sequelize,
        `SELECT framework_id AS fw_id, date_trunc('hour', created_at) AS hour_bucket, COUNT(*) AS threats
         FROM ai_request_logs
         WHERE flagged = true AND framework_id IS NOT NULL AND created_at >= ? ${appClause}
         GROUP BY framework_id, date_trunc('hour', created_at)`,
        [twentyFourHoursAgo, ...appParams]
      )

      const fwRows = await queryDataRaw(
        `SELECT id AS fw_id, framework_code, name AS fw_name, display_order
         FROM detection_frameworks ORDER BY display_order`,
        []
      )

      const cells = rows.map(r => ({
        fw_id:      r.fw_id as string,
        hour_bucket: new Date(r.hour_bucket as string).toISOString(),
        threats:    Number(r.threats),
      }))

      const fwIdSet = new Set((fwRows as Record<string, unknown>[]).map(fw => fw.fw_id as string))
      const unknownFwIds = [...new Set(
        cells.map(c => c.fw_id).filter(id => !fwIdSet.has(id) && !id.startsWith('t2-'))
      )]
      for (const unknownId of unknownFwIds) {
        ;(fwRows as Record<string, unknown>[]).push({
          fw_id:          unknownId,
          framework_code: unknownId === 'OTHER' ? 'Other' : unknownId.substring(0, 8),
          fw_name:        'Other / Unclassified',
          display_order:  9999,
        })
      }

      res.json({ cells, frameworks: fwRows })
    } catch (err) {
      console.error('[Stats] Heatmap error:', err)
      res.status(500).json({ error: 'Failed to fetch heatmap data' })
    }
  })

  router.get('/apps', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const sequelize = logStore.sequelize
      if (!sequelize) throw new Error('Sequelize not initialized')

      const appIds = await getAccessibleAppIds(req)
      const { clause: appClause, params: appParams } = buildAppFilter(appIds)

      if (appIds !== null && appIds.length === 0) {
        res.json([])
        return
      }

      const now = new Date()
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      const rows = await queryRaw(sequelize, `SELECT app_id, app_name, COUNT(*) as requests_24h, SUM(CASE WHEN action IN ('blocked', 'blocked_output') THEN 1 ELSE 0 END) as blocked_24h, ROUND(AVG(duration_ms))::int as avg_latency_ms FROM ai_request_logs WHERE created_at >= ? ${appClause} GROUP BY app_id, app_name ORDER BY requests_24h DESC`, [twentyFourHoursAgo, ...appParams])

      const hourlyRows = await queryRaw(sequelize, `
        SELECT
          app_id,
          date_trunc('hour', created_at) AS hour_bucket,
          COUNT(*)::int AS total
        FROM ai_request_logs
        WHERE created_at >= ? ${appClause}
        GROUP BY app_id, date_trunc('hour', created_at)
        ORDER BY app_id, hour_bucket
      `, [twentyFourHoursAgo, ...appParams])

      const hourlyByApp = new Map<string, Map<string, number>>()
      for (const r of hourlyRows) {
        const appId = r.app_id as string
        const key = new Date(r.hour_bucket as string).toISOString().substring(0, 13)
        if (!hourlyByApp.has(appId)) hourlyByApp.set(appId, new Map())
        hourlyByApp.get(appId)!.set(key, Number(r.total || 0))
      }

      const apps: { app_id: string; app_name: string; requests_24h: number; blocked_24h: number; avg_latency_ms: number; hourly_bars: number[] }[] = rows.map((row: Record<string, unknown>) => {
        const appId = row.app_id as string
        const appHourly = hourlyByApp.get(appId)
        const hourMs = 60 * 60 * 1000
        const startOfFirstBin = new Date(Math.floor(twentyFourHoursAgo.getTime() / hourMs) * hourMs)
        const numBars = Math.floor((now.getTime() - startOfFirstBin.getTime()) / hourMs) + 1
        const hourly_bars: number[] = []
        for (let i = 0; i < numBars; i++) {
          const binStart = new Date(startOfFirstBin.getTime() + i * hourMs)
          const key = binStart.toISOString().substring(0, 13)
          hourly_bars.push(appHourly?.get(key) || 0)
        }
        return {
          app_id: appId,
          app_name: row.app_name as string,
          requests_24h: Number(row.requests_24h || 0),
          blocked_24h: Number(row.blocked_24h || 0),
          avg_latency_ms: Number(row.avg_latency_ms || 0),
          hourly_bars,
        }
      })

      res.json(apps)
    } catch (err) {
      console.error('[Stats] Apps error:', err)
      res.status(500).json({ error: 'Failed to fetch app stats' })
    }
  })

  router.get('/t2', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const sequelize = logStore.sequelize
      if (!sequelize) throw new Error('Sequelize not initialized')

      const appIds = await getAccessibleAppIds(req)
      const { clause: appClause, params: appParams } = buildAppFilter(appIds)

      const now = new Date()
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      if (appIds !== null && appIds.length === 0) {
        const hourMs = 60 * 60 * 1000
        const startOfFirstBin = new Date(Math.floor(twentyFourHoursAgo.getTime() / hourMs) * hourMs)
        const numBars = Math.floor((now.getTime() - startOfFirstBin.getTime()) / hourMs) + 1
        res.json({ t2_scanned: 0, t2_flagged: 0, blocked_by_t2: 0, avg_t2_confidence: null, t2_flag_rate: 0, hourly_bars: Array.from({ length: numBars }, (_, i) => ({ hour: new Date(startOfFirstBin.getTime() + i * hourMs).toISOString(), scanned: 0, flagged: 0 })), by_app: [], top_reasons: [] })
        return
      }

      const [summary, hourlyRows, byAppRows, reasonRows] = await Promise.all([
        queryRaw(sequelize, `
          SELECT
            COUNT(*) FILTER (WHERE t2_confidence IS NOT NULL)::int AS t2_scanned,
            COUNT(*) FILTER (WHERE t2_flagged = true)::int AS t2_flagged,
            COUNT(*) FILTER (WHERE blocked_stage = 't2_intent')::int AS blocked_by_t2,
            ROUND(AVG(t2_confidence) FILTER (WHERE t2_flagged = true)::numeric, 3) AS avg_t2_confidence
          FROM ai_request_logs
          WHERE created_at >= ? ${appClause}
        `, [twentyFourHoursAgo, ...appParams]),

        queryRaw(sequelize, `
          SELECT
            date_trunc('hour', created_at) AS hour_bucket,
            COUNT(*) FILTER (WHERE t2_confidence IS NOT NULL)::int AS scanned,
            COUNT(*) FILTER (WHERE t2_flagged = true)::int AS flagged
          FROM ai_request_logs
          WHERE created_at >= ? ${appClause}
          GROUP BY date_trunc('hour', created_at)
          ORDER BY hour_bucket
        `, [twentyFourHoursAgo, ...appParams]),

        queryRaw(sequelize, `
          SELECT
            app_name,
            COUNT(*) FILTER (WHERE t2_confidence IS NOT NULL)::int AS t2_scanned,
            COUNT(*) FILTER (WHERE t2_flagged = true)::int AS t2_flagged,
            COUNT(*) FILTER (WHERE blocked_stage = 't2_intent')::int AS t2_blocked
          FROM ai_request_logs
          WHERE created_at >= ? ${appClause}
          GROUP BY app_name
          HAVING COUNT(*) FILTER (WHERE t2_confidence IS NOT NULL) > 0
          ORDER BY t2_flagged DESC
          LIMIT 10
        `, [twentyFourHoursAgo, ...appParams]),

        queryRaw(sequelize, `
          SELECT t2_reason, COUNT(*)::int AS cnt
          FROM ai_request_logs
          WHERE created_at >= ? AND t2_flagged = true AND t2_reason IS NOT NULL ${appClause}
          GROUP BY t2_reason
          ORDER BY cnt DESC
          LIMIT 5
        `, [twentyFourHoursAgo, ...appParams]),
      ])

      const s = summary[0] || {}
      const t2_scanned = Number(s.t2_scanned || 0)
      const t2_flagged_count = Number(s.t2_flagged || 0)
      const blocked_by_t2 = Number(s.blocked_by_t2 || 0)
      const avg_t2_confidence = s.avg_t2_confidence !== null ? Number(s.avg_t2_confidence) : null
      const t2_flag_rate = t2_scanned > 0 ? Math.round((t2_flagged_count / t2_scanned) * 1000) / 1000 : 0

      const hourlyByBucket = new Map<string, { scanned: number; flagged: number }>()
      for (const r of hourlyRows) {
        const key = new Date(r.hour_bucket as string).toISOString().substring(0, 13)
        hourlyByBucket.set(key, { scanned: Number(r.scanned || 0), flagged: Number(r.flagged || 0) })
      }
      const hourMs = 60 * 60 * 1000
      const startOfFirstBin = new Date(Math.floor(twentyFourHoursAgo.getTime() / hourMs) * hourMs)
      const numBars = Math.floor((now.getTime() - startOfFirstBin.getTime()) / hourMs) + 1
      const hourly_bars: { hour: string; scanned: number; flagged: number }[] = []
      for (let i = 0; i < numBars; i++) {
        const binStart = new Date(startOfFirstBin.getTime() + i * hourMs)
        const key = binStart.toISOString().substring(0, 13)
        const d = hourlyByBucket.get(key) || { scanned: 0, flagged: 0 }
        hourly_bars.push({ hour: binStart.toISOString(), ...d })
      }

      const by_app = byAppRows.map(r => ({
        app_name: r.app_name as string,
        t2_scanned: Number(r.t2_scanned || 0),
        t2_flagged: Number(r.t2_flagged || 0),
        t2_blocked: Number(r.t2_blocked || 0),
      }))

      const top_reasons = reasonRows.map(r => ({
        reason: (r.t2_reason as string).substring(0, 200),
        count: Number(r.cnt || 0),
      }))

      res.json({ t2_scanned, t2_flagged: t2_flagged_count, blocked_by_t2, avg_t2_confidence, t2_flag_rate, hourly_bars, by_app, top_reasons })
    } catch (err) {
      console.error('[Stats] T2 error:', err)
      res.status(500).json({ error: 'Failed to fetch T2 stats' })
    }
  })

  // GET /api/stats/content-quality — Content Quality Scanning KPI (mirrors /t2)
  router.get('/content-quality', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const sequelize = logStore.sequelize
      if (!sequelize) throw new Error('Sequelize not initialized')

      const appIds = await getAccessibleAppIds(req)
      const { clause: appClause, params: appParams } = buildAppFilter(appIds)

      const now = new Date()
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      if (appIds !== null && appIds.length === 0) {
        res.json({
          scanned: 0, flagged: 0, blocked: 0, redacted: 0,
          avg_groundedness: null, avg_relevance: null, flag_rate: 0,
          by_app: [],
        })
        return
      }

      const [summary, byAppRows] = await Promise.all([
        queryRaw(sequelize, `
          SELECT
            COUNT(*) FILTER (WHERE content_quality_scanned = true)::int AS scanned,
            COUNT(*) FILTER (WHERE content_quality_flagged = true)::int AS flagged,
            COUNT(*) FILTER (WHERE content_quality_action = 'blocked')::int AS blocked,
            COUNT(*) FILTER (WHERE content_quality_action = 'redacted')::int AS redacted,
            ROUND(AVG(content_quality_groundedness) FILTER (WHERE content_quality_scanned = true)::numeric, 3) AS avg_groundedness,
            ROUND(AVG(content_quality_relevance) FILTER (WHERE content_quality_scanned = true)::numeric, 3) AS avg_relevance
          FROM ai_request_logs
          WHERE created_at >= ? ${appClause}
        `, [twentyFourHoursAgo, ...appParams]),

        queryRaw(sequelize, `
          SELECT
            app_name,
            COUNT(*) FILTER (WHERE content_quality_scanned = true)::int AS scanned,
            COUNT(*) FILTER (WHERE content_quality_flagged = true)::int AS flagged,
            COUNT(*) FILTER (WHERE content_quality_action = 'blocked')::int AS blocked
          FROM ai_request_logs
          WHERE created_at >= ? ${appClause}
          GROUP BY app_name
          HAVING COUNT(*) FILTER (WHERE content_quality_scanned = true) > 0
          ORDER BY flagged DESC
          LIMIT 10
        `, [twentyFourHoursAgo, ...appParams]),
      ])

      const s = summary[0] || {}
      const scanned = Number(s.scanned || 0)
      const flagged = Number(s.flagged || 0)
      const blocked = Number(s.blocked || 0)
      const redacted = Number(s.redacted || 0)
      const avg_groundedness = s.avg_groundedness !== null ? Number(s.avg_groundedness) : null
      const avg_relevance = s.avg_relevance !== null ? Number(s.avg_relevance) : null
      const flag_rate = scanned > 0 ? Math.round((flagged / scanned) * 1000) / 1000 : 0

      const by_app = byAppRows.map(r => ({
        app_name: r.app_name as string,
        scanned: Number(r.scanned || 0),
        flagged: Number(r.flagged || 0),
        blocked: Number(r.blocked || 0),
      }))

      res.json({ scanned, flagged, blocked, redacted, avg_groundedness, avg_relevance, flag_rate, by_app })
    } catch (err) {
      console.error('[Stats] Content Quality error:', err)
      res.status(500).json({ error: 'Failed to fetch content quality stats' })
    }
  })

  return router
}
