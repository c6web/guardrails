import type { Request, Response } from 'express';
import { Router } from 'express'
import { Op } from 'sequelize'
import { Incident } from '../models/data-db/Incident'
import { requireRole } from '../middleware/requireRole'
import { getAccessibleAppIds, isAdminOrViewer } from '../utils/appAccess'

const router = Router()

const VALID_STATUSES  = ['open', 'investigating', 'resolved', 'closed'] as const
const VALID_SEVERITIES = ['crit', 'high', 'med', 'low'] as const

// GET /api/incidents
router.get('/', requireRole('viewer'), async (req: Request, res: Response): Promise<void> => {
  try {
    const page  = Math.max(1, parseInt(req.query['page']  as string || '1', 10))
    const limit = Math.min(200, Math.max(1, parseInt(req.query['limit'] as string || '50', 10)))
    const where: Record<string, unknown> = {}
    const appIds = await getAccessibleAppIds(req)
    if (appIds !== null) {
      if (appIds.length === 0) { res.json({ data: [], meta: { page: 1, limit: 0, total: 0, totalPages: 0 } }); return }
      where['affected_app_id'] = appIds
    }

    if (req.query['status'])         where['status']         = req.query['status']
    if (req.query['severity'])        where['severity']       = req.query['severity']
    if (req.query['framework_id'])   where['framework_id']   = req.query['framework_id']
    if (req.query['from'] || req.query['to']) {
      const range: Record<symbol, Date> = {}
      if (req.query['from']) range[Op.gte] = new Date(req.query['from'] as string)
      if (req.query['to'])   range[Op.lte] = new Date(req.query['to']   as string)
      where['created_at'] = range
    }

    const { count, rows } = await Incident.findAndCountAll({
      where,
      limit,
      offset: (page - 1) * limit,
      order: [['created_at', 'DESC']],
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

// POST /api/incidents
router.post('/', requireRole('user'), async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      title, severity, status, framework_id, description,
      source_request_id, affected_app_id, affected_app_name,
      source_ip, detector, confidence, notes,
    } = req.body as Record<string, unknown>

    if (!title || typeof title !== 'string' || !title.trim()) {
      res.status(400).json({ error: 'title is required' })
      return
    }
    if (severity && !(VALID_SEVERITIES as readonly string[]).includes(severity as string)) {
      res.status(400).json({ error: `severity must be one of: ${VALID_SEVERITIES.join(', ')}` })
      return
    }
    if (status && !(VALID_STATUSES as readonly string[]).includes(status as string)) {
      res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` })
      return
    }

     
    const user = (req as any).user
    const incident = await Incident.create({
      title:             (title as string).trim(),
      severity:          (severity as string) || 'med',
      status:            (status as string)   || 'open',
      framework_id:      (framework_id as string)      || null,
      description:       (description as string)       || null,
      source_request_id: (source_request_id as string) || null,
      affected_app_id:   (affected_app_id as string)   || null,
      affected_app_name: (affected_app_name as string) || null,
      source_ip:         (source_ip as string)         || null,
      detector:          (detector as string)           || null,
      confidence:        typeof confidence === 'number' ? confidence : null,
      created_by:        user?.email || null,
      notes:             (notes as string) || null,
    })

    res.status(201).json({ data: incident.toJSON() })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/incidents/:id
router.get('/:id', requireRole('viewer'), async (req: Request, res: Response): Promise<void> => {
  try {
    const incident = await Incident.findByPk(req.params['id'])
    if (!incident) { res.status(404).json({ error: 'Incident not found' }); return }
    if (!isAdminOrViewer(req) && incident.affected_app_id) {
      const accessible = await getAccessibleAppIds(req)
      if (accessible !== null && !accessible.includes(incident.affected_app_id)) {
        res.status(403).json({ error: 'Forbidden' }); return
      }
    }
    res.json({ data: incident.toJSON() })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/incidents/:id
router.patch('/:id', requireRole('user'), async (req: Request, res: Response): Promise<void> => {
  try {
    const incident = await Incident.findByPk(req.params['id'])
    if (!incident) { res.status(404).json({ error: 'Incident not found' }); return }

    const { title, severity, status, description, notes, resolved_by } = req.body as Record<string, unknown>

    if (severity && !(VALID_SEVERITIES as readonly string[]).includes(severity as string)) {
      res.status(400).json({ error: `severity must be one of: ${VALID_SEVERITIES.join(', ')}` })
      return
    }
    if (status && !(VALID_STATUSES as readonly string[]).includes(status as string)) {
      res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` })
      return
    }

     
    const user = (req as any).user
    const updates: Record<string, unknown> = {}
    if (title       !== undefined) updates['title']       = (title as string).trim()
    if (severity    !== undefined) updates['severity']    = severity
    if (description !== undefined) updates['description'] = description || null
    if (notes       !== undefined) updates['notes']       = notes || null

    if (status !== undefined) {
      updates['status'] = status
      if ((status === 'resolved' || status === 'closed') && !incident.resolved_at) {
        updates['resolved_at'] = new Date()
        updates['resolved_by'] = (resolved_by as string) || user?.email || null
      }
      if (status === 'open' || status === 'investigating') {
        updates['resolved_at'] = null
        updates['resolved_by'] = null
      }
    }

    await incident.update(updates)
    res.json({ data: incident.toJSON() })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/incidents/:id (admin only)
router.delete('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const incident = await Incident.findByPk(req.params['id'])
    if (!incident) { res.status(404).json({ error: 'Incident not found' }); return }
    await incident.destroy()
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
