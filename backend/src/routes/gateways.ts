import type { Request, Response } from 'express'
import { Router } from 'express'
import { Op } from 'sequelize'
import crypto from 'crypto'
import { GatewayInstance } from '../models/data-db/GatewayInstance'
import { GatewayApiKey } from '../models/data-db/GatewayApiKey'
import { NetworkAclList } from '../models/data-db/NetworkAclList'
import { NetworkAclEntry } from '../models/data-db/NetworkAclEntry'
import { AdminActivityLog } from '../models/logs-db/AdminActivityLog'
import { requireAuth } from '../middleware/auth'
import { requireRole } from '../middleware/requireRole'
import { logAudit } from '../utils/auditLog'
import { gatewayEncrypt, gatewayDecrypt, sha256 } from '../utils/gatewayKeyCrypto'
import { reloadGatewayInstance } from '../utils/gatewayReload'
import { env } from '../config/env'
import { isTrustedProxy, validateEndpoint, buildPinnedUrl } from '../utils/validateEndpoint'

const router = Router()

function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for']
  const peer = req.socket?.remoteAddress ?? req.ip
  if (typeof fwd === 'string' && env.TRUSTED_PROXY_DEPTH > 0 && isTrustedProxy(peer, env.TRUSTED_PROXY_CIDR)) {
    return fwd.split(',')[0].trim()
  }
  return peer ?? '0.0.0.0'
}

async function logAdmin(
  req: Request, action: string, targetId: string,
  before?: object | null, after?: object | null,
) {
  if (!req.user) return
  try {
    await AdminActivityLog.create({
      admin_id: req.user.userId, admin_email: req.user.email,
      action, target_type: 'gateway_instance', target_id: targetId,
      before_state: before ?? null, after_state: after ?? null,
      ip_address: clientIp(req),
    })
  } catch { /* non-blocking */ }
}

async function formatGatewayWithAcl(instance: GatewayInstance) {
  const data = instance.toJSON() as unknown as Record<string, unknown>

  // Enrich with active key metadata — never return raw/encrypted key material
  const activeKey = await GatewayApiKey.findOne({
    where: { gateway_id: instance.id, status: 'active' },
    order: [['version', 'DESC']],
  })
  data['has_active_key'] = !!activeKey
  data['active_key_prefix'] = activeKey?.key_prefix ?? null
  data['active_key_version'] = activeKey?.version ?? null

  if (instance.acl_list_id) {
    const aclList = await NetworkAclList.findByPk(instance.acl_list_id)
    if (aclList) {
      const entryCount = await NetworkAclEntry.count({ where: { list_id: instance.acl_list_id } })
      return {
        ...data,
        acl_list: {
          id: aclList.id,
          name: aclList.name,
          description: aclList.description,
          list_type: aclList.list_type,
          entry_count: entryCount,
        },
      }
    }
  }
  return { ...data, acl_list: null }
}

