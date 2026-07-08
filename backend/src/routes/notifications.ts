import type { Request, Response } from 'express';
import { Router } from 'express'
import { Op } from 'sequelize'
import { NotificationServer } from '../models/data-db/NotificationServer'
import { NotificationLog } from '../models/logs-db/NotificationLog'
import { requireRole } from '../middleware/requireRole'
import { testNotificationServer } from '../utils/emailTest'
import { notificationEncrypt, notificationDecrypt } from '../utils/gatewayKeyCrypto'

const router = Router()

const MASKED = '••••'
const SENSITIVE_KEYS = ['password', 'api_key', 'secret']

function encryptConfig(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...config }
  for (const key of SENSITIVE_KEYS) {
    const v = out[key]
    if (v && typeof v === 'string' && !v.startsWith('enc:') && !v.startsWith('v2:')) {
      out[key] = notificationEncrypt(v)
    }
  }
  return out
}

function decryptConfig(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...config }
  for (const key of SENSITIVE_KEYS) {
    const v = out[key]
    if (v && typeof v === 'string' && (v.startsWith('enc:') || v.startsWith('v2:'))) {
      try { out[key] = notificationDecrypt(v) } catch { out[key] = '' }
    }
  }
  return out
}

function maskConfig(config: Record<string, unknown>): Record<string, unknown> {
  const decrypted = decryptConfig(config)
  const masked: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(decrypted)) {
    masked[k] = SENSITIVE_KEYS.includes(k) && v ? MASKED : v
  }
  return masked
}

function stripMasked(
  incoming: Record<string, unknown>,
  existing: Record<string, unknown>,
): Record<string, unknown> {
  const existingDecrypted = decryptConfig(existing)
  const merged: Record<string, unknown> = { ...existingDecrypted }
  for (const [k, v] of Object.entries(incoming)) {
    if (v !== MASKED) merged[k] = v
  }
  return merged
}

