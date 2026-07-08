import type { Request, Response } from 'express';
import { Router } from 'express'
import { QueryTypes } from 'sequelize'
import { DetectionFramework } from '../models/data-db/DetectionFramework'
import { ThreatKnowledge } from '../models/data-db/ThreatKnowledge'
import { Detector } from '../models/data-db/Detector'
import { canManageKnowledge } from '../middleware/auth'

const router = Router()

const TK_ATTRS = ['id', 'name', 'description', 'threat_context', 'embedding_at']
const DETECTOR_ATTRS = ['id', 'name', 'description', 'rule_type', 'threshold']

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

// GET /api/detection-frameworks
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query['page'] as string || '1', 10))
    const limit = Math.min(200, Math.max(1, parseInt(req.query['limit'] as string || '50', 10)))
    const offset = (page - 1) * limit

    const { count, rows } = await DetectionFramework.findAndCountAll({
      limit,
      offset,
      distinct: true,
      order: [['display_order', 'ASC']],
      include: [
        {
          model: ThreatKnowledge,
          as: 'threatKnowledgeEntries',
          attributes: TK_ATTRS,
          through: { attributes: [] },
          required: false,
        },
        {
          model: Detector,
          as: 'detectors',
          attributes: DETECTOR_ATTRS,
          through: { attributes: [] },
          required: false,
        },
      ],
    })

    res.json({ data: rows, meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/detection-frameworks/:id
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const row = await DetectionFramework.findByPk(req.params['id'], {
      include: [
        {
          model: ThreatKnowledge,
          as: 'threatKnowledgeEntries',
          attributes: TK_ATTRS,
          through: { attributes: [] },
          required: false,
        },
        {
          model: Detector,
          as: 'detectors',
          attributes: DETECTOR_ATTRS,
          through: { attributes: [] },
          required: false,
        },
      ],
    })
    if (!row) { res.status(404).json({ error: 'Not found' }); return }
    res.json({ data: row })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

    // POST /api/detection-frameworks — admin or knowledge admin
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!canManageKnowledge(req)) { res.status(403).json({ error: 'Admin or Knowledge admin access required' }); return }

    const { id: rawId, framework_code, name, description, display_order } = req.body as Record<string, unknown>

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name is required' }); return
    }
    if (!framework_code || typeof framework_code !== 'string' || !framework_code.trim()) {
      res.status(400).json({ error: 'framework_code is required' }); return
    }
    if (!description || typeof description !== 'string' || !description.trim()) {
      res.status(400).json({ error: 'description is required' }); return
    }

    const id: string = (rawId && typeof rawId === 'string' && rawId.trim())
      ? rawId.trim()
      : slugify(name as string)

    // Determine display_order
    let order: number
    if (typeof display_order === 'number') {
      order = display_order
    } else {
      const maxRow = await DetectionFramework.findOne({ order: [['display_order', 'DESC']] })
      order = maxRow ? (maxRow.display_order + 1) : 1
    }

    const existing = await DetectionFramework.findByPk(id)
    if (existing) { res.status(409).json({ error: `Framework with id '${id}' already exists` }); return }

    const fw = await DetectionFramework.create({
      id,
      framework_code: (framework_code as string).trim(),
      name: (name as string).trim(),
      description: (description as string).trim(),
      display_order: order,
    })

    const result = await DetectionFramework.findByPk(fw.id, {
      include: [
        { model: ThreatKnowledge, as: 'threatKnowledgeEntries', attributes: TK_ATTRS, through: { attributes: [] }, required: false },
        { model: Detector, as: 'detectors', attributes: DETECTOR_ATTRS, through: { attributes: [] }, required: false },
      ],
    })
    res.status(201).json({ data: result })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/detection-frameworks/:id — admin or knowledge admin
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!canManageKnowledge(req)) { res.status(403).json({ error: 'Admin or Knowledge admin access required' }); return }

    const row = await DetectionFramework.findByPk(req.params['id'])
    if (!row) { res.status(404).json({ error: 'Not found' }); return }

    const { name, description, framework_code } = req.body as Record<string, unknown>
    const updates: Record<string, unknown> = {}
    if (name           !== undefined) updates['name']           = (name as string).trim()
    if (description    !== undefined) updates['description']    = (description as string).trim()
    if (framework_code !== undefined) updates['framework_code'] = (framework_code as string).trim()

    await row.update(updates)

    const result = await DetectionFramework.findByPk(row.id, {
      include: [
        { model: ThreatKnowledge, as: 'threatKnowledgeEntries', attributes: TK_ATTRS, through: { attributes: [] }, required: false },
        { model: Detector, as: 'detectors', attributes: DETECTOR_ATTRS, through: { attributes: [] }, required: false },
      ],
    })
    res.json({ data: result })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/detection-frameworks/:id — admin or knowledge admin
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!canManageKnowledge(req)) { res.status(403).json({ error: 'Admin or Knowledge admin access required' }); return }

    const row = await DetectionFramework.findByPk(req.params['id'])
    if (!row) { res.status(404).json({ error: 'Not found' }); return }

    await row.destroy()
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/detection-frameworks/:id/threat-knowledge — admin or knowledge admin, add TK mapping
router.post('/:id/threat-knowledge', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!canManageKnowledge(req)) { res.status(403).json({ error: 'Admin or Knowledge admin access required' }); return }

    const framework = await DetectionFramework.findByPk(req.params['id'])
    if (!framework) { res.status(404).json({ error: 'Framework not found' }); return }

    const { threat_knowledge_id } = req.body as Record<string, unknown>
    if (!threat_knowledge_id || typeof threat_knowledge_id !== 'string') {
      res.status(400).json({ error: 'threat_knowledge_id is required' }); return
    }

    const tkEntry = await ThreatKnowledge.findByPk(threat_knowledge_id)
    if (!tkEntry) { res.status(404).json({ error: 'Threat knowledge entry not found' }); return }

    const sequelize = (ThreatKnowledge as any).sequelize
    await sequelize.query(
      `INSERT INTO framework_threat_knowledge (framework_id, threat_knowledge_id) VALUES (:fid, :tkid) ON CONFLICT DO NOTHING`,
      { replacements: { fid: framework.id, tkid: threat_knowledge_id }, type: QueryTypes.INSERT }
    )

    const result = await DetectionFramework.findByPk(framework.id, {
      include: [
        { model: ThreatKnowledge, as: 'threatKnowledgeEntries', attributes: TK_ATTRS, through: { attributes: [] }, required: false },
        { model: Detector, as: 'detectors', attributes: DETECTOR_ATTRS, through: { attributes: [] }, required: false },
      ],
    })
    res.json({ data: result })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/detection-frameworks/:id/threat-knowledge/:tkId — admin or knowledge admin, remove TK mapping
