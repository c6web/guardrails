import type { Request, Response } from 'express';
import { Router } from 'express'
import type { ILogStore } from '../logs/ILogStore'
import { ConnectedApp } from '../models/data-db/ConnectedApp'
import { logAudit } from '../utils/auditLog'
import { triggerGatewayReload } from '../utils/gatewayReload'
import { GROUP_IDS, getAccessibleAppIds } from '../utils/appAccess'

type QuotaApp = Pick<ConnectedApp,
  'quota_mode' | 'quota_limit' | 'quota_warning_limit' | 'quota_enforcement' |
  'quota_reset_day' | 'quota_period_start' | 'createdAt'>

/**
 * Resolve the start of the current quota counting period for an app.
 * Mirrors the gateway's logic so console and gateway agree on usage.
 */
function quotaPeriodStart(app: QuotaApp, now: Date): Date {
  if (app.quota_mode === 'monthly') {
    const day = app.quota_reset_day ?? 1
    let y = now.getUTCFullYear()
    let m = now.getUTCMonth()
    let boundaryMs = Date.UTC(y, m, day, 0, 0, 0)
    if (now.getTime() < boundaryMs) {
      m -= 1
      if (m < 0) { m = 11; y -= 1 }
      boundaryMs = Date.UTC(y, m, day, 0, 0, 0)
    }
    const boundary = new Date(boundaryMs)
    if (app.quota_period_start && app.quota_period_start.getTime() > boundary.getTime()) {
      return app.quota_period_start
    }
    return boundary
  }
  // fixed (lifetime): baseline is the manual-reset point or app creation
  return app.quota_period_start ?? app.createdAt
}

function periodEnd(app: QuotaApp, start: Date): Date | null {
  if (app.quota_mode !== 'monthly') return null
  const day = app.quota_reset_day ?? 1
  // Derive the calendar boundary that opened this period, then add one month.
  const y = start.getUTCFullYear()
  const m = start.getUTCMonth()
  // If the period start is the override (mid-month), the boundary is the reset_day of that month.
  if (start.getUTCDate() !== day) {
    // start is an override after the boundary — boundary is reset_day of the same month
  }
  let em = m + 1
  let ey = y
  if (em > 11) { em = 0; ey += 1 }
  return new Date(Date.UTC(ey, em, day, 0, 0, 0))
}

export function createAppQuotaRouter(logStore: ILogStore): Router {
  const router = Router()

  async function countUsed(appId: string, since: Date): Promise<number> {
    const sequelize = logStore.sequelize
    if (!sequelize) return 0
    const [rows] = await sequelize.query(
      `SELECT COUNT(*)::int AS used FROM ai_request_logs
        WHERE app_id = ?
          AND status_code BETWEEN 200 AND 299
          AND upstream_provider_id IS NOT NULL
          AND created_at >= ?`,
      { replacements: [appId, since], raw: true },
    ) as [Array<{ used: number }>, unknown]
    return Number(rows[0]?.used ?? 0)
  }

  function usageState(used: number, app: QuotaApp): 'ok' | 'warning' | 'exceeded' {
    if (app.quota_limit !== null && used >= app.quota_limit) return 'exceeded'
    if (app.quota_warning_limit !== null && used >= app.quota_warning_limit) return 'warning'
    return 'ok'
  }

  // GET /api/apps/usage-quota/summary — current-period used per app with a quota set
  router.get('/usage-quota/summary', async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
      const appIds = await getAccessibleAppIds(req)
      if (appIds !== null && appIds.length === 0) { res.json({ data: {} }); return }
      const where: Record<string, unknown> = { quota_mode: ['fixed', 'monthly'] }
      if (appIds !== null) where['id'] = appIds
      const apps = await ConnectedApp.findAll({ where })
      const now = new Date()
      const data: Record<string, { used: number; limit: number | null; mode: string; state: string }> = {}
      for (const app of apps) {
        const start = quotaPeriodStart(app, now)
        const used = await countUsed(app.id, start)
        data[app.id] = { used, limit: app.quota_limit, mode: app.quota_mode, state: usageState(used, app) }
      }
      res.json({ data })
    } catch (err) {
      console.error('[appQuota] summary error:', err)
      res.status(500).json({ error: 'Failed to compute quota usage' })
    }
  })

  // GET /api/apps/:id/usage-quota — config + current usage for one app
  router.get('/:id/usage-quota', async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
      const app = await ConnectedApp.findByPk(req.params['id'])
      if (!app) { res.status(404).json({ error: 'App not found' }); return }
      const canView = req.user.groupId === GROUP_IDS.admin || req.user.groupId === GROUP_IDS.viewer || app.owner_email === req.user.email
      if (!canView) { res.status(403).json({ error: 'Forbidden' }); return }

      const now = new Date()
      const start = app.quota_mode === 'unlimited' ? now : quotaPeriodStart(app, now)
      const used = app.quota_mode === 'unlimited' ? 0 : await countUsed(app.id, start)
      const end = periodEnd(app, start)
      const percent = app.quota_limit ? Math.min(100, Math.round((used / app.quota_limit) * 100)) : 0

      res.json({
        config: {
          mode: app.quota_mode,
          limit: app.quota_limit,
          warning: app.quota_warning_limit,
          enforcement: app.quota_enforcement,
          reset_day: app.quota_reset_day,
        },
        usage: {
          used,
          period_start: app.quota_mode === 'unlimited' ? null : start.toISOString(),
          period_end: end ? end.toISOString() : null,
          percent,
          state: app.quota_mode === 'unlimited' ? 'ok' : usageState(used, app),
        },
      })
    } catch (err) {
      console.error('[appQuota] usage error:', err)
      res.status(500).json({ error: 'Failed to fetch quota usage' })
    }
  })

  // POST /api/apps/:id/usage-quota/reset — admin: forgive usage by re-baselining
  router.post('/:id/usage-quota/reset', async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
      if (req.user.groupId !== GROUP_IDS.admin) { res.status(403).json({ error: 'Admin only' }); return }
      const app = await ConnectedApp.findByPk(req.params['id'])
      if (!app) { res.status(404).json({ error: 'App not found' }); return }

      await app.update({ quota_period_start: new Date() })
      await logAudit(req, 'app.quota.reset', 'connected_app', app.id, { name: app.name })
      await triggerGatewayReload()
      res.json({ success: true })
    } catch (err) {
      console.error('[appQuota] reset error:', err)
      res.status(500).json({ error: 'Failed to reset quota' })
    }
  })

  return router
}
