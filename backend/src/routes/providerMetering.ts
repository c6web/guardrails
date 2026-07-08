import type { Request, Response } from 'express';
import { Router } from 'express'
import { AiProvider } from '../models/data-db/AiProvider'
import { logAudit } from '../utils/auditLog'
import { triggerGatewayReload } from '../utils/gatewayReload'
import { resolveMeter, meterPeriodStart, meterPeriodEnd } from '../utils/providerMeter'
import { sequelizeLogsDb } from '../config/database'

const GROUP_IDS = {
  admin:  '00000000-0000-0000-0000-000000000001',
  viewer: '00000000-0000-0000-0000-000000000002',
} as const

function estCost(tokensIn: number, tokensOut: number, priceIn: number | null | undefined, priceOut: number | null | undefined): number {
  return (tokensIn / 1_000_000) * (priceIn ?? 0) + (tokensOut / 1_000_000) * (priceOut ?? 0)
}

function usageState(used: number, limit: number | null, warning: number | null): 'ok' | 'warning' | 'exceeded' {
  if (limit !== null && used >= limit) return 'exceeded'
  if (warning !== null && used >= warning) return 'warning'
  return 'ok'
}

export function createProviderMeteringRouter(): Router {
  const router = Router()

  // GET /api/providers/metering/summary — current-month totals per provider (admin/viewer)
  router.get('/metering/summary', async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
      const gid = req.user.groupId
      if (gid !== GROUP_IDS.admin && gid !== GROUP_IDS.viewer) {
        res.status(403).json({ error: 'Insufficient permissions' }); return
      }

      const providers = await AiProvider.findAll()
      const now = new Date()

      // Build per-provider month windows
      const windows = providers
        .filter(p => p.meter_mode === 'monthly' && p.meter_reset_day !== null)
        .map(p => ({
          id:    p.id,
          start: meterPeriodStart(p.meter_reset_day!, p.meter_period_start ?? null, now),
        }))

      // Aggregate usage per provider from the durable rollup for all month windows
      type RollupRow = { provider_id: string; requests: string; errors: string; tokens_in: string; tokens_out: string }
      const usageByProvider: Record<string, { requests: number; tokens_in: number; tokens_out: number; errors: number }> = {}

      for (const w of windows) {
        const [rows] = await sequelizeLogsDb.query(
          `SELECT provider_id,
                  sum(requests)  AS requests,
                  sum(errors)    AS errors,
                  sum(tokens_in) AS tokens_in,
                  sum(tokens_out) AS tokens_out
           FROM provider_usage_daily
           WHERE provider_id = :pid AND day >= :start
           GROUP BY provider_id`,
          { replacements: { pid: w.id, start: w.start.toISOString().slice(0, 10) }, raw: true }
        ) as [RollupRow[], unknown]
        if (rows[0]) {
          usageByProvider[w.id] = {
            requests:   Number(rows[0].requests),
            errors:     Number(rows[0].errors),
            tokens_in:  Number(rows[0].tokens_in),
            tokens_out: Number(rows[0].tokens_out),
          }
        }
      }

      const data = providers.map(p => {
        const usage = usageByProvider[p.id] ?? { requests: 0, errors: 0, tokens_in: 0, tokens_out: 0 }
        const used = p.meter_metric === 'tokens'
          ? usage.tokens_in + usage.tokens_out
          : p.meter_metric === 'cost'
            ? estCost(usage.tokens_in, usage.tokens_out, p.price_per_1m_input, p.price_per_1m_output)
            : usage.requests

        const start = p.meter_mode === 'monthly' && p.meter_reset_day
          ? meterPeriodStart(p.meter_reset_day, p.meter_period_start ?? null, now)
          : null
        const end = start && p.meter_reset_day ? meterPeriodEnd(p.meter_reset_day, start) : null

        return {
          id:   p.id,
          name: p.name,
          vendor: p.vendor,
          config: {
            mode:        p.meter_mode,
            metric:      p.meter_metric,
            limit:       p.meter_limit !== null ? Number(p.meter_limit) : null,
            warning:     p.meter_warning_limit !== null ? Number(p.meter_warning_limit) : null,
            enforcement: p.meter_enforcement,
            reset_day:   p.meter_reset_day ?? null,
            price_per_1m_input:  p.price_per_1m_input  !== null ? Number(p.price_per_1m_input)  : null,
            price_per_1m_output: p.price_per_1m_output !== null ? Number(p.price_per_1m_output) : null,
          },
          usage: {
            requests:   usage.requests,
            errors:     usage.errors,
            tokens_in:  usage.tokens_in,
            tokens_out: usage.tokens_out,
            est_cost:   estCost(usage.tokens_in, usage.tokens_out, p.price_per_1m_input, p.price_per_1m_output),
            used,
            percent:    p.meter_limit ? Math.min(100, Math.round((used / Number(p.meter_limit)) * 100)) : 0,
            state:      p.meter_mode === 'unlimited' ? 'ok' : usageState(used, p.meter_limit !== null ? Number(p.meter_limit) : null, p.meter_warning_limit !== null ? Number(p.meter_warning_limit) : null),
            period_start: start?.toISOString() ?? null,
            period_end:   end?.toISOString() ?? null,
          },
        }
      })

      res.json({ data })
    } catch (err) {
      console.error('[providerMetering] summary error:', err)
      res.status(500).json({ error: 'Failed to compute metering summary' })
    }
  })

  // GET /api/providers/:id/metering/daily?from=&to= — daily series for chart
  router.get('/:id/metering/daily', async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
      const gid = req.user.groupId
      if (gid !== GROUP_IDS.admin && gid !== GROUP_IDS.viewer) {
        res.status(403).json({ error: 'Insufficient permissions' }); return
      }

      const provider = await AiProvider.findByPk(req.params['id'])
      if (!provider) { res.status(404).json({ error: 'Provider not found' }); return }

      const now = new Date()
      const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const from = req.query['from'] ? new Date(req.query['from'] as string) : defaultFrom
      const to   = req.query['to']   ? new Date(req.query['to']   as string) : now

      type DailyRow = { call_type: string; day: string; requests: string; errors: string; tokens_in: string; tokens_out: string }
      const [rows] = await sequelizeLogsDb.query(
        `SELECT call_type, day::text, sum(requests) AS requests, sum(errors) AS errors,
                sum(tokens_in) AS tokens_in, sum(tokens_out) AS tokens_out
         FROM provider_usage_daily
         WHERE provider_id = :pid
           AND day >= :from
           AND day <= :to
         GROUP BY call_type, day
         ORDER BY day ASC`,
        {
          replacements: { pid: provider.id, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
          raw: true,
        }
      ) as [DailyRow[], unknown]

      const data = rows.map(r => ({
        day:        r.day,
        call_type:  r.call_type,
        requests:   Number(r.requests),
        errors:     Number(r.errors),
        tokens_in:  Number(r.tokens_in),
        tokens_out: Number(r.tokens_out),
        est_cost:   estCost(Number(r.tokens_in), Number(r.tokens_out), provider.price_per_1m_input, provider.price_per_1m_output),
      }))

      res.json({ data })
    } catch (err) {
      console.error('[providerMetering] daily error:', err)
      res.status(500).json({ error: 'Failed to fetch daily usage' })
    }
  })

  // PATCH /api/providers/:id/metering — set meter config + pricing (admin)
  router.patch('/:id/metering', async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
      if (req.user.groupId !== GROUP_IDS.admin) { res.status(403).json({ error: 'Admin only' }); return }

      const provider = await AiProvider.findByPk(req.params['id'])
      if (!provider) { res.status(404).json({ error: 'Provider not found' }); return }

      const current = {
        meter_mode:          provider.meter_mode,
        meter_metric:        provider.meter_metric,
        meter_limit:         provider.meter_limit !== null ? Number(provider.meter_limit) : null,
        meter_warning_limit: provider.meter_warning_limit !== null ? Number(provider.meter_warning_limit) : null,
        meter_enforcement:   provider.meter_enforcement,
        meter_reset_day:     provider.meter_reset_day ?? null,
        price_per_1m_input:  provider.price_per_1m_input  !== null ? Number(provider.price_per_1m_input)  : null,
        price_per_1m_output: provider.price_per_1m_output !== null ? Number(provider.price_per_1m_output) : null,
      }

      const result = resolveMeter(req.body, current)
      if ('error' in result) { res.status(400).json({ error: result.error }); return }

      await provider.update(result.fields)
      await logAudit(req, 'provider.metering.update', 'ai_provider', provider.id, { name: provider.name, ...result.fields })
      await triggerGatewayReload()

      res.json({ success: true, config: result.fields })
    } catch (err) {
      console.error('[providerMetering] patch error:', err)
      res.status(500).json({ error: 'Failed to update metering config' })
    }
  })

  // POST /api/providers/:id/metering/reset — reset meter period (admin)
  router.post('/:id/metering/reset', async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
      if (req.user.groupId !== GROUP_IDS.admin) { res.status(403).json({ error: 'Admin only' }); return }

      const provider = await AiProvider.findByPk(req.params['id'])
      if (!provider) { res.status(404).json({ error: 'Provider not found' }); return }

      await provider.update({ meter_period_start: new Date() })
      await logAudit(req, 'provider.metering.reset', 'ai_provider', provider.id, { name: provider.name })
      await triggerGatewayReload()

      res.json({ success: true })
    } catch (err) {
      console.error('[providerMetering] reset error:', err)
      res.status(500).json({ error: 'Failed to reset meter period' })
    }
  })

  return router
}
