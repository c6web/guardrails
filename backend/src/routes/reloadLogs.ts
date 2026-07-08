import type { Request, Response } from 'express';
import { Router } from 'express'
import type { Sequelize } from 'sequelize';
import { requireRole } from '../middleware/requireRole'
import type { ILogStore } from '../logs/ILogStore'
import { logAudit } from '../utils/auditLog'
import { GatewayInstance } from '../models/data-db/GatewayInstance'
import { GatewayApiKey } from '../models/data-db/GatewayApiKey'
import { gatewayDecrypt } from '../utils/gatewayKeyCrypto'

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

export function createReloadLogsRouter(logStore: ILogStore, sequelizeDataDb?: Sequelize): Router {
  const router = Router()

  // GET /api/reload-logs/gateways — return gateway URLs + decrypted API keys for direct reload
  router.get('/gateways', requireRole('admin'), async (_req: Request, res: Response): Promise<void> => {
    try {
      const instances = await GatewayInstance.findAll()
      const result = await Promise.all(instances.map(async (gw) => {
        const gwId = gw.get('id') as string
        const keys = await GatewayApiKey.findAll({
          where: { gateway_id: gwId, status: 'active' },
          order: [['version', 'DESC']],
          limit: 1,
        })
        const key = keys[0]
        let apiKey: string | null = null
        if (key) {
          try { apiKey = gatewayDecrypt((key as any).key_encrypted) } catch {}
        }
        return { id: gwId, name: gw.get('name'), url: gw.get('url'), apiKey, keyPrefix: key ? (key as any).key_prefix : null }
      }))
      res.json({ data: result })
    } catch (e) {
      console.error('[reloadLogs] gateways error:', e)
      res.status(500).json({ error: 'Failed to fetch gateway info' })
    }
  })

  router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
      const { page, limit } = paginate(req)
      const f = filters(req)
      const result = await logStore.queryReloadLogs({ page, limit, filters: f })
      const rows: any[] = result.rows as any[]
      if (sequelizeDataDb) {
        let nameMap = new Map<string, string>()
        const gwIds = [...new Set(rows.map(r => r.gateway_instance_id).filter(Boolean))] as string[]
        if (gwIds.length > 0) {
          try {
            const [instances] = await sequelizeDataDb.query(
              `SELECT id::text, name FROM gateway_instances WHERE id IN (${gwIds.map((_, i) => '$' + (i + 1)).join(',')})`,
              { bind: gwIds }
            ) as [Array<{ id: string; name: string }>, unknown]
            nameMap = new Map(instances.map(i => [i.id, i.name]))
          } catch (e) {
            console.error('[reloadLogs] failed to resolve gateway names:', e)
          }
        }
        for (const row of rows) {
          row.gateway_name = row.gateway_instance_id && nameMap.has(row.gateway_instance_id)
            ? nameMap.get(row.gateway_instance_id)
            : null
        }
      }
      res.json({
        data: rows,
        meta: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) },
      })
    } catch (e) {
      console.error('[reloadLogs] query error:', e)
      res.status(500).json({ error: 'Failed to query reload logs' })
    }
  })

  router.delete('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params
      const ok = await logStore.deleteReloadLog(id)
      if (!ok) { res.status(404).json({ error: 'Not found' }); return }
      await logAudit(req, 'log.delete', 'reload_log', id)
      res.json({ success: true })
    } catch (e) {
      console.error('[reloadLogs] delete error:', e)
      res.status(500).json({ error: 'Failed to delete reload log' })
    }
  })

  router.post('/bulk-delete', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const { ids } = req.body as { ids?: string[] }
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: 'ids required' }); return
      }
      const deleted = await logStore.bulkDeleteReloadLogs(ids)
      await logAudit(req, 'log.bulk_delete', 'reload_log', ids.join(','), { count: deleted })
      res.json({ deletedCount: deleted })
    } catch (e) {
      console.error('[reloadLogs] bulk delete error:', e)
      res.status(500).json({ error: 'Failed to bulk delete reload logs' })
    }
  })

  router.post('/delete-before', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const { daysBack } = req.body as { daysBack?: number }
      if (!daysBack || daysBack < 1) { res.status(400).json({ error: 'daysBack required (>=1)' }); return }
      const deleted = await logStore.deleteReloadLogsBefore(daysBack)
      await logAudit(req, 'log.delete_before', 'reload_log', `${daysBack}d`, { daysBack, deletedCount: deleted })
      res.json({ deletedCount: deleted })
    } catch (e) {
      console.error('[reloadLogs] delete-before error:', e)
      res.status(500).json({ error: 'Failed to delete reload logs' })
    }
  })

  router.post('/delete-all', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const deleted = await logStore.deleteAllReloadLogs()
      await logAudit(req, 'log.delete_all', 'reload_log', 'all', { deletedCount: deleted })
      res.json({ deletedCount: deleted })
    } catch (e) {
      console.error('[reloadLogs] delete-all error:', e)
      res.status(500).json({ error: 'Failed to delete all reload logs' })
    }
  })

  return router
}