router.delete('/:id/threat-knowledge/:tkId', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!canManageKnowledge(req)) { res.status(403).json({ error: 'Admin or Knowledge admin access required' }); return }

    const framework = await DetectionFramework.findByPk(req.params['id'])
    if (!framework) { res.status(404).json({ error: 'Framework not found' }); return }

    const tkEntry = await ThreatKnowledge.findByPk(req.params['tkId'])
    if (!tkEntry) { res.status(404).json({ error: 'Threat knowledge entry not found' }); return }

    const sequelize2 = (ThreatKnowledge as any).sequelize
    await sequelize2.query(
      `DELETE FROM framework_threat_knowledge WHERE framework_id = :fid AND threat_knowledge_id = :tkid`,
      { replacements: { fid: framework.id, tkid: tkEntry.id }, type: QueryTypes.DELETE }
    )

    const result = await DetectionFramework.findByPk(framework.id, {
      include: [
        { model: ThreatKnowledge, as: 'threatKnowledgeEntries', attributes: TK_ATTRS, through: { attributes: [] }, required: false },
        { model: Detector, as: 'detectors', attributes: DETECTOR_ATTRS, through: { attributes: [] }, required: false },
      ],
    })
    res.json({ data: result })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/detection-frameworks/:id/detectors — admin or knowledge admin, add detector mapping
router.post('/:id/detectors', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!canManageKnowledge(req)) { res.status(403).json({ error: 'Admin or Knowledge admin access required' }); return }

    const framework = await DetectionFramework.findByPk(req.params['id'])
    if (!framework) { res.status(404).json({ error: 'Framework not found' }); return }

    const { detector_id } = req.body as Record<string, unknown>
    if (!detector_id || typeof detector_id !== 'string') {
      res.status(400).json({ error: 'detector_id is required' }); return
    }

    const detector = await Detector.findByPk(detector_id)
    if (!detector) { res.status(404).json({ error: 'Detector not found' }); return }

    const sequelize3 = (DetectionFramework as any).sequelize
    try {
      await sequelize3.query(
        `INSERT INTO detector_framework_mapping (framework_id, detector_id) VALUES (:fid, :did) ON CONFLICT DO NOTHING`,
        { replacements: { fid: framework.id, did: detector_id }, type: QueryTypes.INSERT }
      )
    } catch {
      // Silently ignore duplicate constraint — Sequelize eager load will show it exists
    }

    const result = await DetectionFramework.findByPk(framework.id, {
      include: [
        { model: ThreatKnowledge, as: 'threatKnowledgeEntries', attributes: TK_ATTRS, through: { attributes: [] }, required: false },
        { model: Detector, as: 'detectors', attributes: DETECTOR_ATTRS, through: { attributes: [] }, required: false },
      ],
    })
    res.json({ data: result })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/detection-frameworks/:id/detectors/:detectorId — admin or knowledge admin, remove detector mapping
router.delete('/:id/detectors/:detectorId', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!canManageKnowledge(req)) { res.status(403).json({ error: 'Admin or Knowledge admin access required' }); return }

    const framework = await DetectionFramework.findByPk(req.params['id'])
    if (!framework) { res.status(404).json({ error: 'Framework not found' }); return }

    const detector = await Detector.findByPk(req.params['detectorId'])
    if (!detector) { res.status(404).json({ error: 'Detector not found' }); return }

    const sequelize4 = (DetectionFramework as any).sequelize
    await sequelize4.query(
      `DELETE FROM detector_framework_mapping WHERE framework_id = :fid AND detector_id = :did`,
      { replacements: { fid: framework.id, did: req.params['detectorId'] }, type: QueryTypes.DELETE }
    )

    const result = await DetectionFramework.findByPk(framework.id, {
      include: [
        { model: ThreatKnowledge, as: 'threatKnowledgeEntries', attributes: TK_ATTRS, through: { attributes: [] }, required: false },
        { model: Detector, as: 'detectors', attributes: DETECTOR_ATTRS, through: { attributes: [] }, required: false },
      ],
    })
    res.json({ data: result })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
