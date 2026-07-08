import type { Request, Response } from 'express';
import { Router } from 'express'
import type { Sequelize } from 'sequelize'
import { requireRole } from '../middleware/requireRole'
import { requireAuth } from '../middleware/auth'
import type { ILogStore } from '../logs/ILogStore'
import type { AiRequestLogRecord } from '../logs/types'
import { getAccessibleAppIds, isAdminOrViewer } from '../utils/appAccess'
import { logAudit } from '../utils/auditLog'

function paginate(req: Request) {
  const page  = Math.max(1, parseInt(req.query['page']  as string || '1',  10))
  const limit = Math.min(200, Math.max(1, parseInt(req.query['limit'] as string || '50', 10)))
  return { page, limit }
}

function filters(req: Request): Record<string, unknown> {
  const f: Record<string, unknown> = { ...req.query }
  delete f['page']
  delete f['limit']
  return f
}

// Same classification used by stats.ts /overview — kept in sync deliberately rather than imported,
// since logs.ts and stats.ts are independent router factories with no shared module today.
const ACTION_STATE_CASE = `
  CASE
    WHEN action IN ('blocked', 'blocked_output') THEN 'block'
    WHEN action IN ('flagged', 'monitored') THEN 'flag'
    WHEN action IN ('forwarded', 'bypassed', 'redacted', 'redacted_output', 'embedding') AND status_code BETWEEN 200 AND 299 THEN 'allow'
    ELSE 'error'
  END
`