// GET /api/notifications/servers
router.get('/servers', requireRole('viewer'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const servers = await NotificationServer.findAll({ order: [['created_at', 'ASC']] })
    res.json({ data: servers.map(s => ({ ...s.toJSON(), config: maskConfig(s.config) })) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/notifications/servers/:id
router.get('/servers/:id', requireRole('viewer'), async (req: Request, res: Response): Promise<void> => {
  try {
    const server = await NotificationServer.findByPk(req.params['id'])
    if (!server) { res.status(404).json({ error: 'Server not found' }); return }
    res.json({ data: { ...server.toJSON(), config: maskConfig(server.config) } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/notifications/servers
router.post('/servers', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, type, config } = req.body as {
      name?: string; description?: string; type?: string; config?: Record<string, unknown>
    }
    if (!name?.trim() || !type?.trim() || !config) {
      res.status(400).json({ error: 'name, type, and config are required' }); return
    }
    const count = await NotificationServer.count()
    const server = await NotificationServer.create({
      name: name.trim(),
      description: description?.trim() || null,
      type: type.trim(),
      config: encryptConfig(config),
      is_default: count === 0,
    })
    res.status(201).json({ data: { ...server.toJSON(), config: maskConfig(server.config) } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/notifications/servers/:id
router.patch('/servers/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const server = await NotificationServer.findByPk(req.params['id'])
    if (!server) { res.status(404).json({ error: 'Server not found' }); return }

    const { name, description, config } = req.body as {
      name?: string; description?: string; config?: Record<string, unknown>
    }
    const updates: Partial<{ name: string; description: string | null; config: Record<string, unknown> }> = {}
    if (name?.trim()) updates.name = name.trim()
    if (description !== undefined) updates.description = description?.trim() || null
    if (config)       updates.config = encryptConfig(stripMasked(config, server.config))

    await server.update(updates)
    res.json({ data: { ...server.toJSON(), config: maskConfig(server.config) } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/notifications/servers/:id
router.delete('/servers/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const server = await NotificationServer.findByPk(req.params['id'])
    if (!server) { res.status(404).json({ error: 'Server not found' }); return }

    const wasDefault = server.is_default
    await server.destroy()

    if (wasDefault) {
      const next = await NotificationServer.findOne({ order: [['created_at', 'ASC']] })
      if (next) await next.update({ is_default: true })
    }

    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/notifications/servers/:id/set-default
router.post('/servers/:id/set-default', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const server = await NotificationServer.findByPk(req.params['id'])
    if (!server) { res.status(404).json({ error: 'Server not found' }); return }

    await NotificationServer.sequelize!.transaction(async (t) => {
      await NotificationServer.update({ is_default: false }, { where: {}, transaction: t })
      await NotificationServer.update({ is_default: true }, { where: { id: server.id }, transaction: t })
    })

    res.json({ data: { id: server.id } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/notifications/servers/:id/test — admin only (SSRF mitigation)
router.post('/servers/:id/test', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const server = await NotificationServer.findByPk(req.params['id'])
    if (!server) { res.status(404).json({ error: 'Server not found' }); return }

    const { recipient } = req.body as { recipient?: string }
    if (!recipient?.trim() || !/\S+@\S+\.\S+/.test(recipient)) {
      res.status(400).json({ error: 'A valid recipient email is required' }); return
    }

    const result = await testNotificationServer(server.type, decryptConfig(server.config), recipient.trim())
    const subject = 'AI Firewall Gateway — test notification'

    await NotificationLog.create({
      server_id:     server.id,
      server_name:   server.name,
      server_type:   server.type,
      recipient:     recipient.trim(),
      subject,
      status:        result.success ? 'sent' : 'failed',
      error_message: result.error ?? null,
      message_id:    result.message_id ?? null,
      triggered_by:  req.user?.username ?? 'unknown',
    })

    res.json({ data: result })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/notifications/logs/:id — delete a single notification log entry
router.delete('/logs/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const log = await NotificationLog.findByPk(req.params['id'])
    if (!log) { res.status(404).json({ error: 'Notification log not found' }); return }
    await log.destroy()
    res.json({ success: true, deletedCount: 1 })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/notifications/logs/bulk-delete — body: { ids: string[] }
router.post('/logs/bulk-delete', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { ids }: { ids: string[] } = req.body || {}
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids array required' })
      return
    }
    const deletedCount = await NotificationLog.destroy({ where: { id: ids } })
    res.json({ success: true, deletedCount })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/notifications/logs/delete-before — admin only; delete notification logs older than N days
router.post('/logs/delete-before', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { daysBack }: { daysBack: number } = req.body || {}
    if (!daysBack || daysBack < 1) {
      res.status(400).json({ error: 'daysBack (positive integer) required' })
      return
    }
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - daysBack)
    const deletedCount = await NotificationLog.destroy({ where: { created_at: { [Op.lte]: cutoff.toISOString() } } })
    res.json({ success: true, deletedCount })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/notifications/logs/delete-all — admin only; delete all notification logs at once
router.post('/logs/delete-all', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const deletedCount = await NotificationLog.destroy({ where: {} })
    res.json({ success: true, deletedCount })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/notifications/logs
router.get('/logs', requireRole('viewer'), async (req: Request, res: Response): Promise<void> => {
  try {
    const page   = Math.max(1, parseInt(req.query['page']   as string) || 1)
    const limit  = Math.min(100, Math.max(1, parseInt(req.query['limit'] as string) || 50))
    const status = req.query['status'] as string | undefined
    const serverId = req.query['server_id'] as string | undefined

    const where: Record<string, unknown> = {}
    if (status === 'sent' || status === 'failed') where['status'] = status
    if (serverId) where['server_id'] = serverId

    const { count, rows } = await NotificationLog.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    })

    res.json({
      data: rows.map(r => {
        const j = r.toJSON() as unknown as Record<string, unknown>
        if (!j['created_at'] && j['createdAt']) j['created_at'] = j['createdAt']
        return j
      }),
      meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/notifications/logs/servers-summary — distinct server names for filter dropdown
router.get('/logs/servers-summary', requireRole('viewer'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await NotificationLog.findAll({
      attributes: [
        [NotificationLog.sequelize!.fn('DISTINCT', NotificationLog.sequelize!.col('server_name')), 'server_name'],
        'server_id',
      ],
      raw: true,
    }) as unknown as { server_name: string; server_id: string | null }[]
    // De-duplicate since DISTINCT on two columns isn't clean with Sequelize — do it in JS
    const seen = new Set<string>()
    const unique = rows.filter(r => {
      if (seen.has(r.server_name)) return false
      seen.add(r.server_name)
      return true
    })
    res.json({ data: unique })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
