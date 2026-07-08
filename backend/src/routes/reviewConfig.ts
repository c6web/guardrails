import type { Request, Response } from 'express';
import { Router } from 'express'
import { ReviewConfig } from '../models/data-db/ReviewConfig'
import { AiProvider } from '../models/data-db/AiProvider'

const router = Router()

// GET /api/review-config — get current config with provider name
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const config = await ReviewConfig.findByPk(1, {
      include: [{ model: AiProvider, as: 'provider', attributes: ['id', 'name', 'vendor', 'status'] }],
    })
    if (!config) {
      const created = await ReviewConfig.create({ id: 1, provider_id: null })
      res.json({ data: { id: created.id, provider_id: null, provider: null } })
      return
    }
    const data = config.toJSON() as any
    res.json({ data: { id: data.id, provider_id: data.provider_id, provider: data.provider ?? null } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/review-config — update the review provider
router.put('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider_id } = req.body as { provider_id: string | null }

    if (provider_id) {
      const provider = await AiProvider.findByPk(provider_id)
      if (!provider) { res.status(404).json({ error: 'Provider not found' }); return }
    }

    const [config] = await ReviewConfig.upsert({
      id: 1,
      provider_id: provider_id ?? null,
    })

    const data = config.toJSON()
    res.json({ data: { id: data.id, provider_id: data.provider_id } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