// GET /api/gateways
router.get('/', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const instances = await GatewayInstance.findAll({ order: [['name', 'ASC']] })
    const withAcl = await Promise.all(instances.map(formatGatewayWithAcl))
    res.json({ data: withAcl })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/gateways/health
router.get('/health', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const instances = await GatewayInstance.findAll({ order: [['name', 'ASC']] })
    if (instances.length === 0) {
      res.json({ healthy: true, total: 0, up: 0, down: 0, instances: [] })
      return
    }

    const results = await Promise.allSettled(
      instances.map(async (inst) => {
        try {
          const info = await validateEndpoint(`${inst.url}/health`).catch(() => null)
          if (!info) return { id: inst.id, name: inst.name, status: 'down', latency_ms: 0 }
          const pinned = buildPinnedUrl(info)
          const resp = await fetch(pinned.url, { signal: AbortSignal.timeout(3000), headers: pinned.headers })
          return { id: inst.id, name: inst.name, status: resp.ok ? 'up' : 'down', latency_ms: 0 }
        } catch {
          return { id: inst.id, name: inst.name, status: 'down', latency_ms: 0 }
        }
      })
    )

    const checked = results.map((r, i) => ({
      ...instances[i].dataValues,
      status: r.status === 'fulfilled' ? (r.value as { status: string }).status : 'down',
      id: instances[i].id,
      name: instances[i].name,
    }))

    const up = checked.filter(c => c.status === 'up').length
    const down = instances.length - up
    const healthy = down === 0 && instances.length > 0
    const partial = !healthy && up > 0

    res.json({
      healthy, partial, total: instances.length, up, down,
      checked_at: new Date().toISOString(),
      instances: checked.map(c => ({ id: c.id, name: c.name, status: c.status })),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/gateways/:id
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const instance = await GatewayInstance.findByPk(req.params['id'])
    if (!instance) { res.status(404).json({ error: 'Gateway instance not found' }); return }
    const withAcl = await formatGatewayWithAcl(instance)
    res.json({ data: withAcl })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/gateways/:id/health
router.get('/:id/health', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const instance = await GatewayInstance.findByPk(req.params['id'])
    if (!instance) { res.status(404).json({ error: 'Gateway instance not found' }); return }

    const start = Date.now()
    try {
      const info = await validateEndpoint(`${instance.url}/health`).catch(() => null)
      if (!info) { res.json({ id: instance.id, status: 'down', latency_ms: Date.now() - start, checked_at: new Date().toISOString() }); return }
      const pinned = buildPinnedUrl(info)
      const resp = await fetch(pinned.url, { signal: AbortSignal.timeout(3000), headers: pinned.headers })
      res.json({ id: instance.id, status: resp.ok ? 'up' : 'down', latency_ms: Date.now() - start, checked_at: new Date().toISOString() })
    } catch {
      res.json({ id: instance.id, status: 'down', latency_ms: Date.now() - start, checked_at: new Date().toISOString() })
    }
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/gateways/:id/reload — proxy reload to the gateway using its stored control key
router.post('/:id/reload', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const instance = await GatewayInstance.findByPk(req.params['id'])
    if (!instance) { res.status(404).json({ error: 'Gateway instance not found' }); return }

    const result = await reloadGatewayInstance(instance)

    if (result.detail === 'no-active-key') {
      res.status(400).json({ error: 'No active control key — generate one first in the API Keys tab' })
      return
    }
    if (result.ok) {
      res.json({
        success: true,
        message: 'Cache reload triggered',
        gateway: instance.name,
        gateway_url: instance.url,
        key_prefix: result.keyPrefix,
        timestamp: new Date().toISOString(),
      })
      return
    }
    if (result.status === 429) {
      res.status(429).json({ error: 'Rate limited by gateway' })
      return
    }
    if (result.status) {
      res.status(502).json({ error: `Gateway returned ${result.status}`, detail: result.detail })
      return
    }
    res.status(502).json({ error: 'Gateway unreachable', detail: result.detail })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/gateways
router.post('/', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, location, url, acl_list_id, default_firewall_mode } = req.body as {
      name?: string; description?: string; location?: string; url?: string; acl_list_id?: string | null; default_firewall_mode?: string
    }
    if (!name || !url) { res.status(400).json({ error: 'name and url are required' }); return }
    if (!/^https?:\/\//i.test(url)) { res.status(400).json({ error: 'url must start with http:// or https://' }); return }
    const mode = default_firewall_mode && ['allow_all', 'block_all'].includes(default_firewall_mode)
      ? default_firewall_mode : 'allow_all'
    const instance = await GatewayInstance.create({
      name, description, location, url,
      acl_list_id: acl_list_id || null,
      default_firewall_mode: mode as 'allow_all' | 'block_all',
    })
    res.status(201).json({ data: instance })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/gateways/:id
router.patch('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const instance = await GatewayInstance.findByPk(req.params['id'])
    if (!instance) { res.status(404).json({ error: 'Gateway instance not found' }); return }
    const { name, description, location, url, acl_list_id, default_firewall_mode } = req.body as {
      name?: string; description?: string; location?: string; url?: string; acl_list_id?: string | null; default_firewall_mode?: string
    }
    if (url && !/^https?:\/\//i.test(url)) { res.status(400).json({ error: 'url must start with http:// or https://' }); return }
    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates['name'] = name
    if (description !== undefined) updates['description'] = description
    if (location !== undefined) updates['location'] = location
    if (url !== undefined) updates['url'] = url
    if (acl_list_id !== undefined) updates['acl_list_id'] = acl_list_id || null
    if (default_firewall_mode !== undefined && ['allow_all', 'block_all'].includes(default_firewall_mode)) {
      updates['default_firewall_mode'] = default_firewall_mode
    }
    await instance.update(updates)
    res.json({ data: instance })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/gateways/:id
router.delete('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const instance = await GatewayInstance.findByPk(req.params['id'])
    if (!instance) { res.status(404).json({ error: 'Gateway instance not found' }); return }
    await instance.destroy()
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/gateways/:id/acl-entries
router.get('/:id/acl-entries', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const instance = await GatewayInstance.findByPk(req.params['id'])
    if (!instance) { res.status(404).json({ error: 'Gateway instance not found' }); return }
    if (!instance.acl_list_id) { res.json({ data: [] }); return }

    const list = await NetworkAclList.findByPk(instance.acl_list_id)
    if (!list) { res.json({ data: [] }); return }

    const entries = await NetworkAclEntry.findAll({
      where: { list_id: instance.acl_list_id },
      order: [['created_at', 'ASC']],
    })
    res.json({ data: { list, entries } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------------------------------------------------------------------------
// API Key management endpoints
// ---------------------------------------------------------------------------

// GET /api/gateways/:id/apikey — list key versions (no raw key material)
router.get('/:id/apikey', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const instance = await GatewayInstance.findByPk(req.params['id'])
    if (!instance) { res.status(404).json({ error: 'Gateway instance not found' }); return }

    const keys = await GatewayApiKey.findAll({
      where: { gateway_id: instance.id },
      order: [['version', 'DESC']],
    })

    const safeKeys = keys.map(k => {
      const j = k.toJSON() as unknown as Record<string, unknown>
      delete j['key_hash']
      delete j['key_encrypted']
      j['created_at'] = j['createdAt']; delete j['createdAt']
      j['updated_at'] = j['updatedAt']; delete j['updatedAt']
      return j
    })
    res.json({ data: safeKeys })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/gateways/:id/apikey — generate first key or rotate
router.post('/:id/apikey', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const instance = await GatewayInstance.findByPk(req.params['id'])
    if (!instance) { res.status(404).json({ error: 'Gateway instance not found' }); return }

    const rawKey       = crypto.randomBytes(32).toString('hex')
    const prefix       = 'gwk_' + crypto.randomBytes(3).toString('hex')
    const key_hash     = sha256(rawKey)
    const key_encrypted = gatewayEncrypt(rawKey)

    // Find current active key — supersede it if present
    const current = await GatewayApiKey.findOne({
      where: { gateway_id: instance.id, status: 'active' },
    })

    const nextVersion = current ? current.version + 1 : 1
    const graceMs = (env.GATEWAY_API_KEY_GRACE_PERIOD || 86400) * 1000

    if (current) {
      await current.update({
        status: 'superseded',
        grace_expires_at: new Date(Date.now() + graceMs),
      })
    }

    const newKey = await GatewayApiKey.create({
      gateway_id: instance.id,
      key_hash,
      key_encrypted,
      key_prefix: prefix,
      version: nextVersion,
      status: 'active',
      grace_expires_at: null,
    })

    const action = current ? 'gateway_key.rotate' : 'gateway_key.generate'
    await logAdmin(req, action, instance.id, null, { key_prefix: prefix, version: nextVersion })
    await logAudit(req, action, 'gateway_instance', instance.id, { key_prefix: prefix, version: nextVersion })

    // Best-effort: push the new key to the gateway so it takes effect immediately.
    // On rotation this succeeds via the still-cached grace key; on first generation the gateway
    // picks it up within ~30s via its auth-cache refresh.
    let reloaded = false
    try {
      const r = await reloadGatewayInstance(instance)
      reloaded = r.ok
    } catch { /* never block key creation on reload failure */ }

    const newKeyJson = newKey.toJSON() as unknown as Record<string, unknown>
    delete newKeyJson['key_hash']
    delete newKeyJson['key_encrypted']
    newKeyJson['full_key'] = rawKey
    newKeyJson['reloaded'] = reloaded
    newKeyJson['created_at'] = newKeyJson['createdAt']; delete newKeyJson['createdAt']
    newKeyJson['updated_at'] = newKeyJson['updatedAt']; delete newKeyJson['updatedAt']
    res.status(201).json({ data: newKeyJson })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/gateways/:id/apikey/reveal — repeatable reveal of all currently-valid keys
router.get('/:id/apikey/reveal', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const instance = await GatewayInstance.findByPk(req.params['id'])
    if (!instance) { res.status(404).json({ error: 'Gateway instance not found' }); return }

    // Active + in-grace keys
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
      res.status(404).json({ error: 'No active key found for this gateway' })
      return
    }

    await logAdmin(req, 'gateway_key.reveal', instance.id)
    await logAudit(req, 'gateway_key.reveal', 'gateway_instance', instance.id, {
      gateway_name: instance.name,
      versions_revealed: validKeys.map(k => k.version),
    })

    const revealed = validKeys.map(k => {
      const j = k.toJSON() as unknown as Record<string, unknown>
      delete j['key_hash']
      delete j['key_encrypted']
      j['full_key'] = gatewayDecrypt(k.key_encrypted)
      j['created_at'] = j['createdAt']; delete j['createdAt']
      j['updated_at'] = j['updatedAt']; delete j['updatedAt']
      return j
    })

    res.json({ data: revealed })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/gateways/:id/apikey/:versionId — revoke a version, or permanently delete it
// with ?permanent=true (removes the row entirely so keys can be cleared for a fresh start).
router.delete('/:id/apikey/:versionId', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const instance = await GatewayInstance.findByPk(req.params['id'])
    if (!instance) { res.status(404).json({ error: 'Gateway instance not found' }); return }

    const keyRecord = await GatewayApiKey.findOne({
      where: { id: req.params['versionId'], gateway_id: instance.id },
    })
    if (!keyRecord) { res.status(404).json({ error: 'Key version not found' }); return }

    const meta = { key_prefix: keyRecord.key_prefix, version: keyRecord.version }

    if (req.query['permanent'] === 'true') {
      await keyRecord.destroy()
      await logAdmin(req, 'gateway_key.delete', instance.id, null, meta)
      await logAudit(req, 'gateway_key.delete', 'gateway_instance', instance.id, meta)
      res.json({ data: { id: req.params['versionId'], deleted: true } })
      return
    }

    if (keyRecord.status === 'revoked') { res.status(400).json({ error: 'Key already revoked' }); return }

    await keyRecord.update({ status: 'revoked', grace_expires_at: null })
    await logAdmin(req, 'gateway_key.revoke', instance.id, null, meta)
    await logAudit(req, 'gateway_key.revoke', 'gateway_instance', instance.id, meta)

    res.json({ data: { id: keyRecord.id, status: 'revoked' } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
