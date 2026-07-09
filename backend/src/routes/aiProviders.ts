import type { Request, Response } from 'express';
import { Router } from 'express'
import { AiProvider } from '../models/data-db/AiProvider'
import { AiProviderAllowedModel } from '../models/data-db/AiProviderAllowedModel'
import { UpstreamProviderLink } from '../models/data-db/UpstreamProviderLink'
import { getOrCreateConfig } from '../models/data-db/ClassifierConfig'
import { requireRole } from '../middleware/requireRole'
import { runProviderTest } from '../utils/providerTest'
import { providerKeyEncryptOnce, providerKeyDecrypt } from '../utils/gatewayKeyCrypto'
import { triggerGatewayReload } from '../utils/gatewayReload'
import { validateEndpoint } from '../utils/validateEndpoint'
import { fetchModels } from '../utils/modelLookup'
import { syncAllowedModelDefault } from '../utils/syncAllowedModelDefault'
import { v4 as uuidv4 } from 'uuid'
import type { ILogStore } from '../logs/ILogStore'

function maskKey(key: string): string {
  if (!key || key.length <= 8) return '••••••••'
  return key.slice(0, 4) + '....' + key.slice(-4)
}

function createRouter(logStore: ILogStore): Router {
  const router = Router()

  // GET /api/ai-providers — admin only; strips api_key from list
  router.get('/', requireRole('admin'), async (_req: Request, res: Response): Promise<void> => {
    try {
      const providers = await AiProvider.findAll({ order: [['name', 'ASC']] })
      const providerIds = providers.map(p => p.id)
      const allowedModels = await AiProviderAllowedModel.findAll({
        where: { ai_provider_id: providerIds },
      })
      const modelsByProvider = new Map<string, string[]>()
      for (const row of allowedModels) {
        const list = modelsByProvider.get(row.ai_provider_id)
        if (list) list.push(row.model_id)
        else modelsByProvider.set(row.ai_provider_id, [row.model_id])
      }
      const data = providers.map(p => {
        const json = p.toJSON() as unknown as Record<string, unknown>
        json['has_api_key'] = typeof json['api_key'] === 'string' && !!(json['api_key'] as string)
        delete json['api_key']
        json['allowed_models'] = modelsByProvider.get(p.id) ?? []
        return json
      })
      res.json({ data })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // GET /api/ai-providers/:id — admin only; returns masked api_key for edit form
  router.get('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const provider = await AiProvider.findByPk(req.params['id'])
      if (!provider) { res.status(404).json({ error: 'Provider not found' }); return }
      const allowedModels = await AiProviderAllowedModel.findAll({
        where: { ai_provider_id: provider.id },
      })
      const json = provider.toJSON() as unknown as Record<string, unknown>
      json['allowed_models'] = allowedModels.map(m => m.model_id)
      if (typeof json['api_key'] === 'string' && json['api_key']) {
        try {
          const decrypted = providerKeyDecrypt(json['api_key'] as string)
          json['api_key'] = maskKey(decrypted)
        } catch { delete json['api_key'] }
      }
      res.json({ data: json })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/ai-providers — admin only
  router.post('/', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const { id, name, vendor, endpoint, api_key, notes, model, max_output_token, max_input_token, timeout_ms, provider, allow_fallbacks, data_collection } = req.body as {
        id?: string | null; name?: string; vendor?: string; endpoint?: string
        api_key?: string; notes?: string; model?: string; max_output_token?: number; max_input_token?: number; timeout_ms?: number
        provider?: string; allow_fallbacks?: boolean; data_collection?: string
      }
      const providerId = id || uuidv4()
      if (!name || !vendor || !endpoint) {
        res.status(400).json({ error: 'name, vendor, endpoint are required' })
        return
      }
      const newProvider = await AiProvider.create({
        id: providerId, name, vendor, endpoint,
        api_key: api_key ? providerKeyEncryptOnce(api_key) : undefined,
        notes, model, max_output_token, max_input_token,
        status: 'healthy',
        timeout_ms: timeout_ms ?? 30000,
        provider: typeof provider === 'string' ? provider : null,
        allow_fallbacks: typeof allow_fallbacks === 'boolean' ? allow_fallbacks : null,
        data_collection: typeof data_collection === 'string' ? data_collection : null,
        requests_24h: 0, errors_24h: 0, avg_latency_ms: 0,
      })
      if (model) {
        await syncAllowedModelDefault(providerId, model)
      }
      triggerGatewayReload()
      const json = newProvider.toJSON() as unknown as Record<string, unknown>
      delete json['api_key']
      res.status(201).json({ data: json })
    } catch (err: unknown) {
      const e = err as { name?: string }
      if (e.name === 'SequelizeUniqueConstraintError') {
        res.status(409).json({ error: 'Provider ID already exists' })
        return
      }
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // PATCH /api/ai-providers/:id — admin only
  router.patch('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const provider = await AiProvider.findByPk(req.params['id'])
      if (!provider) { res.status(404).json({ error: 'Provider not found' }); return }
      const allowedFields = ['name', 'vendor', 'endpoint', 'api_key', 'notes', 'model', 'max_output_token', 'max_input_token', 'timeout_ms', 'provider', 'allow_fallbacks', 'data_collection', 'status', 'meter_mode', 'meter_metric', 'meter_limit', 'meter_warning_limit', 'meter_enforcement', 'meter_reset_day', 'price_per_1m_input', 'price_per_1m_output', 'meter_period_start']
      const updates: Record<string, unknown> = {}
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) updates[field] = req.body[field]
      }
      if (typeof updates['api_key'] === 'string') {
        if (updates['api_key'] === '') {
          updates['api_key'] = null
        } else if (updates['api_key'].includes('....')) {
          delete updates['api_key']
        } else {
          updates['api_key'] = providerKeyEncryptOnce(updates['api_key'])
        }
      } else {
        delete updates['api_key']
      }
      await provider.update(updates)
      if (updates['model']) {
        await syncAllowedModelDefault(provider.id, updates['model'] as string)
      }
      triggerGatewayReload()
      const json = provider.toJSON() as unknown as Record<string, unknown>
      json['has_api_key'] = typeof json['api_key'] === 'string' && !!(json['api_key'] as string)
      delete json['api_key']
      res.json({ data: json })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // DELETE /api/ai-providers/:id — admin only, with safety check
  router.delete('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id']
      const provider = await AiProvider.findByPk(id)
      if (!provider) { res.status(404).json({ error: 'Provider not found' }); return }

      const link = await UpstreamProviderLink.findByPk(id)
      if (link) {
        res.status(409).json({ error: 'This provider is assigned as an upstream route. Unassign it from Upstream Providers first.' })
        return
      }

      const cfg = await getOrCreateConfig()
      if ([cfg.primary_id, cfg.backup1_id, cfg.backup2_id].includes(id)) {
        res.status(409).json({ error: 'This provider is in the classifier fallback chain. Remove it from the chain first.' })
        return
      }

      await provider.destroy()
      res.status(204).send()
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/ai-providers/:id/test — admin only; decrypts key before test
  router.post('/:id/test', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const provider = await AiProvider.findByPk(req.params['id'])
      if (!provider) { res.status(404).json({ error: 'Provider not found' }); return }
      if (provider.api_key) {
        try { provider.api_key = providerKeyDecrypt(provider.api_key) } catch { /* use as-is if decrypt fails */ }
      }
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
        endpoint:         provider.vendor === 'anthropic'
                            ? `${provider.endpoint}/messages`
                            : `${provider.endpoint}/chat/completions`,
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
      }).catch((e: unknown) => console.error('[provider-call-log] classifier test log failed:', e))
      res.json({ data: result })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/ai-providers/models/lookup — admin only; ad-hoc model lookup (no provider ID needed, for creation flow)
  router.post('/models/lookup', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const { endpoint, api_key, vendor } = req.body as { endpoint?: string; api_key?: string; vendor?: string }
      if (!endpoint) { res.status(400).json({ error: 'endpoint is required' }); return }
      if (!vendor) { res.status(400).json({ error: 'vendor is required' }); return }

      try {
        await validateEndpoint(endpoint)
      } catch (e: unknown) {
        res.status(502).json({ error: 'Failed to connect to provider endpoint' })
        return
      }

      const models = await fetchModels({ endpoint, apiKey: api_key, vendor }, 30000)
      res.json({ data: { models } })
    } catch (err: unknown) {
      const msg = (err as Error).message ?? 'Unknown error'
      console.error(`[models/lookup/ad-hoc]: ${msg}`)
      res.status(502).json({ error: 'Failed to fetch models from provider' })
    }
  })

  // GET /api/ai-providers/:id/models/lookup — admin only; fetch model list from upstream
  router.get('/:id/models/lookup', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const provider = await AiProvider.findByPk(req.params['id'])
      if (!provider) { res.status(404).json({ error: 'Provider not found' }); return }

      let apiKey = provider.api_key
      if (apiKey) {
        try { apiKey = providerKeyDecrypt(apiKey) } catch { /* use as-is if decrypt fails */ }
      }

      try {
        await validateEndpoint(provider.endpoint)
      } catch (e: unknown) {
        res.status(502).json({ error: 'Failed to connect to provider endpoint' })
        return
      }

      const timeout = provider.timeout_ms ?? 30000
      const models = await fetchModels(
        { endpoint: provider.endpoint, apiKey, vendor: provider.vendor },
        timeout,
      )

      res.json({ data: { models } })
    } catch (err: unknown) {
      const msg = (err as Error).message ?? 'Unknown error'
      console.error(`[models/lookup] ${req.params['id']}: ${msg}`)
      res.status(502).json({ error: 'Failed to fetch models from provider' })
    }
  })

  // PUT /api/ai-providers/:id/allowed-models — admin only; set allowed models + default
  router.put('/:id/allowed-models', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const provider = await AiProvider.findByPk(req.params['id'])
      if (!provider) { res.status(404).json({ error: 'Provider not found' }); return }

      const { models, default_model } = req.body as { models?: string[]; default_model?: string }
      if (!Array.isArray(models) || models.length === 0) {
        res.status(400).json({ error: 'models must be a non-empty array' })
        return
      }
      if (!default_model || !models.includes(default_model)) {
        res.status(400).json({ error: 'default_model must be one of the models in the array' })
        return
      }

      const seq = AiProviderAllowedModel.sequelize
      if (!seq) { res.status(500).json({ error: 'Internal server error' }); return }

      await seq.transaction(async (t) => {
        await AiProviderAllowedModel.destroy({
          where: { ai_provider_id: provider.id },
          transaction: t,
        })
        await AiProviderAllowedModel.bulkCreate(
          models.map(modelId => ({
            ai_provider_id: provider.id,
            model_id: modelId,
            is_default: modelId === default_model,
          })),
          { transaction: t },
        )
        await provider.update({ model: default_model }, { transaction: t })
      })

      triggerGatewayReload()
      res.json({ data: { models, default_model } })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  return router
}

export default createRouter
