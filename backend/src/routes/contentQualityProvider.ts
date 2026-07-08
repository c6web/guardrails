import type { Request, Response } from 'express';
import { Router } from 'express'
import { ContentQualityProviderConfig } from '../models/data-db/ContentQualityProviderConfig'
import { AiProvider } from '../models/data-db/AiProvider'
import { requireRole } from '../middleware/requireRole'
import { contentQualityServiceKeyEncrypt, contentQualityServiceKeyDecrypt, providerKeyDecrypt } from '../utils/gatewayKeyCrypto'
import { triggerGatewayReload, callGatewayControlWithBody } from '../utils/gatewayReload'
import type { ILogStore } from '../logs/ILogStore'

// Supported Content Quality Provider plugin vendors.
const VENDORS = [
  { value: 'trulens', label: 'TruLens' },
  { value: 'builtin', label: 'Built-in (lightweight LLM judge)' },
]

// Health-check path per vendor.
const HEALTH_PATHS: Record<string, string> = { trulens: '/health' }

export function createContentQualityProviderRouter(logStore: ILogStore): Router {
  const router = Router()

  // GET /api/content-quality-provider
  router.get('/', async (_req: Request, res: Response): Promise<void> => {
    try {
      let config = await ContentQualityProviderConfig.findByPk(1, {
        include: [{ model: AiProvider, as: 'provider', attributes: ['id', 'name', 'vendor', 'status'] }],
      })
      if (!config) {
        config = await ContentQualityProviderConfig.create({ id: 1, vendor: 'trulens', provider_id: null })
      }
      const data = config.toJSON() as any
      res.json({
        data: {
          id: data.id,
          vendor: data.vendor,
          service_url: data.service_url,
          timeout_ms: data.timeout_ms,
          provider_id: data.provider_id,
          provider: data.provider ?? null,
          has_service_api_key: !!data.service_api_key,
        },
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // GET /api/content-quality-provider/vendors
  router.get('/vendors', async (_req: Request, res: Response): Promise<void> => {
    res.json({ data: VENDORS })
  })

  // PUT /api/content-quality-provider
  router.put('/', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    try {
      const { vendor, service_url, service_api_key, timeout_ms, provider_id } = req.body as {
        vendor?: string
        service_url?: string | null
        service_api_key?: string | null
        timeout_ms?: number
        provider_id?: string | null
      }

      if (vendor !== undefined && !VENDORS.some(v => v.value === vendor)) {
        res.status(400).json({ error: `Unknown vendor "${vendor}". Must be one of: ${VENDORS.map(v => v.value).join(', ')}` })
        return
      }
      if (timeout_ms !== undefined && (typeof timeout_ms !== 'number' || timeout_ms < 1000 || timeout_ms > 600000)) {
        res.status(400).json({ error: 'timeout_ms must be between 1000 and 600000' }); return
      }
      if (provider_id) {
        const provider = await AiProvider.findByPk(provider_id)
        if (!provider) { res.status(404).json({ error: 'Judge LLM provider not found' }); return }
      }

      const existing = await ContentQualityProviderConfig.findByPk(1)
      const upsertFields: Record<string, unknown> = {
        id: 1,
        vendor: vendor ?? existing?.vendor ?? 'trulens',
        service_url: service_url !== undefined ? service_url : (existing?.service_url ?? null),
        timeout_ms: timeout_ms ?? existing?.timeout_ms ?? 120000,
        provider_id: provider_id !== undefined ? provider_id : (existing?.provider_id ?? null),
      }
      if (service_api_key !== undefined) {
        upsertFields['service_api_key'] = service_api_key ? contentQualityServiceKeyEncrypt(service_api_key) : null
      } else {
        upsertFields['service_api_key'] = existing?.service_api_key ?? null
      }

      const [config] = await ContentQualityProviderConfig.upsert(upsertFields as any)
      triggerGatewayReload().catch(() => {})
      const data = config.toJSON() as any
      let provider = null
      if (data.provider_id) {
        const p = await AiProvider.findByPk(data.provider_id, { attributes: ['id', 'name', 'vendor', 'status'] })
        if (p) provider = p.toJSON()
      }
      res.json({
        data: {
          id: data.id,
          vendor: data.vendor,
          service_url: data.service_url,
          timeout_ms: data.timeout_ms,
          provider_id: data.provider_id,
          provider,
          has_service_api_key: !!data.service_api_key,
        },
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/content-quality-provider/test — health-check the active plugin's service
  router.post('/test', requireRole('admin'), async (_req: Request, res: Response): Promise<void> => {
    try {
      const config = await ContentQualityProviderConfig.findByPk(1, {
        include: [{ model: AiProvider, as: 'provider', attributes: ['id', 'name', 'vendor', 'status'] }],
      })

      // Built-in: verify a healthy judge LLM provider is selected
      if (config?.vendor === 'builtin') {
        if (!config.provider) {
          res.status(400).json({ error: 'No judge LLM provider selected. Select one before testing the built-in judge.' })
          return
        }
        res.json({ data: { success: true, detail: `Built-in judge active: ${config.provider.name} (${config.provider.vendor})` } })
        return
      }

      if (!config?.service_url) {
        res.status(400).json({ error: 'No service URL configured. Set one before testing the connection.' })
        return
      }

      const healthPath = HEALTH_PATHS[config.vendor] ?? '/health'
      const url = `${config.service_url.replace(/\/+$/, '')}${healthPath}`
      const headers: Record<string, string> = {}
      if (config.service_api_key) {
        headers['authorization'] = `Bearer ${contentQualityServiceKeyDecrypt(config.service_api_key)}`
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), Math.min(config.timeout_ms || 10000, 15000))
      try {
        const response = await fetch(url, { headers, signal: controller.signal })
        clearTimeout(timeout)
        if (!response.ok) {
          res.status(502).json({ data: { success: false, error: `Service returned HTTP ${response.status}` } })
          return
        }
        res.json({ data: { success: true } })
      } catch (fetchErr) {
        clearTimeout(timeout)
        res.status(502).json({ data: { success: false, error: (fetchErr as Error).message || 'Connection failed' } })
      }
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/content-quality-provider/evaluate-test — send a real evaluate call to the
  // active Content Quality Provider's service and return the scores.
  router.post('/evaluate-test', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
    const callStart = Date.now()
    try {
      const { context, response: responseText } = req.body as { context?: string; response?: string }
      if (!context || !responseText) {
        res.status(400).json({ error: 'context and response are required' })
        return
      }

      const config = await ContentQualityProviderConfig.findByPk(1, {
        include: [{ model: AiProvider, as: 'provider', attributes: ['id', 'name', 'vendor', 'endpoint', 'model', 'api_key', 'timeout_ms', 'max_output_token'] }],
      })
      if (!config) {
        res.status(400).json({ error: 'No content quality provider configured. Configure one first.' })
        return
      }
      if (!config.provider) {
        res.status(400).json({ error: 'No judge LLM provider selected. Select one first.' })
        return
      }

      // ── Builtin: route through the gateway control endpoint ───────────────
      if (config.vendor === 'builtin') {
        const gwResult = await callGatewayControlWithBody('/content-quality/evaluate-test', { context, response: responseText })
        if (!gwResult.ok) {
          const errMsg = gwResult.detail || 'Gateway call failed'
          await logStore.insertAiProviderCallLog({
            call_type: 'content_quality',
            source: 'test',
            provider_id: config.provider.id,
            provider_name: config.provider.name,
            vendor: 'builtin',
            model: config.provider.model ?? null,
            endpoint: 'gateway:/content-quality/evaluate-test',
            request_payload: JSON.stringify({ context, response: responseText }),
            response_payload: null,
            duration_ms: Date.now() - callStart,
            status_code: gwResult.status ?? 502,
            success: false,
            error_message: errMsg,
          }).catch(() => {})
          res.status(502).json({ error: errMsg })
          return
        }

        let gwBody: Record<string, unknown>
        try { gwBody = JSON.parse(gwResult.body ?? '{}') } catch { gwBody = {} }

        const durationMs = Date.now() - callStart
        await logStore.insertAiProviderCallLog({
          call_type: 'content_quality',
          source: 'test',
          provider_id: config.provider.id,
          provider_name: config.provider.name,
          vendor: 'builtin',
          model: config.provider.model ?? null,
          endpoint: 'gateway:/content-quality/evaluate-test',
          request_payload: JSON.stringify({ context, response: responseText }),
          response_payload: JSON.stringify(gwBody),
          duration_ms: durationMs,
          status_code: 200,
          success: true,
        }).catch(() => {})
        res.json({
          data: {
            groundedness: gwBody.groundedness ?? null,
            relevance: gwBody.relevance ?? null,
            hallucination: gwBody.hallucination ?? null,
            reason: gwBody.reason ?? null,
            duration_ms: gwBody.duration_ms ?? null,
          },
        })
        return
      }

      // ── Sidecar (TruLens, etc.): POST to the vendor service ──────────────
      if (!config.service_url) {
        res.status(400).json({ error: 'No service URL configured. Configure the provider first.' })
        return
      }

      let apiKey: string | null = null
      if (config.provider.api_key) {
        try { apiKey = providerKeyDecrypt(config.provider.api_key) } catch { apiKey = config.provider.api_key }
      }

      const evaluatePayload = {
        context,
        response: responseText,
        metrics: ['groundedness', 'relevance', 'hallucination'],
        judge_provider: {
          vendor: config.provider.vendor,
          endpoint: config.provider.endpoint,
          model: config.provider.model ?? 'default',
          api_key: apiKey ?? '',
        },
      }

      const url = `${config.service_url.replace(/\/+$/, '')}/evaluate`
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (config.service_api_key) {
        headers['authorization'] = `Bearer ${contentQualityServiceKeyDecrypt(config.service_api_key)}`
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), Math.min(Math.max(config.timeout_ms || 120000, 5000), 600000))
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(evaluatePayload),
          signal: controller.signal,
        })
        clearTimeout(timeout)
        const durationMs = Date.now() - callStart
        const body = await response.json() as Record<string, unknown>
        if (!response.ok) {
          await logStore.insertAiProviderCallLog({
            call_type: 'content_quality',
            source: 'test',
            provider_id: config.provider.id,
            provider_name: config.provider.name,
            vendor: config.provider.vendor,
            model: config.provider.model ?? null,
            endpoint: url,
            request_payload: JSON.stringify(evaluatePayload),
            response_payload: JSON.stringify(body),
            duration_ms: durationMs,
            status_code: response.status,
            success: false,
            error_message: body.detail ? String(body.detail) : `HTTP ${response.status}`,
          }).catch(() => {})
          res.status(502).json({ error: body.detail ? String(body.detail) : `Service returned HTTP ${response.status}` })
          return
        }
        await logStore.insertAiProviderCallLog({
          call_type: 'content_quality',
          source: 'test',
          provider_id: config.provider.id,
          provider_name: config.provider.name,
          vendor: config.provider.vendor,
          model: config.provider.model ?? null,
          endpoint: url,
          request_payload: JSON.stringify(evaluatePayload),
          response_payload: JSON.stringify(body),
          duration_ms: durationMs,
          status_code: response.status,
          success: true,
        }).catch(() => {})
        res.json({
          data: {
            groundedness: body.groundedness ?? null,
            relevance: body.relevance ?? null,
            hallucination: body.hallucination ?? null,
            reason: body.reason ?? null,
            duration_ms: body.duration_ms ?? null,
          },
        })
      } catch (fetchErr) {
        clearTimeout(timeout)
        const durationMs = Date.now() - callStart
        const errMsg = (fetchErr as Error).message || 'Connection failed'
        await logStore.insertAiProviderCallLog({
          call_type: 'content_quality',
          source: 'test',
          provider_id: config?.provider?.id ?? null,
          provider_name: config?.provider?.name ?? null,
          vendor: config?.provider?.vendor ?? null,
          model: config?.provider?.model ?? null,
          endpoint: url,
          request_payload: JSON.stringify(evaluatePayload),
          response_payload: null,
          duration_ms: durationMs,
          success: false,
          error_message: errMsg,
        }).catch(() => {})
        res.status(502).json({ error: errMsg })
      }
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  return router
}
