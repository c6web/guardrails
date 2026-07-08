import type { Request, Response } from 'express'
import { Router } from 'express'
import { Op, Sequelize } from 'sequelize'
import { ToolGuardrail } from '../models/data-db/ToolGuardrail'
import { ToolAuditLog } from '../models/logs-db/ToolAuditLog'
import { canManageKnowledge } from '../middleware/auth'
import { logAudit } from '../utils/auditLog'

const router = Router()

// GET /api/tools/stats — viewer+
router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const qualityGood = await ToolGuardrail.count({ where: { quality_review_result: 'good' } })
    const qualityPoison = await ToolGuardrail.count({ where: { quality_review_result: 'poison' } })
    const qualityPoor = await ToolGuardrail.count({ where: { quality_review_result: 'poor_quality' } })
    const qualityReviewed = qualityGood + qualityPoison + qualityPoor
    const total = await ToolGuardrail.count()
    const qualityNotReviewed = total - qualityReviewed
    res.json({ data: { qualityGood, qualityPoison, qualityPoor, qualityReviewed, qualityNotReviewed } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/tools — list all tool guardrails
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query['page'] as string || '1', 10))
    const limit = Math.min(200, Math.max(1, parseInt(req.query['limit'] as string || '50', 10)))
    const search = (req.query['search'] as string)?.trim()

    const where: Record<string, unknown> = {}
    if (search) {
      where['tool_name'] = { [Op.like]: `%${search}%` }
    }

    const { count, rows } = await ToolGuardrail.findAndCountAll({
      where,
      limit,
      offset: (page - 1) * limit,
      order: [['tool_name', 'ASC']],
    })

    res.json({
      data: rows.map(r => r.toJSON()),
      meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/tools — admin or knowledge admin
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
    if (!canManageKnowledge(req)) { res.status(403).json({ error: 'Admin or Knowledge admin access required' }); return }

    const { tool_name, description, parameters_schema, active } = req.body as Record<string, unknown>

    if (!tool_name || typeof tool_name !== 'string' || !tool_name.trim()) {
      res.status(400).json({ error: 'tool_name is required' })
      return
    }

    const existing = await ToolGuardrail.findOne({ where: { tool_name: tool_name.toString().trim() } })
    if (existing) {
      res.status(409).json({ error: 'Tool guardrail with this name already exists' })
      return
    }

    const tool = await ToolGuardrail.create({
      tool_name: tool_name.toString().trim(),
      description: typeof description === 'string' ? description.trim() || null : null,
      parameters_schema: parameters_schema || null,
      active: typeof active === 'boolean' ? active : true,
    })

    await logAudit(req, 'tool.create', 'tool', tool.id, { tool_name: tool.tool_name })
    res.status(201).json(tool.toJSON())
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/tools/:id — admin or knowledge admin
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
    if (!canManageKnowledge(req)) { res.status(403).json({ error: 'Admin or Knowledge admin access required' }); return }

    const tool = await ToolGuardrail.findByPk(req.params.id)
    if (!tool) {
      res.status(404).json({ error: 'Tool not found' })
      return
    }

    const body = req.body as Record<string, unknown>
    const updates: Record<string, unknown> = {}

    if (typeof body.description === 'string') updates.description = body.description.trim() || null
    if (body.parameters_schema !== undefined) updates.parameters_schema = body.parameters_schema || null
    if (typeof body.active === 'boolean') updates.active = body.active

    await tool.update(updates)
    await logAudit(req, 'tool.update', 'tool', tool.id, { tool_name: tool.tool_name })
    res.json(tool.toJSON())
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/tools/:id — admin or knowledge admin
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
    if (!canManageKnowledge(req)) { res.status(403).json({ error: 'Admin or Knowledge admin access required' }); return }

    const tool = await ToolGuardrail.findByPk(req.params.id)
    if (!tool) {
      res.status(404).json({ error: 'Tool not found' })
      return
    }

    await logAudit(req, 'tool.delete', 'tool', tool.id, { tool_name: tool.tool_name })
    await tool.destroy()
    res.json({ id: tool.id, deleted: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/tools/audit?app_id=...&page=...&limit=... — tool usage audit log
router.get('/audit', async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query['page'] as string || '1', 10))
    const limit = Math.min(200, Math.max(1, parseInt(req.query['limit'] as string || '50', 10)))
    const where: Record<string, unknown> = {}

    if (req.query['app_id']) {
      const appId = req.query['app_id'] as string
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(appId)) {
        res.status(400).json({ error: 'Invalid app_id format' })
        return
      }
      where['app_id'] = appId
    }
    if (req.query['tool_name']) where['tool_name'] = req.query['tool_name'] as string
    if (req.query['request_id']) where['request_id'] = req.query['request_id'] as string

    if (req.query['from'] || req.query['to']) {
      const range: Record<symbol, Date> = {}
      if (req.query['from']) range[Op.gte] = new Date(req.query['from'] as string)
      if (req.query['to']) range[Op.lte] = new Date(req.query['to'] as string)
      where['created_at'] = range
    }

    const { count, rows } = await ToolAuditLog.findAndCountAll({
      where,
      limit,
      offset: (page - 1) * limit,
      order: [[Sequelize.literal('"created_at"'), 'DESC']],
    })

    res.json({
      data: rows.map(r => r.toJSON()),
      meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
