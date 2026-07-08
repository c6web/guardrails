import type { Request, Response } from 'express'
import { Router } from 'express'
import type { ILogStore } from '../logs/ILogStore'
import { Detector } from '../models/data-db/Detector'
import { ConnectedApp } from '../models/data-db/ConnectedApp'
import { User } from '../models/users-db/User'
export function createSidebarRouter(logStore: ILogStore) {
  const router = Router()

  // GET /api/sidebar-counts — returns counts for all sidebar nav items
  router.get('/', async (_req: Request, res: Response): Promise<void> => {
    try {
      const sequelize = logStore.sequelize
      let threatCount = 0
      if (sequelize) {
        const [rows] = await sequelize.query('SELECT COUNT(*) as count FROM ai_request_logs WHERE flagged = true', { raw: true }) as [Record<string, unknown>[], unknown]
        threatCount = Number(rows[0]?.count || 0)
      }

      const [detectorCount, appCount, userCount] = await Promise.all([
        Detector.count(),
        ConnectedApp.count(),
        User.count(),
      ])

      res.json({
        threats: threatCount,
        detectors: detectorCount,
        apps: appCount,
        users: userCount,
      })
    } catch (err) {
      console.error('[Sidebar] Counts error:', err)
      res.status(500).json({ error: 'Failed to fetch sidebar counts' })
    }
  })

  return router
}
