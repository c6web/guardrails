import type { Request, Response } from 'express';
import { Router } from 'express'
import { Op, QueryTypes } from 'sequelize'
import { toSql } from 'pgvector'
import type { ILogStore } from '../logs/ILogStore'
import { ThreatKnowledge } from '../models/data-db/ThreatKnowledge'
import { canManageKnowledge } from '../middleware/auth'
import {
  generateEmbedding,
  generateEmbeddingWithMetadata,
  EmbeddingError,
} from '../utils/embedding'
import { getActiveEmbeddingDimension } from '../utils/embedding/activeDimension'
import { triggerGatewayReload } from '../utils/gatewayReload'

export function createThreatKnowledgeRouter(logStore: ILogStore): Router {
  const router = Router()

  async function getEmbeddingStatus(embedding: number[] | null, activeDim: number | null): Promise<string> {
    if (embedding === null) return 'no-embedding'
    const actualDim = Array.isArray(embedding) ? embedding.length : 0
    if (activeDim !== null && actualDim !== activeDim) return 'dimension-mismatch'
    if (actualDim >= 1) return 'valid'
    return 'corrupted'
  }

  async function enrichWithStatus(row: any, activeDim: number | null): Promise<any> {
    const status = await getEmbeddingStatus(row.embedding, activeDim)
    return { ...row.get(), embedding_status: status }
  }

  // GET /api/threat-knowledge/stats — viewer+
  router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
    try {
      const total = await ThreatKnowledge.count()
      const embedded = await ThreatKnowledge.count({
        where: { embedding: { [Op.ne]: null } },
      })
      const pending = await ThreatKnowledge.count({ where: { status: 'pending' } })
      const noEmbedding = total - embedded
      const pct = total > 0 ? Math.round((embedded / total) * 100) : 0
      const activeDim = await getActiveEmbeddingDimension()

      let mismatch = 0
      if (activeDim !== null && activeDim !== undefined) {
        const rows = await ThreatKnowledge.sequelize!.query(
          `SELECT COUNT(*) AS cnt FROM threat_knowledge WHERE embedding IS NOT NULL AND array_length(embedding::real[], 1) != :dim`,
          {
            replacements: { dim: activeDim },
            type: QueryTypes.SELECT,
          }
        )
        mismatch = parseInt((rows as any[])[0]?.cnt ?? '0', 10)
      }

      const qualityGood = await ThreatKnowledge.count({ where: { quality_review_result: 'good' } })
      const qualityPoison = await ThreatKnowledge.count({ where: { quality_review_result: 'poison' } })
      const qualityPoor = await ThreatKnowledge.count({ where: { quality_review_result: 'poor_quality' } })
      const qualityReviewed = qualityGood + qualityPoison + qualityPoor
      const qualityNotReviewed = total - qualityReviewed

      res.json({ data: { total, embedded, noEmbedding, pct, activeDim, mismatch, pending, qualityGood, qualityPoison, qualityPoor, qualityReviewed, qualityNotReviewed } })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // GET /api/threat-knowledge — viewer+
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const search = req.query['search'] as string | undefined
      const statusFilter = req.query['status'] as string | undefined
      const sourceFilter = req.query['source'] as string | undefined
      const page = Math.max(1, parseInt(req.query['page'] as string || '1', 10))
      const limit = Math.min(200, Math.max(1, parseInt(req.query['limit'] as string || '50', 10)))
      const offset = (page - 1) * limit
      const sortCol = (req.query['sort'] as string | undefined) ?? ''
      const orderDir = ((req.query['order'] as string | undefined) ?? 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC'

      const where: any = {}

      if (search?.trim()) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { description: { [Op.iLike]: `%${search}%` } },
        ]
      }
      if (statusFilter?.trim()) where['status'] = statusFilter.trim()
      if (sourceFilter?.trim()) where['source'] = sourceFilter.trim()

      const validCols = ['name', 'description', 'created_at', 'updated_at']
      const orderCol = validCols.includes(sortCol) ? sortCol : 'name'

      const total = await ThreatKnowledge.count({ where })
      const rows = await ThreatKnowledge.findAll({
        where,
        limit,
        offset,
        order: [[orderCol, orderDir]],
      })

      const activeDim = await getActiveEmbeddingDimension()
      const enrichedRows = await Promise.all(rows.map(row => enrichWithStatus(row, activeDim)))

      res.json({ data: enrichedRows, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/threat-knowledge/semantic-search — viewer+
  router.post('/semantic-search', async (req: Request, res: Response): Promise<void> => {
    try {
      const { input, threshold = 0.7 } = req.body as { input?: unknown; threshold?: unknown }

      if (!input || typeof input !== 'string' || !input.trim()) {
        res.status(400).json({ error: 'input text is required' }); return
      }
      const sim = parseFloat(String(threshold))
      if (isNaN(sim) || sim < 0 || sim > 1) {
        res.status(400).json({ error: 'threshold must be a number between 0 and 1' }); return
      }

      let queryEmbedding: number[]
      try {
        queryEmbedding = await generateEmbedding((input as string).trim(), logStore, 'semantic-search')
      } catch (err) {
        const status = err instanceof EmbeddingError ? 503 : 502
        res.status(status).json({ error: (err as Error).message }); return
      }

      // cosine distance (<=>) is 0 (identical) → 2 (opposite); similarity = 1 − distance
      const vectorLiteral = toSql(queryEmbedding)
      const rows = await (ThreatKnowledge as any).sequelize.query(
        `SELECT id, name, description, threat_context, embedding_at, created_at, updated_at,
                ROUND((1 - (embedding <=> :vec::vector))::numeric, 4) AS similarity
         FROM threat_knowledge
         WHERE embedding IS NOT NULL
           AND (1 - (embedding <=> :vec::vector)) >= :threshold
         ORDER BY similarity DESC
         LIMIT 20`,
        {
          replacements: { vec: vectorLiteral, threshold: sim },
          type: QueryTypes.SELECT,
        }
      )

      res.json({ data: rows })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // GET /api/threat-knowledge/:id — viewer+
  router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const entry = await ThreatKnowledge.findByPk(req.params['id'])
      if (!entry) { res.status(404).json({ error: 'Not found' }); return }
      const activeDim = await getActiveEmbeddingDimension()
      const enriched = await enrichWithStatus(entry, activeDim)
      res.json({ data: enriched })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/threat-knowledge — admin only
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
      if (!canManageKnowledge(req)) { res.status(403).json({ error: 'Admin or Knowledge admin access required' }); return }

      const { name, description, threat_context } = req.body as Record<string, unknown>
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'name is required' }); return
      }
      if (!description || typeof description !== 'string' || !description.trim()) {
        res.status(400).json({ error: 'description is required' }); return
      }

      const userId = req.user?.userId ?? null
      const tc = (threat_context as string | undefined)?.trim() || null
      const entry = await ThreatKnowledge.create({
        name:           (name as string).trim(),
        description:    (description as string).trim(),
        threat_context: tc,
        created_by:     userId,
        updated_by:     userId,
        status:         'active',
        source:         'manual',
      })

      // Auto-generate embedding if threat_context is provided (non-blocking)
      if (tc) {
        try {
          const embResult = await generateEmbeddingWithMetadata(tc, logStore, 'threat-knowledge-create')
          await entry.update({ embedding: embResult.embedding, embedding_at: new Date() })
        } catch {
          // Embedding failure does not block record creation; already logged internally
        }
      }

      const activeDim = await getActiveEmbeddingDimension()
      const enriched = await enrichWithStatus(entry, activeDim)
      res.status(201).json({ data: enriched })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // PATCH /api/threat-knowledge/:id — admin only
  router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      if (!canManageKnowledge(req)) { res.status(403).json({ error: 'Admin or Knowledge admin access required' }); return }

      const entry = await ThreatKnowledge.findByPk(req.params['id'])
      if (!entry) { res.status(404).json({ error: 'Not found' }); return }

      const { name, description, threat_context } = req.body as Record<string, unknown>
      const updates: Record<string, unknown> = {}
      if (name           !== undefined) updates['name']           = (name as string).trim()
      if (description    !== undefined) updates['description']    = (description as string).trim()
      if (threat_context !== undefined) updates['threat_context'] = (threat_context as string | null)?.trim() || null
      updates['updated_by'] = req.user?.userId ?? null

      await entry.update(updates)

      // Re-generate embedding if threat_context changed and no valid embedding exists
      const tcVal = (threat_context as string | null | undefined)
      const newTc = tcVal !== undefined ? (tcVal as string | null)?.trim() || null : entry.threat_context
      const activeDim = await getActiveEmbeddingDimension()
      const statusBefore = await getEmbeddingStatus(entry.embedding, activeDim)
      const hasValidEmbedding = statusBefore === 'valid'

      if (newTc && !hasValidEmbedding) {
        try {
          const embResult = await generateEmbeddingWithMetadata(newTc, logStore, 'threat-knowledge-update')
          await entry.update({ embedding: embResult.embedding, embedding_at: new Date() })
        } catch {
          // Embedding failure does not block the update; already logged internally
        }
      }

      const enriched = await enrichWithStatus(entry, activeDim)
      res.json({ data: enriched })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // DELETE /api/threat-knowledge/:id — admin only
  router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      if (!canManageKnowledge(req)) { res.status(403).json({ error: 'Admin or Knowledge admin access required' }); return }

      const entry = await ThreatKnowledge.findByPk(req.params['id'])
      if (!entry) { res.status(404).json({ error: 'Not found' }); return }
      await entry.destroy()
      res.status(204).send()
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/threat-knowledge/:id/embed — admin only
  router.post('/:id/embed', async (req: Request, res: Response): Promise<void> => {
    try {
      if (!canManageKnowledge(req)) { res.status(403).json({ error: 'Admin or Knowledge admin access required' }); return }

      const entry = await ThreatKnowledge.findByPk(req.params['id'])
      if (!entry) { res.status(404).json({ error: 'Not found' }); return }
      if (!entry.threat_context?.trim()) {
        res.status(400).json({ error: 'Attack Example (threat_context) is required for embedding' }); return
      }

      try {
        const embResult = await generateEmbeddingWithMetadata(entry.threat_context, logStore, 'threat-knowledge-embed')
        await entry.update({ embedding: embResult.embedding, embedding_at: new Date() })
        res.json({ data: entry })
      } catch (err) {
        const status = err instanceof EmbeddingError ? 503 : 502
        res.status(status).json({ error: (err as Error).message })
      }
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/threat-knowledge/:id/approve — admin only, approve a pending agent entry
  router.post('/:id/approve', async (req: Request, res: Response): Promise<void> => {
    try {
      if (!canManageKnowledge(req)) { res.status(403).json({ error: 'Admin or Knowledge admin access required' }); return }

      const entry = await ThreatKnowledge.findByPk(req.params['id'])
      if (!entry) { res.status(404).json({ error: 'Not found' }); return }

      await entry.update({ status: 'active', updated_by: req.user?.userId ?? null })

      // Regenerate embedding if missing (non-blocking)
      if (!entry.embedding && entry.threat_context?.trim()) {
        try {
          const embResult = await generateEmbeddingWithMetadata(entry.threat_context, logStore, 'threat-knowledge-approve')
          await entry.update({ embedding: embResult.embedding, embedding_at: new Date() })
        } catch {
          // Non-blocking — admin can trigger manually via embed endpoint
        }
      }

      await triggerGatewayReload()
      const activeDim = await getActiveEmbeddingDimension()
      const enriched = await enrichWithStatus(entry, activeDim)
      res.json({ data: enriched })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/threat-knowledge/:id/reject — admin only, reject a pending agent entry
  router.post('/:id/reject', async (req: Request, res: Response): Promise<void> => {
    try {
      if (!canManageKnowledge(req)) { res.status(403).json({ error: 'Admin or Knowledge admin access required' }); return }

      const entry = await ThreatKnowledge.findByPk(req.params['id'])
      if (!entry) { res.status(404).json({ error: 'Not found' }); return }

      await entry.update({ status: 'rejected', updated_by: req.user?.userId ?? null })
      const activeDim = await getActiveEmbeddingDimension()
      const enriched = await enrichWithStatus(entry, activeDim)
      res.json({ data: enriched })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/threat-knowledge/embed-all/stream — admin only, batch embed with SSE progress
  router.post('/embed-all/stream', async (req: Request, res: Response): Promise<void> => {
    try {
      if (!canManageKnowledge(req)) { res.status(403).json({ error: 'Admin or Knowledge admin access required' }); return }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      })

      const { force } = req.body as { force?: boolean }
      const activeDim = await getActiveEmbeddingDimension()

      const entries = await ThreatKnowledge.findAll({
        where: { threat_context: { [Op.not]: null, [Op.ne]: '' } },
        order: [['created_at', 'ASC']],
      })

      if (entries.length === 0) {
        res.write(`event: complete\ndata: {"total":0,"succeeded":0,"failed":0,"regenerated":0,"triggered_reload":false}\n\n`)
        res.end()
        return
      }

      let succeeded = 0
      let failed = 0
      let regenerated = 0

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        const current = i + 1
        const total = entries.length
        let skipped = false

        if (!force) {
          const status = await getEmbeddingStatus(entry.embedding, activeDim)
          if (status === 'valid') {
            succeeded++
            skipped = true
            const payload = JSON.stringify({ current, total, succeeded, failed, entry_name: entry.name, success: true, skipped })
            res.write(`event: progress\ndata: ${payload}\n\n`)
            continue
          }
        }

        try {
          const embResult = await generateEmbeddingWithMetadata(entry.threat_context!, logStore, 'threat-knowledge-embed-all')
          await entry.update({ embedding: embResult.embedding, embedding_at: new Date() })
          succeeded++
          regenerated++
          const payload = JSON.stringify({ current, total, succeeded, failed, entry_name: entry.name, success: true, skipped })
          res.write(`event: progress\ndata: ${payload}\n\n`)
        } catch (err) {
          failed++
          const errorMsg = (err as Error).message
          console.error(`embed-all-stream: failed for "${entry.name}":`, err)
          const payload = JSON.stringify({ current, total, succeeded, failed, entry_name: entry.name, success: false, error: errorMsg, skipped })
          res.write(`event: progress\ndata: ${payload}\n\n`)
        }
      }

      const triggered = (force || regenerated > 0) && succeeded > 0
      if (triggered) {
        await triggerGatewayReload()
      }

      const completePayload = JSON.stringify({ total: entries.length, succeeded, failed, regenerated, triggered_reload: triggered })
      res.write(`event: complete\ndata: ${completePayload}\n\n`)
      res.end()
    } catch (err) {
      console.error(err)
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' })
      } else {
        res.write(`event: error\ndata: ${JSON.stringify({ error: (err as Error).message })}\n\n`)
        res.end()
      }
    }
  })

  // POST /api/threat-knowledge/embed-all — admin only, batch embed all records with threat_context
  router.post('/embed-all', async (req: Request, res: Response): Promise<void> => {
    try {
      if (!canManageKnowledge(req)) { res.status(403).json({ error: 'Admin or Knowledge admin access required' }); return }

      const { force } = req.body as { force?: boolean }
      const activeDim = await getActiveEmbeddingDimension()

      const entries = await ThreatKnowledge.findAll({
        where: { threat_context: { [Op.not]: null, [Op.ne]: '' } },
        order: [['created_at', 'ASC']],
      })

      if (entries.length === 0) {
        res.json({ data: { total: 0, succeeded: 0, failed: 0, results: [], regenerated: 0 } }); return
      }

      let succeeded = 0
      let failed = 0
      let regenerated = 0
      const results: { id: string; name: string; success: boolean; error?: string }[] = []

      for (const entry of entries) {
        if (!force) {
          const status = await getEmbeddingStatus(entry.embedding, activeDim)
          if (status === 'valid') {
            succeeded++
            results.push({ id: entry.id, name: entry.name, success: true })
            continue
          }
        }

        try {
          const embResult = await generateEmbeddingWithMetadata(entry.threat_context!, logStore, 'threat-knowledge-embed-all')
          await entry.update({ embedding: embResult.embedding, embedding_at: new Date() })
          succeeded++
          regenerated++
          results.push({ id: entry.id, name: entry.name, success: true })
        } catch (err) {
          failed++
          results.push({ id: entry.id, name: entry.name, success: false, error: (err as Error).message })
          console.error(`embed-all: failed for "${entry.name}":`, err)
        }
      }

      if (force && succeeded > 0) {
        await triggerGatewayReload()
      }

      res.json({ data: { total: entries.length, succeeded, failed, results, regenerated } })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  return router
}
