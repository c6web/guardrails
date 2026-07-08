import type { Request, Response } from 'express';
import { Router } from 'express'
import { AiProvider } from '../models/data-db/AiProvider'
import { getOrCreateConfig } from '../models/data-db/ClassifierConfig'
import { requireRole } from '../middleware/requireRole'
import { triggerGatewayReload } from '../utils/gatewayReload'

const router = Router()

// GET /api/classifiers/config — admin only
router.get('/config', requireRole('admin'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const cfg = await getOrCreateConfig()
    res.json({ data: { primary_id: cfg.primary_id, backup1_id: cfg.backup1_id, backup2_id: cfg.backup2_id, confidence_threshold: cfg.confidence_threshold } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/classifiers/config — admin only
router.patch('/config', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { primary_id, backup1_id, backup2_id, confidence_threshold } = req.body as {
      primary_id?: string | null
      backup1_id?: string | null
      backup2_id?: string | null
      confidence_threshold?: number
    }

    const cfg = await getOrCreateConfig()

    const newPrimary = primary_id  !== undefined ? primary_id  : cfg.primary_id
    let newBackup1 = backup1_id  !== undefined ? backup1_id  : cfg.backup1_id
    let newBackup2 = backup2_id  !== undefined ? backup2_id  : cfg.backup2_id

    // Cascade nulls: no primary → no backups; no backup1 → no backup2
    if (!newPrimary) { newBackup1 = null; newBackup2 = null }
    if (!newBackup1) { newBackup2 = null }

    // Validate referenced IDs exist in ai_providers
    const ids = [newPrimary, newBackup1, newBackup2].filter(Boolean) as string[]
    if (ids.length > 0) {
      const found = await AiProvider.findAll({ where: { id: ids } })
      const foundIds = new Set(found.map(p => p.id))
      const missing = ids.filter(id => !foundIds.has(id))
      if (missing.length > 0) {
        res.status(400).json({ error: `Unknown provider IDs: ${missing.join(', ')}` })
        return
      }
    }

    // No duplicate slots
    const nonNull = [newPrimary, newBackup1, newBackup2].filter(Boolean)
    if (new Set(nonNull).size !== nonNull.length) {
      res.status(400).json({ error: 'Each slot must reference a distinct provider' })
      return
    }

    // Validate confidence_threshold range
    const newThreshold = confidence_threshold !== undefined ? confidence_threshold : cfg.confidence_threshold
    if (typeof newThreshold !== 'number' || newThreshold < 0 || newThreshold > 1) {
      res.status(400).json({ error: 'confidence_threshold must be a number between 0 and 1' })
      return
    }

    await cfg.update({ primary_id: newPrimary, backup1_id: newBackup1, backup2_id: newBackup2, confidence_threshold: newThreshold })
    triggerGatewayReload().catch(() => {})
    res.json({ data: { primary_id: cfg.primary_id, backup1_id: cfg.backup1_id, backup2_id: cfg.backup2_id, confidence_threshold: cfg.confidence_threshold } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