export function createLogsRouter(logStore: ILogStore, sequelizeDataDb?: Sequelize): Router {
  const router = Router()

  async function queryRaw(sql: string, params: unknown[]): Promise<Record<string, unknown>[]> {
    const sequelize = logStore.sequelize
    if (!sequelize) throw new Error('Sequelize not initialized')
    const [rows] = await sequelize.query(sql, { replacements: params, raw: true }) as [unknown[], unknown]
    return rows as Record<string, unknown>[]
  }

  function buildDateRangeClause(f: Record<string, unknown>, params: unknown[]): string {
    let clause = ''
    if (f['from']) { clause += ' AND created_at >= ?'; params.push(new Date(f['from'] as string)) }
    if (f['to'])   { clause += ' AND created_at <= ?'; params.push(new Date(f['to'] as string)) }
    return clause
  }

  // GET /api/logs/requests — permission-aware filtering
  router.get('/requests', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }

      const { page, limit } = paginate(req)
      const f = filters(req)
      if (f['flagged'] !== undefined) f['flagged'] = f['flagged'] === 'true'

      // For user role: scope to apps they own or have been granted access to
      const appIds = await getAccessibleAppIds(req)
      if (appIds !== null) {
        if (appIds.length === 0) {
          res.json({ data: [], meta: { page, limit, total: 0, totalPages: 0 } })
          return
        }
        f['app_id'] = appIds
      }

      const result = await logStore.queryAiRequestLogs({ page, limit, filters: f })

      // Resolve gateway_instance_id → gateway_name from data-db
      const rows: AiRequestLogRecord[] = result.rows
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
            console.error('[logs] failed to resolve gateway names:', e)
          }
        }
        for (const row of rows) {
          (row as any).gateway_name = row.gateway_instance_id && nameMap.has(row.gateway_instance_id)
            ? nameMap.get(row.gateway_instance_id)
            : null
        }
      }

      res.json({
        data: rows,
        meta: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) },
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // GET /api/logs/requests/stats — aggregate counts for the current filter set (Traffic + AI Activities pages)
  router.get('/requests/stats', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }

      const f = filters(req)
      const appIds = await getAccessibleAppIds(req)
      if (appIds !== null && appIds.length === 0) {
        res.json({ total: 0, blocked_flagged: 0, blocked_flagged_rate: 0, avg_duration_ms: 0, tokens_in: 0, tokens_out: 0 })
        return
      }

      const params: unknown[] = []
      let where = 'WHERE 1=1'
      if (appIds !== null) { where += ` AND app_id IN (${appIds.map(() => '?').join(', ')})`; params.push(...appIds) }
      else if (f['app_id']) { where += ' AND app_id = ?'; params.push(f['app_id']) }
      if (f['flagged'] !== undefined) { where += ' AND flagged = ?'; params.push(f['flagged'] === 'true') }
      if (f['framework_id']) { where += ' AND framework_id = ?'; params.push(f['framework_id']) }
      if (f['model']) { where += ' AND model = ?'; params.push(f['model']) }
      if (f['path']) { where += ' AND path = ?'; params.push(f['path']) }
      where += buildDateRangeClause(f, params)

      const rows = await queryRaw(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE (${ACTION_STATE_CASE}) IN ('block', 'flag'))::int AS blocked_flagged,
          ROUND(AVG(duration_ms))::int AS avg_duration_ms,
          COALESCE(SUM(tokens_in), 0)::bigint AS tokens_in,
          COALESCE(SUM(tokens_out), 0)::bigint AS tokens_out
        FROM ai_request_logs
        ${where}
      `, params)

      const r = rows[0] || {}
      const total = Number(r['total'] || 0)
      const blocked_flagged = Number(r['blocked_flagged'] || 0)
      res.json({
        total,
        blocked_flagged,
        blocked_flagged_rate: total > 0 ? Math.round((blocked_flagged / total) * 1000) / 1000 : 0,
        avg_duration_ms: Number(r['avg_duration_ms'] || 0),
        tokens_in: Number(r['tokens_in'] || 0),
        tokens_out: Number(r['tokens_out'] || 0),
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // PATCH /api/logs/requests/:request_id/classification-feedback — mark classification as correct or incorrect with optional reason
  router.patch('/requests/:request_id/classification-feedback', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }

      // For user role: verify the log belongs to an accessible app
      if (!isAdminOrViewer(req)) {
        const result = await logStore.queryAiRequestLogs({ page: 1, limit: 1, filters: { request_id: req.params['request_id']! } })
        if (result.rows.length === 0) { res.status(404).json({ error: 'Log not found' }); return }
        const appIds = await getAccessibleAppIds(req)
        if (appIds !== null && !appIds.includes(result.rows[0]!.app_id)) {
          res.status(403).json({ error: 'Forbidden' }); return
        }
      }

      const { correct, reason } = req.body || {}
      const opts = { correct: correct ?? null, reason }
      const updated = await logStore.setClassificationFeedback(req.params['request_id']!, opts.correct, opts.reason)
      if (!updated) {
        res.status(404).json({ error: 'Log not found' })
        return
      }
      res.json({ success: true })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // PATCH /api/logs/requests/:request_id/benign — mark a threat as a false positive
  router.patch('/requests/:request_id/benign', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }

      // For user role: verify the log belongs to an accessible app
      if (!isAdminOrViewer(req)) {
        const result = await logStore.queryAiRequestLogs({ page: 1, limit: 1, filters: { request_id: req.params['request_id']! } })
        if (result.rows.length === 0) { res.status(404).json({ error: 'Log not found' }); return }
        const appIds = await getAccessibleAppIds(req)
        if (appIds !== null && !appIds.includes(result.rows[0]!.app_id)) {
          res.status(403).json({ error: 'Forbidden' }); return
        }
      }

      const { reason } = req.body || {}
      const updated = await logStore.markAsBenign(req.params['request_id']!, reason)
      if (!updated) {
        res.status(404).json({ error: 'Log not found' })
        return
      }
      res.json({ success: true })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // GET /api/logs/similar — count similar threats in last 24h
  router.get('/similar', async (req: Request, res: Response): Promise<void> => {
    try {
      const detector        = (req.query['detector']         as string) || ''
      const sourceIp        = (req.query['source_ip']        as string) || ''
      const userIdentifier  = (req.query['app_api_key']  as string) || ''
      const counts = await logStore.countSimilarThreats(detector, sourceIp, userIdentifier)
      res.json(counts)
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // DELETE /api/logs/requests/:request_id — admin/viewer only; users cannot delete logs
  router.delete('/requests/:request_id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const requestId = req.params['request_id']
      await logAudit(req, 'log.delete', 'ai_request_log', requestId, { action: 'single_delete' })
      const deleted = await logStore.deleteAiRequestLogByRequestId(requestId)
      if (!deleted) {
        res.status(404).json({ error: 'Log not found' })
        return
      }
      res.json({ success: true, deletedCount: 1 })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/logs/requests/bulk-delete — admin/viewer only; users cannot delete logs
  router.post('/requests/bulk-delete', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const { ids }: { ids: string[] } = req.body || {}
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: 'ids array required' })
        return
      }
      await logAudit(req, 'log.delete', 'ai_request_log', `bulk_${ids.length}`, { count: ids.length, sample_ids: ids.slice(0, 10) })
      const deletedCount = await logStore.bulkDeleteAiRequestLogs(ids)
      res.json({ success: true, deletedCount })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/logs/requests/delete-before — admin only; delete traffic logs older than N days
  router.post('/requests/delete-before', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const { daysBack }: { daysBack: number } = req.body || {}
      if (!daysBack || daysBack < 1) {
        res.status(400).json({ error: 'daysBack (positive integer) required' })
        return
      }
      if (daysBack > 365) {
        res.status(400).json({ error: 'daysBack cannot exceed 365' })
        return
      }
      const deletedCount = await logStore.deleteAiRequestLogsBefore(daysBack)
      await logAudit(req, 'log.delete', 'ai_request_log', `before_${daysBack}_days`, { days_back: daysBack, count: deletedCount })
      res.json({ success: true, deletedCount })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/logs/requests/delete-all — admin only; delete all ai request logs at once
  router.post('/requests/delete-all', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const { confirm } = req.body as { confirm?: string }
      if (confirm !== 'DELETE ALL') {
        res.status(400).json({ error: 'Must send { confirm: "DELETE ALL" } to proceed' })
        return
      }
      const deletedCount = await logStore.deleteAllAiRequestLogs()
      await logAudit(req, 'log.delete', 'ai_request_log', 'all', { count: deletedCount })
      res.json({ success: true, deletedCount })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // GET /api/logs/audit — admin/viewer only
  router.get('/audit', requireAuth, async (req: Request, res: Response): Promise<void> => {
    if (!isAdminOrViewer(req)) { res.status(403).json({ error: 'Forbidden' }); return }
    try {
      const { page, limit } = paginate(req)
      const result = await logStore.queryAuditLogs({ page, limit, filters: filters(req) })
      res.json({
        data: result.rows,
        meta: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) },
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // GET /api/logs/activity — admin/viewer only
  router.get('/activity', requireAuth, async (req: Request, res: Response): Promise<void> => {
    if (!isAdminOrViewer(req)) { res.status(403).json({ error: 'Forbidden' }); return }
    try {
      const { page, limit } = paginate(req)
      const result = await logStore.queryUserActivityLogs({ page, limit, filters: filters(req) })
      res.json({
        data: result.rows,
        meta: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) },
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // GET /api/logs/admin — admin only
  router.get('/admin', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const { page, limit } = paginate(req)
      const result = await logStore.queryAdminActivityLogs({ page, limit, filters: filters(req) })
      res.json({
        data: result.rows,
        meta: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) },
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // GET /api/logs/audit/stats — admin/viewer only
  router.get('/audit/stats', requireAuth, async (req: Request, res: Response): Promise<void> => {
    if (!isAdminOrViewer(req)) { res.status(403).json({ error: 'Forbidden' }); return }
    try {
      const f = filters(req)
      const params: unknown[] = []
      let where = 'WHERE 1=1'
      if (f['actor_email']) { where += ' AND actor_email = ?'; params.push(f['actor_email']) }
      if (f['action']) { where += ' AND action = ?'; params.push(f['action']) }
      if (f['resource_type']) { where += ' AND resource_type = ?'; params.push(f['resource_type']) }
      where += buildDateRangeClause(f, params)

      const [summaryRows, topActionRows] = await Promise.all([
        queryRaw(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(DISTINCT actor_email)::int AS unique_actors,
            COUNT(DISTINCT resource_type)::int AS unique_resource_types
          FROM audit_logs
          ${where}
        `, params),
        queryRaw(`
          SELECT action, COUNT(*)::int AS count
          FROM audit_logs
          ${where}
          GROUP BY action
          ORDER BY count DESC
          LIMIT 1
        `, params),
      ])

      const s = summaryRows[0] || {}
      const top = topActionRows[0]
      res.json({
        total: Number(s['total'] || 0),
        unique_actors: Number(s['unique_actors'] || 0),
        unique_resource_types: Number(s['unique_resource_types'] || 0),
        top_action: top ? { action: top['action'], count: Number(top['count'] || 0) } : null,
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // DELETE /api/logs/audit/:id — admin only
  router.delete('/audit/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id']
      await logAudit(req, 'log.delete', 'audit_log', id, { action: 'single_delete' })
      const deleted = await logStore.deleteAuditLog(id)
      if (!deleted) {
        res.status(404).json({ error: 'Audit log not found' })
        return
      }
      res.json({ success: true, deletedCount: 1 })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/logs/audit/bulk-delete — admin only
  router.post('/audit/bulk-delete', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const { ids }: { ids: string[] } = req.body || {}
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: 'ids array required' })
        return
      }
      await logAudit(req, 'log.delete', 'audit_log', `bulk_${ids.length}`, { count: ids.length, sample_ids: ids.slice(0, 10) })
      const deletedCount = await logStore.bulkDeleteAuditLogs(ids)
      res.json({ success: true, deletedCount })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/logs/audit/delete-before — admin only; delete audit logs older than N days
  router.post('/audit/delete-before', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const { daysBack }: { daysBack: number } = req.body || {}
      if (!daysBack || daysBack < 1) {
        res.status(400).json({ error: 'daysBack (positive integer) required' })
        return
      }
      const deletedCount = await logStore.deleteAuditLogsBefore(daysBack)
      await logAudit(req, 'log.delete', 'audit_log', `before_${daysBack}_days`, { days_back: daysBack, count: deletedCount })
      res.json({ success: true, deletedCount })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/logs/audit/delete-all — admin only; delete all audit logs at once
  router.post('/audit/delete-all', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const deletedCount = await logStore.deleteAllAuditLogs()
      await logAudit(req, 'log.delete', 'audit_log', 'all', { count: deletedCount })
      res.json({ success: true, deletedCount })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // GET /api/logs/activity/stats — admin/viewer only
  router.get('/activity/stats', requireAuth, async (req: Request, res: Response): Promise<void> => {
    if (!isAdminOrViewer(req)) { res.status(403).json({ error: 'Forbidden' }); return }
    try {
      const f = filters(req)
      const params: unknown[] = []
      let where = 'WHERE 1=1'
      if (f['activity_type']) { where += ' AND activity_type = ?'; params.push(f['activity_type']) }
      if (f['user_email']) { where += ' AND user_email = ?'; params.push(f['user_email']) }
      where += buildDateRangeClause(f, params)

      const rows = await queryRaw(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE activity_type = 'login_failed')::int AS failed_logins,
          COUNT(*) FILTER (WHERE activity_type = 'login_blocked')::int AS blocked_logins,
          COUNT(DISTINCT user_email)::int AS unique_users
        FROM user_activity_logs
        ${where}
      `, params)

      const r = rows[0] || {}
      res.json({
        total: Number(r['total'] || 0),
        failed_logins: Number(r['failed_logins'] || 0),
        blocked_logins: Number(r['blocked_logins'] || 0),
        unique_users: Number(r['unique_users'] || 0),
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // DELETE /api/logs/activity/:id — admin only
  router.delete('/activity/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id']
      await logAudit(req, 'log.delete', 'user_activity_log', id, { action: 'single_delete' })
      const deleted = await logStore.deleteUserActivityLog(id)
      if (!deleted) {
        res.status(404).json({ error: 'Activity log not found' })
        return
      }
      res.json({ success: true, deletedCount: 1 })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/logs/activity/bulk-delete — admin only
  router.post('/activity/bulk-delete', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const { ids }: { ids: string[] } = req.body || {}
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: 'ids array required' })
        return
      }
      await logAudit(req, 'log.delete', 'user_activity_log', `bulk_${ids.length}`, { count: ids.length, sample_ids: ids.slice(0, 10) })
      const deletedCount = await logStore.bulkDeleteUserActivityLogs(ids)
      res.json({ success: true, deletedCount })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/logs/activity/delete-before — admin only; delete user activity logs older than N days
  router.post('/activity/delete-before', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const { daysBack }: { daysBack: number } = req.body || {}
      if (!daysBack || daysBack < 1) {
        res.status(400).json({ error: 'daysBack (positive integer) required' })
        return
      }
      const deletedCount = await logStore.deleteUserActivityLogsBefore(daysBack)
      await logAudit(req, 'log.delete', 'user_activity_log', `before_${daysBack}_days`, { days_back: daysBack, count: deletedCount })
      res.json({ success: true, deletedCount })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/logs/activity/delete-all — admin only; delete all user activity logs at once
  router.post('/activity/delete-all', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const deletedCount = await logStore.deleteAllUserActivityLogs()
      await logAudit(req, 'log.delete', 'user_activity_log', 'all', { count: deletedCount })
      res.json({ success: true, deletedCount })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // GET /api/logs/admin/stats — admin only
  router.get('/admin/stats', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const f = filters(req)
      const params: unknown[] = []
      let where = 'WHERE 1=1'
      if (f['action']) { where += ' AND action = ?'; params.push(f['action']) }
      if (f['admin_email']) { where += ' AND admin_email = ?'; params.push(f['admin_email']) }
      if (f['target_type']) { where += ' AND target_type = ?'; params.push(f['target_type']) }
      where += buildDateRangeClause(f, params)

      const [summaryRows, topTargetRows] = await Promise.all([
        queryRaw(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE action ILIKE '%delete%' OR action ILIKE '%revoke%')::int AS destructive,
            COUNT(DISTINCT admin_email)::int AS unique_admins
          FROM admin_activity_logs
          ${where}
        `, params),
        queryRaw(`
          SELECT target_type, COUNT(*)::int AS count
          FROM admin_activity_logs
          ${where}
          GROUP BY target_type
          ORDER BY count DESC
          LIMIT 1
        `, params),
      ])

      const s = summaryRows[0] || {}
      const top = topTargetRows[0]
      res.json({
        total: Number(s['total'] || 0),
        destructive: Number(s['destructive'] || 0),
        unique_admins: Number(s['unique_admins'] || 0),
        top_target_type: top ? { target_type: top['target_type'], count: Number(top['count'] || 0) } : null,
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // DELETE /api/logs/admin/:id — delete a single admin activity log entry
  router.delete('/admin/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id']
      await logAudit(req, 'log.delete', 'admin_activity_log', id, { action: 'single_delete' })
      const deleted = await logStore.deleteAdminActivityLog(id)
      if (!deleted) {
        res.status(404).json({ error: 'Admin activity log not found' })
        return
      }
      res.json({ success: true, deletedCount: 1 })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/logs/admin/bulk-delete — body: { ids: string[] }
  router.post('/admin/bulk-delete', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const { ids }: { ids: string[] } = req.body || {}
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: 'ids array required' })
        return
      }
      await logAudit(req, 'log.delete', 'admin_activity_log', `bulk_${ids.length}`, { count: ids.length, sample_ids: ids.slice(0, 10) })
      const deletedCount = await logStore.bulkDeleteAdminActivityLogs(ids)
      res.json({ success: true, deletedCount })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/logs/admin/delete-before — admin only; delete admin activity logs older than N days
  router.post('/admin/delete-before', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const { daysBack }: { daysBack: number } = req.body || {}
      if (!daysBack || daysBack < 1) {
        res.status(400).json({ error: 'daysBack (positive integer) required' })
        return
      }
      const deletedCount = await logStore.deleteAdminActivityLogsBefore(daysBack)
      await logAudit(req, 'log.delete', 'admin_activity_log', `before_${daysBack}_days`, { days_back: daysBack, count: deletedCount })
      res.json({ success: true, deletedCount })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/logs/admin/delete-all — admin only; delete all admin activity logs at once
  router.post('/admin/delete-all', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const deletedCount = await logStore.deleteAllAdminActivityLogs()
      await logAudit(req, 'log.delete', 'admin_activity_log', 'all', { count: deletedCount })
      res.json({ success: true, deletedCount })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // GET /api/logs/embeddings — admin/viewer only
  router.get('/embeddings', requireAuth, async (req: Request, res: Response): Promise<void> => {
    if (!isAdminOrViewer(req)) { res.status(403).json({ error: 'Forbidden' }); return }
    try {
      const { page, limit } = paginate(req)
      const f = filters(req)
      if (f['success'] !== undefined) f['success'] = f['success'] === 'true'
      const result = await logStore.queryEmbeddingLogs({ page, limit, filters: f })
      res.json({
        data: result.rows,
        meta: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) },
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // DELETE /api/logs/embeddings/:id — admin only
  router.delete('/embeddings/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id']
      await logAudit(req, 'log.delete', 'embedding_log', id, { action: 'single_delete' })
      const deleted = await logStore.deleteEmbeddingLog(id)
      if (!deleted) { res.status(404).json({ error: 'Embedding log not found' }); return }
      res.json({ success: true, deletedCount: 1 })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/logs/embeddings/bulk-delete — admin only
  router.post('/embeddings/bulk-delete', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const { ids }: { ids: string[] } = req.body || {}
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: 'ids array required' }); return
      }
      await logAudit(req, 'log.delete', 'embedding_log', `bulk_${ids.length}`, { count: ids.length, sample_ids: ids.slice(0, 10) })
      const deletedCount = await logStore.bulkDeleteEmbeddingLogs(ids)
      res.json({ success: true, deletedCount })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/logs/embeddings/delete-before — admin only; delete embedding logs older than N days
  router.post('/embeddings/delete-before', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const { daysBack }: { daysBack: number } = req.body || {}
      if (!daysBack || daysBack < 1) {
        res.status(400).json({ error: 'daysBack (positive integer) required' })
        return
      }
      const deletedCount = await logStore.deleteEmbeddingLogsBefore(daysBack)
      await logAudit(req, 'log.delete', 'embedding_log', `before_${daysBack}_days`, { days_back: daysBack, count: deletedCount })
      res.json({ success: true, deletedCount })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/logs/embeddings/delete-all — admin only; delete all embedding logs at once
  router.post('/embeddings/delete-all', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const deletedCount = await logStore.deleteAllEmbeddingLogs()
      await logAudit(req, 'log.delete', 'embedding_log', 'all', { count: deletedCount })
      res.json({ success: true, deletedCount })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  return router
}
