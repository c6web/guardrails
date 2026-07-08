import type { Request, Response } from 'express';
import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { requireRole } from '../middleware/requireRole'
import { AppPermission } from '../models/data-db/AppPermission'
import type { ILogStore } from '../logs/ILogStore'

const GROUP_IDS = {
  admin:  '00000000-0000-0000-0000-000000000001',
  viewer: '00000000-0000-0000-0000-000000000002',
} as const

function paginate(req: Request) {
  const page  = Math.max(1, parseInt(req.query['page']  as string || '1',  10))
  const limit = Math.max(1, parseInt(req.query['limit'] as string || '50', 10))
  return { page, limit }
}

function filters(req: Request): Record<string, unknown> {
  const f: Record<string, unknown> = { ...req.query }
  delete f['page']
  delete f['limit']
  return f
}

async function getPermittedAppIds(userId: string): Promise<string[]> {
  const permissions = await AppPermission.findAll({
    where: { user_id: userId },
    attributes: ['app_id'],
  })
  return permissions.map(p => p.app_id)
}

export function createAiProviderCallLogsRouter(logStore: ILogStore): Router {
  const router = Router()

  // GET /api/logs/provider-calls — paginated, permission-filtered
  router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
      const { page, limit } = paginate(req)
      const f = filters(req)

      if (req.user.groupId !== GROUP_IDS.admin && req.user.groupId !== GROUP_IDS.viewer) {
        const permittedApps = await getPermittedAppIds(req.user.userId)
        if (permittedApps.length === 0) {
          res.json({ data: [], meta: { page, limit, total: 0, totalPages: 0 } })
          return
        }
        f['app_id'] = permittedApps
      }

      const result = await logStore.queryAiProviderCallLogs({ page, limit, filters: f })
      res.json({
        data: result.rows,
        meta: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) },
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // GET /api/logs/provider-calls/stats — token aggregates
  router.get('/stats', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
      const f = filters(req)

      if (req.user.groupId !== GROUP_IDS.admin && req.user.groupId !== GROUP_IDS.viewer) {
        const permittedApps = await getPermittedAppIds(req.user.userId)
        if (permittedApps.length > 0) {
          f['app_id'] = permittedApps
        }
      }

      const stats = await logStore.getAiProviderCallLogStats(f)
      res.json(stats)
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // DELETE /api/logs/provider-calls/:id
  router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const deleted = await logStore.deleteAiProviderCallLog(req.params['id'])
      res.json({ success: deleted })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/logs/provider-calls/bulk-delete
  router.post('/bulk-delete', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const { ids } = req.body as { ids: string[] }
      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: 'ids must be a non-empty array' })
        return
      }
      const deletedCount = await logStore.bulkDeleteAiProviderCallLogs(ids)
      res.json({ success: true, deletedCount })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/logs/provider-calls/before — delete logs older than N days (admin only)
  router.post('/before', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const { daysBack } = req.body as { daysBack: number }
      if (!daysBack || daysBack <= 0) {
        res.status(400).json({ error: 'daysBack must be a positive number' })
        return
      }
      const deletedCount = await logStore.deleteProviderCallLogsBefore(daysBack)
      res.json({ success: true, deletedCount })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/logs/provider-calls/delete-all — delete all provider call logs at once (admin only)
  router.post('/delete-all', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const deletedCount = await logStore.deleteAllProviderCallLogs()
      res.json({ success: true, deletedCount })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  return router
}
