import type { Request, Response } from 'express';
import { Router } from 'express'
import { ContentQualityJudgePrompt } from '../models/data-db/ContentQualityJudgePrompt'
import { requireRole } from '../middleware/requireRole'
import { triggerGatewayReload } from '../utils/gatewayReload'

const router = Router()

// Factory default values for the baseline prompt (id 00000000-0000-0000-0000-000000000201,
// is_default=true) — kept verbatim in sync with the seeder
// (backend/src/seeders/data-db/20270710000001-seed-content-quality-judge-prompts.js) so
// "Restore Default" always resets to exactly what a fresh install ships with.
const DEFAULT_BASELINE = {
  name: 'Default Content Quality Judge (baseline)',
  description: 'Baseline groundedness + answer relevance scoring criteria. Passed through to the Content Quality Provider as scoring guidance alongside the prompt context and the AI response.',
  system_prompt: `Score the assistant's response against the provided context (the full prompt: system \
instructions + user message + conversation history).

Groundedness: does every material claim in the response trace back to something stated or \
reasonably inferable from the context? Penalize invented facts, numbers, names, or citations \
that are not supported by the context.

Answer relevance: does the response actually address what was asked? Penalize responses that \
are evasive, off-topic, or answer a different question than the one in the context.

Do not penalize a response for being concise, for declining an unsafe request, or for asking a \
clarifying question when the context is genuinely ambiguous — those are not quality failures.`,
  threshold: 0.7,
  max_output_tokens: 10240,
}

// GET /api/content-quality-judge/prompts/stats — quality review counts (must be
// registered before the /:id route below, or Express would match "stats" as an id)
router.get('/prompts/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const qualityGood = await ContentQualityJudgePrompt.count({ where: { quality_review_result: 'good' } })
    const qualityPoison = await ContentQualityJudgePrompt.count({ where: { quality_review_result: 'poison' } })
    const qualityPoor = await ContentQualityJudgePrompt.count({ where: { quality_review_result: 'poor_quality' } })
    const qualityReviewed = qualityGood + qualityPoison + qualityPoor
    const total = await ContentQualityJudgePrompt.count()
    const qualityNotReviewed = total - qualityReviewed
    res.json({ data: { qualityGood, qualityPoison, qualityPoor, qualityReviewed, qualityNotReviewed } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/content-quality-judge/prompts
router.get('/prompts', async (_req: Request, res: Response): Promise<void> => {
  try {
    const prompts = await ContentQualityJudgePrompt.findAll({ order: [['created_at', 'ASC']] })
    res.json({ data: prompts })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/content-quality-judge/prompts/:id
router.get('/prompts/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const prompt = await ContentQualityJudgePrompt.findByPk(req.params['id'])
    if (!prompt) { res.status(404).json({ error: 'Content quality judge prompt not found' }); return }
    res.json({ data: prompt })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/content-quality-judge/prompts
router.post('/prompts', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
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
    const count = await ContentQualityJudgePrompt.count()
    const record = await ContentQualityJudgePrompt.create({
      name: name.trim(),
      description: description?.trim() || null,
      system_prompt: system_prompt.trim(),
      threshold: threshold ?? 0.7,
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

// PATCH /api/content-quality-judge/prompts/:id
router.patch('/prompts/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const record = await ContentQualityJudgePrompt.findByPk(req.params['id'])
    if (!record) { res.status(404).json({ error: 'Content quality judge prompt not found' }); return }
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

// DELETE /api/content-quality-judge/prompts/:id
router.delete('/prompts/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const record = await ContentQualityJudgePrompt.findByPk(req.params['id'])
    if (!record) { res.status(404).json({ error: 'Content quality judge prompt not found' }); return }
    if (record.is_system) { res.status(403).json({ error: 'System prompts are locked and cannot be deleted' }); return }

    const wasActive = record.is_active
    const count = await ContentQualityJudgePrompt.count()
    if (count <= 1) {
      res.status(400).json({ error: 'Cannot delete the only content quality judge prompt' }); return
    }

    await record.destroy()

    if (wasActive) {
      const next = await ContentQualityJudgePrompt.findOne({ order: [['created_at', 'ASC']] })
      if (next) await next.update({ is_active: true })
    }

    triggerGatewayReload().catch(() => {})
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/content-quality-judge/prompts/:id/set-active
router.post('/prompts/:id/set-active', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const record = await ContentQualityJudgePrompt.findByPk(req.params['id'])
    if (!record) { res.status(404).json({ error: 'Content quality judge prompt not found' }); return }

    await ContentQualityJudgePrompt.sequelize!.transaction(async (t) => {
      await ContentQualityJudgePrompt.update({ is_active: false }, { where: {}, transaction: t })
      await ContentQualityJudgePrompt.update({ is_active: true }, { where: { id: record.id }, transaction: t })
    })

    triggerGatewayReload().catch(() => {})
    res.json({ data: { id: record.id } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/content-quality-judge/prompts/:id/restore-default — reset the baseline
// prompt's scoring criteria back to factory defaults. Only valid for the record
// marked is_default=true; lets an admin recover from an edit that broke scoring
// without having to remember or retype the original criteria.
router.post('/prompts/:id/restore-default', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const record = await ContentQualityJudgePrompt.findByPk(req.params['id'])
    if (!record) { res.status(404).json({ error: 'Content quality judge prompt not found' }); return }
    if (!record.is_default) { res.status(400).json({ error: 'Only the default baseline prompt can be restored' }); return }

    await record.update(DEFAULT_BASELINE)
    triggerGatewayReload().catch(() => {})
    res.json({ data: record })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
