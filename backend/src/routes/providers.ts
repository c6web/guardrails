import type { Request, Response } from 'express';
import { Router } from 'express'
import { AiProvider } from '../models/data-db/AiProvider'
import { UpstreamProviderLink } from '../models/data-db/UpstreamProviderLink'
import { requireRole } from '../middleware/requireRole'
import { runProviderTest } from '../utils/providerTest'
import { syncAllowedModelDefault } from '../utils/syncAllowedModelDefault'
import type { ILogStore } from '../logs/ILogStore'

function createRouter(logStore: ILogStore): Router {
  const router = Router()

  // PATCH /api/providers/:id — admin only; update upstream-assigned provider details
  router.patch('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id']
      const provider = await AiProvider.findByPk(id)
      if (!provider) { res.status(404).json({ error: 'Provider not found' }); return }

      const link = await UpstreamProviderLink.findByPk(id)
      if (!link) { res.status(409).json({ error: 'Provider is not in the upstream pool' }); return }

      const { name, vendor, api_key, endpoint, model, status, timeout_ms } = req.body as {
        name?: string; vendor?: string; api_key?: string; endpoint?: string
        model?: string; status?: 'healthy' | 'degraded' | 'unhealthy'; timeout_ms?: number
      }

      const max_output_token = (req.body as Record<string, number>)['max_output_token'] ?? provider.max_output_token
      const max_input_token = (req.body as Record<string, number>)['max_input_token'] ?? provider.max_input_token
      const notes = (req.body as Record<string, string>)['notes'] ?? provider.notes

      await provider.update({
        name: name !== undefined ? name : provider.name,
        vendor: vendor !== undefined ? vendor : provider.vendor,
        api_key: api_key !== undefined ? api_key : provider.api_key,
        endpoint: endpoint !== undefined ? endpoint : provider.endpoint,
        model: model !== undefined ? model : provider.model,
        status: status ?? provider.status,
        timeout_ms: timeout_ms !== undefined ? timeout_ms : provider.timeout_ms,
        max_output_token,
        max_input_token,
        notes,
      })

      if (model !== undefined) {
        await syncAllowedModelDefault(provider.id, model)
      }

      res.json({ data: provider })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // GET /api/providers — admin only; returns ai_providers assigned to upstream pool
  router.get('/', requireRole('admin'), async (_req: Request, res: Response): Promise<void> => {
    try {
      const links = await UpstreamProviderLink.findAll()
      if (links.length === 0) { res.json({ data: [] }); return }
      const linkMap = new Map(links.map(l => [l.ai_provider_id, l.is_default]))
      const providers = await AiProvider.findAll({
        where: { id: [...linkMap.keys()] },
        order: [['name', 'ASC']],
      })
      const data = providers.map(p => {
        const json = p.toJSON() as unknown as Record<string, unknown>
        const hasApiKey = !!json['api_key']
        delete json['api_key']
        return { ...json, is_default: linkMap.get(p.id) ?? false, has_api_key: hasApiKey }
      })
      res.json({ data })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/providers/:id/assign — admin only; add ai_provider to upstream pool
  router.post('/:id/assign', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id']
      const provider = await AiProvider.findByPk(id)
      if (!provider) { res.status(404).json({ error: 'Provider not found' }); return }

      await UpstreamProviderLink.findOrCreate({ where: { ai_provider_id: id } })
      res.status(201).json({ data: { ai_provider_id: id } })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // PATCH /api/providers/:id/set-default — admin only; mark as default upstream provider
  router.patch('/:id/set-default', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id']
      const link = await UpstreamProviderLink.findByPk(id)
      if (!link) { res.status(404).json({ error: 'Provider is not in the upstream pool' }); return }

      const provider = await AiProvider.findByPk(id)
      if (!provider) { res.status(404).json({ error: 'Provider not found' }); return }

      await UpstreamProviderLink.update({ is_default: false }, { where: {} })
      await link.update({ is_default: true })
      res.json({ data: { ai_provider_id: id, is_default: true } })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // DELETE /api/providers/:id/unassign — admin only; remove from upstream pool
  router.delete('/:id/unassign', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id']
      const link = await UpstreamProviderLink.findByPk(id)
      if (!link) { res.status(404).json({ error: 'Provider is not assigned to upstream' }); return }
      await link.destroy()
      res.status(204).send()
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/providers/:id/test — admin only
  router.post('/:id/test', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const provider = await AiProvider.findByPk(req.params['id'])
      if (!provider) { res.status(404).json({ error: 'Provider not found' }); return }
      const { prompt = 'Hello! Please respond with a brief confirmation that you are working correctly.' } = req.body as { prompt?: string }
      const result = await runProviderTest(provider, prompt)
      const triggeredBy = (req.user as { email?: string } | undefined)?.email ?? null
      void logStore.insertAiProviderCallLog({
        call_type:        'test',
        source:           'test',
        provider_id:      String(provider.id),
        provider_name:    provider.name,
        vendor:           provider.vendor,
        model:            provider.model ?? null,
        endpoint:         `${provider.endpoint}/chat/completions`,
        request_payload:  typeof result.request_payload === 'object' ? JSON.stringify(result.request_payload) : null,
        response_payload: typeof result.response_payload === 'object' ? JSON.stringify(result.response_payload) : null,
        tokens_in:        result.tokens_in ?? null,
        tokens_out:       result.tokens_out ?? null,
        tokens_total:     (result.tokens_in !== null && result.tokens_out !== null) ? ((result.tokens_in ?? 0) + (result.tokens_out ?? 0)) : null,
        duration_ms:      result.latency_ms,
        status_code:      result.status_code ?? null,
        success:          result.success,
        error_message:    result.error ?? null,
        triggered_by:     triggeredBy,
      }).catch((e: unknown) => console.error('[provider-call-log] upstream test log failed:', e))
      res.json({ data: result })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  return router
}

export default createRouter
