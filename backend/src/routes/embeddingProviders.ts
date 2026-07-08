import type { Request, Response } from 'express';
import { Router } from 'express'
import { EmbeddingProvider } from '../models/data-db/EmbeddingProvider'
import { getOrCreateConfig } from '../models/data-db/EmbeddingProviderConfig'
import { isAdmin, requireAuth } from '../middleware/auth'
import { testEmbeddingProvider } from '../utils/embedding'
import { providerKeyEncryptOnce, providerKeyDecrypt } from '../utils/gatewayKeyCrypto'
import { v4 as uuidv4 } from 'uuid'
import type { ILogStore } from '../logs/ILogStore'
import { triggerGatewayReload } from '../utils/gatewayReload'

function maskKey(key: string): string {
  if (!key || key.length <= 8) return '••••••••'
  return key.slice(0, 4) + '....' + key.slice(-4)
}

export function createEmbeddingProvidersRouter(logStore: ILogStore): Router {
const router = Router()

// GET /api/embedding-providers — admin only
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Admin access required' }); return }
    const rows = await EmbeddingProvider.findAll({
      order: [['name', 'ASC']],
    })
    const safeRows = rows.map(r => {
      const json = r.toJSON() as unknown as Record<string, unknown>
      json['has_api_key'] = typeof json['api_key'] === 'string' && !!(json['api_key'] as string)
      delete json['api_key']
      return json
    })
    res.json({ data: safeRows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/embedding-providers/:id — admin only; returns masked api_key for edit form
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Admin access required' }); return }
    const provider = await EmbeddingProvider.findByPk(req.params['id'])
    if (!provider) { res.status(404).json({ error: 'Not found' }); return }
    const json = provider.toJSON() as unknown as Record<string, unknown>
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

// POST /api/embedding-providers — admin only
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Admin access required' }); return }

    const body = req.body as Record<string, unknown>
    const id = typeof body.id === 'string' ? body.id : undefined
    const name = typeof body.name === 'string' ? body.name : ''
    const vendor = typeof body.vendor === 'string' ? body.vendor : ''
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
    const api_key = typeof body.api_key === 'string' ? body.api_key : null
    const model = typeof body.model === 'string' ? body.model : null
    const dimensions = typeof body.dimensions === 'number' ? body.dimensions : null
    const timeout_ms = typeof body.timeout_ms === 'number' ? body.timeout_ms : 30000
    const notes = typeof body.notes === 'string' ? body.notes : null
    const provider = typeof body.provider === 'string' ? body.provider : null
    const allow_fallbacks = typeof body.allow_fallbacks === 'boolean' ? body.allow_fallbacks : null
    const data_collection = typeof body.data_collection === 'string' ? body.data_collection : null

    const providerId = id || uuidv4()
    if (!name) {
      res.status(400).json({ error: 'name is required' }); return
    }
    if (!vendor) {
      res.status(400).json({ error: 'vendor is required' }); return
    }
    if (!endpoint) {
      res.status(400).json({ error: 'endpoint is required' }); return
    }

    // Check for duplicate ID
    const existing = await EmbeddingProvider.findByPk(providerId)
    if (existing) { res.status(409).json({ error: 'Provider with this ID already exists' }); return }

    const newProvider = await EmbeddingProvider.create({
      id:              providerId,
      name:            name.trim(),
      vendor:          vendor.trim(),
      endpoint:        endpoint.trim(),
      api_key:         api_key ? providerKeyEncryptOnce(api_key) : null,
      model:           typeof model === 'string' ? model : null,
      dimensions:      typeof dimensions === 'number' ? dimensions : null,
      timeout_ms:      timeout_ms,
      notes:           typeof notes === 'string' ? notes : null,
      provider:        typeof provider === 'string' ? provider : null,
      allow_fallbacks: typeof allow_fallbacks === 'boolean' ? allow_fallbacks : null,
      data_collection: typeof data_collection === 'string' ? data_collection : null,
    } as any)
    const json = newProvider.toJSON() as unknown as Record<string, unknown>
    delete json['api_key']
    res.status(201).json({ data: json })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/embedding-providers/:id — admin only
router.patch('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Admin access required' }); return }

    const provider = await EmbeddingProvider.findByPk(req.params['id'])
    if (!provider) { res.status(404).json({ error: 'Not found' }); return }

    const ALLOWED_FIELDS = ['name', 'vendor', 'api_key', 'endpoint', 'model', 'dimensions', 'config'] as const
    const body: Record<string, unknown> = {}
    for (const key of ALLOWED_FIELDS) {
      if ((req.body as Record<string, unknown>)[key] !== undefined) {
        body[key] = (req.body as Record<string, unknown>)[key]
      }
    }

    // Sanitize dimensions — must be a positive integer to prevent type coercion bugs
    if (body.dimensions !== undefined && body.dimensions !== null) {
      const d = parseInt(String(body.dimensions), 10)
      body.dimensions = d > 0 ? d : null
    }

    if (typeof body['api_key'] === 'string') {
      if (body['api_key'] === '') {
        body['api_key'] = null
      } else if (body['api_key'].includes('....')) {
        delete body['api_key']
      } else {
        body['api_key'] = providerKeyEncryptOnce(body['api_key'])
      }
    } else {
      delete body['api_key']
    }

    await provider.update(body)
    const json = provider.toJSON() as unknown as Record<string, unknown>
    json['has_api_key'] = typeof json['api_key'] === 'string' && !!(json['api_key'] as string)
    delete json['api_key']
    res.json({ data: json })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/embedding-providers/:id — admin only
router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Admin access required' }); return }

    const provider = await EmbeddingProvider.findByPk(req.params['id'])
    if (!provider) { res.status(404).json({ error: 'Not found' }); return }

    await provider.destroy()
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/embedding-providers/:id/test — requires auth + admin
router.post('/:id/test', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Admin access required' }); return }

    const provider = await EmbeddingProvider.findByPk(req.params['id'])
    if (!provider) { res.status(404).json({ error: 'Not found' }); return }

    if (provider.api_key) {
      try { provider.api_key = providerKeyDecrypt(provider.api_key) } catch { /* use as-is if decrypt fails */ }
    }

    const { text } = req.body as { text?: string }
    const testText = (text as string | undefined)?.trim() || 'Test embedding.'

    const result = await testEmbeddingProvider(provider, testText, provider.timeout_ms || 20000)

    await logStore.insertEmbeddingLog({
      provider_id:   (provider as any).id,
      provider_name: (provider as any).name,
      model:         (provider as any).model || null,
      input_chars:   testText.length,
      dimensions:    result.dimensions ?? null,
      success:       result.success,
      error_message: result.error ?? null,
      duration_ms:   result.latency_ms,
      source:        'test',
    })

    res.json({ data: result })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/embedding-providers/config/fallback-chain — admin only
router.get('/config/fallback-chain', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Admin access required' }); return }

    const config = await getOrCreateConfig()
    const providers = await Promise.all([
      config.primary_id ? EmbeddingProvider.findByPk(config.primary_id) : null,
      config.backup1_id ? EmbeddingProvider.findByPk(config.backup1_id) : null,
      config.backup2_id ? EmbeddingProvider.findByPk(config.backup2_id) : null,
    ])

    res.json({
      data: {
        primary_id: config.primary_id,
        primary: providers[0],
        backup1_id: config.backup1_id,
        backup1: providers[1],
        backup2_id: config.backup2_id,
        backup2: providers[2],
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/embedding-providers/config/fallback-chain — admin only
router.patch('/config/fallback-chain', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Admin access required' }); return }

    const { primary_id, backup1_id, backup2_id } = req.body as Record<string, unknown>

    const config = await getOrCreateConfig()
    await config.update({
      primary_id: typeof primary_id === 'string' ? primary_id : null,
      backup1_id: typeof backup1_id === 'string' ? backup1_id : null,
      backup2_id: typeof backup2_id === 'string' ? backup2_id : null,
    })

    triggerGatewayReload().catch(() => {})

    const providers = await Promise.all([
      config.primary_id ? EmbeddingProvider.findByPk(config.primary_id) : null,
      config.backup1_id ? EmbeddingProvider.findByPk(config.backup1_id) : null,
      config.backup2_id ? EmbeddingProvider.findByPk(config.backup2_id) : null,
    ])

    res.json({
      data: {
        primary_id: config.primary_id,
        primary: providers[0],
        backup1_id: config.backup1_id,
        backup1: providers[1],
        backup2_id: config.backup2_id,
        backup2: providers[2],
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

  return router
}
