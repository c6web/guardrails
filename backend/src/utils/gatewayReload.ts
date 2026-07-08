import { Op } from 'sequelize'
import { GatewayInstance } from '../models/data-db/GatewayInstance'
import { GatewayApiKey } from '../models/data-db/GatewayApiKey'
import { ReloadLog } from '../models/logs-db/ReloadLog'
import { gatewayDecrypt } from './gatewayKeyCrypto'
import type { EndpointInfo } from './validateEndpoint'
import { validateEndpoint, buildPinnedUrl } from './validateEndpoint'

export interface ReloadResult {
  ok: boolean
  status?: number
  keyPrefix?: string
  detail?: string
  body?: string
}

/**
 * POST to a gateway control endpoint (e.g. /reload, /cache/flush), trying every
 * currently-valid control key (active + in-grace superseded), newest first.
 *
 * Right after a rotation the newest key is not yet in the gateway's in-memory cache, so it
 * returns 401 — we then fall back to the still-cached grace key, which the gateway accepts.
 */
async function callGatewayControlEndpoint(
  instance: GatewayInstance,
  path: string,
  body?: unknown
): Promise<ReloadResult> {
  const validKeys = await GatewayApiKey.findAll({
    where: {
      gateway_id: instance.id,
      [Op.or]: [
        { status: 'active' },
        { status: 'superseded', grace_expires_at: { [Op.gt]: new Date() } },
      ],
    },
    order: [['version', 'DESC']],
  })

  if (validKeys.length === 0) {
    return { ok: false, detail: 'no-active-key' }
  }

  let endpointInfo: EndpointInfo
  try {
    endpointInfo = await validateEndpoint(`${(instance as any).url}${path}`)
  } catch (e) {
    return { ok: false, detail: (e as Error).message }
  }
  const pinned = buildPinnedUrl(endpointInfo)
  const url = pinned.url
  const extraHeaders = pinned.headers
  let lastAuthStatus = 401

  for (const key of validKeys) {
    let rawKey: string
    try {
      rawKey = gatewayDecrypt(key.key_encrypted)
    } catch {
      continue
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${rawKey}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...extraHeaders,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(path === '/content-quality/evaluate-test' ? 120000 : 8000),
      })

      if (res.ok) {
        const body = await res.text().catch(() => undefined)
        return { ok: true, status: res.status, keyPrefix: key.key_prefix, body }
      }
      if (res.status === 401 || res.status === 403) {
        // Key not (yet) known to the gateway — try the next candidate
        lastAuthStatus = res.status
        continue
      }
      // Healthy gateway rejecting for a non-auth reason (e.g. 429, 5xx) — stop here
      return { ok: false, status: res.status, keyPrefix: key.key_prefix }
    } catch (e) {
      // Network error / timeout — all keys would fail the same way
      return { ok: false, detail: (e as Error).message }
    }
  }

  return { ok: false, status: lastAuthStatus, detail: 'unauthorized' }
}

export async function reloadGatewayInstance(instance: GatewayInstance): Promise<ReloadResult> {
  return callGatewayControlEndpoint(instance, '/reload')
}

export async function triggerGatewayReload(): Promise<void> {
  const startTime = Date.now()
  try {
    const instances = await GatewayInstance.findAll()

    if (instances.length === 0) {
      console.warn('[gatewayReload] no gateway instances registered — reload deferred to poll')
      try {
        await ReloadLog.create({
          triggered_by: 'backend',
          key_prefix: '',
          gateway_instance_id: null,
          source_ip: 'internal',
          result: 'skipped',
          error_message: 'no-gateway-instances',
          duration_ms: Date.now() - startTime,
        })
      } catch { /* non-blocking */ }
      return
    }

    await Promise.allSettled(
      instances.map(async (gw) => {
        const gwStart = Date.now()
        const result = await reloadGatewayInstance(gw)
        const duration = Date.now() - gwStart
        const gwId = String(gw.get('id') ?? '')

        if (result.ok) {
          console.log(`[gatewayReload] ${gw.get('name')} reloaded OK (key ${result.keyPrefix})`)
          try {
            await ReloadLog.create({
              triggered_by: 'backend',
              key_prefix: result.keyPrefix ?? '',
              gateway_instance_id: gwId,
              source_ip: 'internal',
              result: 'success',
              error_message: null,
              duration_ms: duration,
            })
          } catch { /* non-blocking */ }
        } else if (result.detail === 'no-active-key') {
          console.warn(`[gatewayReload] ${gw.get('name')} has no active key — skipping reload`)
          try {
            await ReloadLog.create({
              triggered_by: 'backend',
              key_prefix: '',
              gateway_instance_id: gwId,
              source_ip: 'internal',
              result: 'skipped',
              error_message: 'no-active-key',
              duration_ms: duration,
            })
          } catch { /* non-blocking */ }
        } else {
          console.warn(`[gatewayReload] ${gw.get('name')} reload failed: ${result.status ?? result.detail}`)
          try {
            await ReloadLog.create({
              triggered_by: 'backend',
              key_prefix: result.keyPrefix ?? '',
              gateway_instance_id: gwId,
              source_ip: 'internal',
              result: 'failed',
              error_message: String(result.status ?? result.detail ?? 'unknown'),
              duration_ms: duration,
            })
          } catch { /* non-blocking */ }
        }
      })
    )
  } catch (e) {
    console.warn('[gatewayReload] failed to query gateway instances:', e)
  }
}

export interface CacheFlushSummary {
  ok: boolean
  gatewaysFlushed: number
  gatewaysFailed: number
}

/**
 * Call any gateway control endpoint with a JSON body payload, iterating over
 * all registered gateway instances until one succeeds. Returns the full
 * ReloadResult including the response body.
 */
export async function callGatewayControlWithBody(
  path: string,
  body?: Record<string, unknown>
): Promise<ReloadResult> {
  const instances = await GatewayInstance.findAll()
  if (instances.length === 0) {
    return { ok: false, detail: 'no-gateway-instances' }
  }
  for (const gw of instances) {
    const result = await callGatewayControlEndpoint(gw, path, body)
    if (result.ok) return result
  }
  return { ok: false, detail: 'all-gateways-failed' }
}

/**
 * Force-expire the response cache on every registered gateway instance (both the
 * in-memory L1 cache and the L2 Postgres rows), optionally scoped to one app.
 */
export async function triggerGatewayCacheFlush(appId?: string): Promise<CacheFlushSummary> {
  const instances = await GatewayInstance.findAll()
  let gatewaysFlushed = 0
  let gatewaysFailed = 0

  await Promise.allSettled(
    instances.map(async (gw) => {
      const result = await callGatewayControlEndpoint(gw, '/cache/flush', appId ? { app_id: appId } : {})
      if (result.ok) {
        gatewaysFlushed += 1
        console.log(`[gatewayReload] ${gw.get('name')} cache flushed OK (key ${result.keyPrefix})`)
      } else {
        gatewaysFailed += 1
        if (result.detail === 'no-active-key') {
          console.warn(`[gatewayReload] ${gw.get('name')} has no active key — skipping cache flush`)
        } else {
          console.warn(`[gatewayReload] ${gw.get('name')} cache flush failed: ${result.status ?? result.detail}`)
        }
      }
    })
  )

  return { ok: gatewaysFailed === 0 && gatewaysFlushed > 0, gatewaysFlushed, gatewaysFailed }
}
