import type { Request, Response } from 'express';
import { Router } from 'express'
import { T2AgentPrompt } from '../models/data-db/T2AgentPrompt'
import { requireRole } from '../middleware/requireRole'
import { triggerGatewayReload } from '../utils/gatewayReload'

const router = Router()

// GET /api/t2-agent-prompts/stats — viewer+
router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const qualityGood = await T2AgentPrompt.count({ where: { quality_review_result: 'good' } })
    const qualityPoison = await T2AgentPrompt.count({ where: { quality_review_result: 'poison' } })
    const qualityPoor = await T2AgentPrompt.count({ where: { quality_review_result: 'poor_quality' } })
    const qualityReviewed = qualityGood + qualityPoison + qualityPoor
    const total = await T2AgentPrompt.count()
    const qualityNotReviewed = total - qualityReviewed
    res.json({ data: { qualityGood, qualityPoison, qualityPoor, qualityReviewed, qualityNotReviewed } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/t2-agent-prompts
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const prompts = await T2AgentPrompt.findAll({ order: [['created_at', 'ASC']] })
    res.json({ data: prompts })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/t2-agent-prompts/:id
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const prompt = await T2AgentPrompt.findByPk(req.params['id'])
    if (!prompt) { res.status(404).json({ error: 'T2 prompt not found' }); return }
    res.json({ data: prompt })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/t2-agent-prompts
router.post('/', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, system_prompt, threshold, max_output_tokens } = req.body as {
      name?: string; description?: string; system_prompt?: string; threshold?: number; max_output_tokens?: number
    }
    if (!name?.trim() || !system_prompt?.trim()) {
      res.status(400).json({ error: 'name and system_prompt are required' }); return
    }
    if (threshold !== undefined && (typeof threshold !== 'number' || threshold < 0 || threshold > 1)) {
      res.status(400).json({ error: 'threshold must be a number between 0 and 1' }); return
    }
    if (max_output_tokens !== undefined && (typeof max_output_tokens !== 'number' || max_output_tokens < 1)) {
      res.status(400).json({ error: 'max_output_tokens must be a positive integer' }); return
    }
    const count = await T2AgentPrompt.count()
    const record = await T2AgentPrompt.create({
      name: name.trim(),
      description: description?.trim() || null,
      system_prompt: system_prompt.trim(),
      threshold: threshold ?? 0.72,
      max_output_tokens: max_output_tokens ?? 10240,
      is_active: count === 0,
    })
    triggerGatewayReload().catch(() => {})
    res.status(201).json({ data: record })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/t2-agent-prompts/:id
router.patch('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const record = await T2AgentPrompt.findByPk(req.params['id'])
    if (!record) { res.status(404).json({ error: 'T2 prompt not found' }); return }
    if (record.is_system) { res.status(403).json({ error: 'System prompts are locked and cannot be edited' }); return }

    const { name, description, system_prompt, threshold, max_output_tokens } = req.body as {
      name?: string; description?: string; system_prompt?: string; threshold?: number; max_output_tokens?: number
    }
    const updates: Partial<{
      name: string; description: string | null; system_prompt: string; threshold: number; max_output_tokens: number
    }> = {}
    if (name?.trim()) updates.name = name.trim()
    if (description !== undefined) updates.description = description?.trim() || null
    if (system_prompt?.trim()) updates.system_prompt = system_prompt.trim()
    if (threshold !== undefined) {
      if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
        res.status(400).json({ error: 'threshold must be a number between 0 and 1' }); return
      }
      updates.threshold = threshold
    }
    if (max_output_tokens !== undefined) {
      if (typeof max_output_tokens !== 'number' || max_output_tokens < 1) {
        res.status(400).json({ error: 'max_output_tokens must be a positive integer' }); return
      }
      updates.max_output_tokens = max_output_tokens
    }

    await record.update(updates)
    triggerGatewayReload().catch(() => {})
    res.json({ data: record })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/t2-agent-prompts/:id
router.delete('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const record = await T2AgentPrompt.findByPk(req.params['id'])
    if (!record) { res.status(404).json({ error: 'T2 prompt not found' }); return }
    if (record.is_system) { res.status(403).json({ error: 'System prompts are locked and cannot be deleted' }); return }

    const wasActive = record.is_active
    const count = await T2AgentPrompt.count()
    if (count <= 1) {
      res.status(400).json({ error: 'Cannot delete the only T2 prompt' }); return
    }

    await record.destroy()

    if (wasActive) {
      const next = await T2AgentPrompt.findOne({ order: [['created_at', 'ASC']] })
      if (next) await next.update({ is_active: true })
    }

    triggerGatewayReload().catch(() => {})
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/t2-agent-prompts/:id/set-active
router.post('/:id/set-active', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const record = await T2AgentPrompt.findByPk(req.params['id'])
    if (!record) { res.status(404).json({ error: 'T2 prompt not found' }); return }

    await T2AgentPrompt.sequelize!.transaction(async (t) => {
      await T2AgentPrompt.update({ is_active: false }, { where: {}, transaction: t })
      await T2AgentPrompt.update({ is_active: true }, { where: { id: record.id }, transaction: t })
    })

    triggerGatewayReload().catch(() => {})
    res.json({ data: { id: record.id } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
