import type { Request, Response } from 'express';
import { Router } from 'express'
import { ResponseCacheConfig, getOrCreateConfig } from '../models/data-db/ResponseCacheConfig'
import { isAdmin, requireAuth } from '../middleware/auth'
import { triggerGatewayReload, triggerGatewayCacheFlush } from '../utils/gatewayReload'
import type { ILogStore } from '../logs/ILogStore'

export function createResponseCacheConfigRouter(_logStore: ILogStore): Router {
  const router = Router()

  // GET /api/response-cache-config — admin only
  router.get('/', requireAuth, async (_req: Request, res: Response): Promise<void> => {
    try {
      if (!isAdmin(_req)) { res.status(403).json({ error: 'Admin access required' }); return }
      const config = await getOrCreateConfig()
      res.json({ data: config })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // PATCH /api/response-cache-config — admin only
  router.patch('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      if (!isAdmin(req)) { res.status(403).json({ error: 'Admin access required' }); return }

      const config = await ResponseCacheConfig.findByPk(1)
      if (!config) { res.status(404).json({ error: 'Config not found' }); return }

      const body = req.body as Record<string, unknown>

      if (typeof body.enabled === 'boolean') {
        config.enabled = body.enabled
      }
      if (typeof body.exact_match_enabled === 'boolean') {
        config.exact_match_enabled = body.exact_match_enabled
      }
      if (typeof body.semantic_match_enabled === 'boolean') {
        config.semantic_match_enabled = body.semantic_match_enabled
      }
      if (body.semantic_threshold !== undefined) {
        const val = Number(body.semantic_threshold)
        if (isNaN(val) || val < 0 || val > 1) {
          res.status(400).json({ error: 'semantic_threshold must be a number between 0 and 1' })
          return
        }
        config.semantic_threshold = val
      }

      await config.save()
      triggerGatewayReload().catch(() => {})

      res.json({ data: config })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/response-cache-config/flush — admin only; force-expire every app's cache
  router.post('/flush', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      if (!isAdmin(req)) { res.status(403).json({ error: 'Admin access required' }); return }
      const result = await triggerGatewayCacheFlush()
      res.json({ data: result })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  return router
}
