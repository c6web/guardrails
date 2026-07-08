import type { Request, Response } from 'express';
import { Router } from 'express'
import crypto from 'crypto'
import { ApiKey } from '../models/data-db/ApiKey'
import { ConnectedApp } from '../models/data-db/ConnectedApp'
import { ApiKeyVersion } from '../models/data-db/ApiKeyVersion'
import { AdminActivityLog } from '../models/logs-db/AdminActivityLog'
import { logAudit } from '../utils/auditLog'
import { appKeyEncrypt, appKeyDecrypt } from '../utils/gatewayKeyCrypto'
import { requireAuth } from '../middleware/auth'
import { canAccessApp, canManageApp, getAccessibleAppIds, GROUP_IDS } from '../utils/appAccess'
import { triggerGatewayReload } from '../utils/gatewayReload'
import { env } from '../config/env'
import { isTrustedProxy } from '../utils/validateEndpoint'

const router = Router()

// Grace period (hours) for superseded keys after rotation
const GRACE_HOURS = parseInt(process.env['ROTATION_GRACE_HOURS'] ?? '24', 10)

function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for']
  const peer = req.ip
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
      action, target_type: 'apikey', target_id: targetId,
      before_state: before ?? null, after_state: after ?? null,
      ip_address: clientIp(req),
    })
  } catch { /* non-blocking */ }
}

function sha256(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex')
}

function sanitizeKey(key: ApiKey) {
  const json = key.toJSON() as unknown as Record<string, unknown>
  delete json['key_hash']
  delete json['key_encrypted']
  const app = (key as unknown as Record<string, unknown>)['app']
  if (app && typeof app === 'object' && app !== null) {
    json['app_name'] = (app as Record<string, unknown>).name ?? null
  } else {
    json['app_name'] = null
  }
  return json
}

function sanitizeVersion(v: ApiKeyVersion) {
  const json = v.toJSON() as unknown as Record<string, unknown>
  delete json['key_hash']
  return json
}

async function canManageKey(req: Request, key: ApiKey): Promise<boolean> {
  if (req.user?.groupId === GROUP_IDS.admin) return true
  // Check app ownership (AppPermission grantees are read-only)
  if (key.app_id) return canManageApp(req, key.app_id)
  // Fallback for keys with no app_id: owner email match
  return key.owner === req.user?.email
}

async function canReadKey(req: Request, key: ApiKey): Promise<boolean> {
  if (req.user?.groupId === GROUP_IDS.admin) return true
  if (key.app_id) return canAccessApp(req, key.app_id)
  return key.owner === req.user?.email
}

function graceDeadline(): Date {
  return new Date(Date.now() + GRACE_HOURS * 60 * 60 * 1000)
}

// GET /api/apikeys
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
    const where: Record<string, unknown> = {}
    if (req.query['status']) where['status'] = req.query['status']
    if (req.query['app_id']) where['app_id'] = req.query['app_id']

    if (req.user.groupId !== GROUP_IDS.admin && req.user.groupId !== GROUP_IDS.viewer) {
      // For user role: restrict to keys belonging to accessible apps
      const appIds = await getAccessibleAppIds(req)
      if (appIds !== null) {
        if (appIds.length === 0) { res.json({ data: [] }); return }
        where['app_id'] = appIds
      }
    }

    const keys = await ApiKey.findAll({
      where,
      include: [{ model: ConnectedApp as typeof ConnectedApp, as: 'app', attributes: ['id', 'name'] }],
      order: [['created_at', 'DESC']],
    })
    res.json({ data: keys.map(sanitizeKey) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/apikeys/:id
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const key = await ApiKey.findByPk(req.params['id'], {
      include: [{ model: ConnectedApp as typeof ConnectedApp, as: 'app', attributes: ['id', 'name'] }],
    })
    if (!key) { res.status(404).json({ error: 'API key not found' }); return }
    if (!await canReadKey(req, key)) { res.status(403).json({ error: 'Forbidden' }); return }
    res.json({ data: sanitizeKey(key) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/apikeys/:id/versions — owner or admin
router.get('/:id/versions', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const key = await ApiKey.findByPk(req.params['id'])
    if (!key) { res.status(404).json({ error: 'API key not found' }); return }
    if (!await canReadKey(req, key)) { res.status(403).json({ error: 'Forbidden' }); return }

    const versions = await ApiKeyVersion.findAll({
      where: { api_key_id: key.id },
      order: [['version', 'DESC']],
    })
    res.json({ data: versions.map(sanitizeVersion), grace_hours: GRACE_HOURS })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/apikeys/:id/reveal — owner or admin; decrypts and returns the key (audit-logged)
router.get('/:id/reveal', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const key = await ApiKey.findByPk(req.params['id'], {
      include: [{ model: ConnectedApp as typeof ConnectedApp, as: 'app', attributes: ['id', 'name'] }],
    })
    if (!key) { res.status(404).json({ error: 'API key not found' }); return }
    if (!await canManageKey(req, key)) { res.status(403).json({ error: 'Forbidden' }); return }
    if (!key.key_encrypted) { res.status(404).json({ error: 'Key material not available' }); return }

    const fullKey = appKeyDecrypt(key.key_encrypted)
    await logAdmin(req, 'apikey.reveal', key.id)
    await logAudit(req, 'apikey.reveal', 'api_key', key.id, { name: key.name, key_prefix: key.key_prefix })
    res.json({ data: { full_key: fullKey, key_prefix: key.key_prefix, name: key.name } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/apikeys — any authenticated user (returns full key once)
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
    const { name, app_id, rotation_policy } = req.body as {
      name?: string; app_id?: string; rotation_policy?: string
    }
    if (!name?.trim() || !app_id || !rotation_policy) {
      res.status(400).json({ error: 'name, app_id, rotation_policy are required' })
      return
    }

    // Validate app_id exists and user can access it
    const app = await ConnectedApp.findByPk(app_id)
    if (!app) { res.status(404).json({ error: 'App not found' }); return }
    if (!await canManageApp(req, app_id)) { res.status(403).json({ error: 'Forbidden' }); return }

    const owner    = req.user?.email ?? req.user?.userId ?? ''
    const rawKey   = crypto.randomBytes(32).toString('hex')
    const prefix   = `ak_${crypto.randomBytes(4).toString('hex').slice(0, 4)}`
    const fullKey  = `${prefix}_${rawKey}`
    const key_hash = sha256(fullKey.slice(3))  // hash everything after 'ak_' — matches gateway auth.rs

    const apiKey = await ApiKey.create({
      name: name.trim(), key_prefix: prefix, key_hash,
      key_encrypted: appKeyEncrypt(fullKey),
      app_id, owner, rotation_policy,
      status: 'active', last_used_at: null,
    })

    // Record version 1
    await ApiKeyVersion.create({
      api_key_id: apiKey.id, key_hash, key_prefix: prefix,
      version: 1, status: 'active', grace_expires_at: null,
    })

    const json = apiKey.toJSON() as unknown as Record<string, unknown>
    delete json['key_hash']
    delete json['key_encrypted']
    await logAdmin(req, 'apikey.create', apiKey.id, null, json)
    await logAudit(req, 'apikey.create', 'api_key', apiKey.id, { name: apiKey.name, key_prefix: prefix, app_id })
    await triggerGatewayReload()
    res.status(201).json({ data: { ...json, full_key: fullKey } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/apikeys/:id — owner or admin (update name)
router.patch('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const key = await ApiKey.findByPk(req.params['id'])
    if (!key) { res.status(404).json({ error: 'API key not found' }); return }
    if (!await canManageKey(req, key)) { res.status(403).json({ error: 'Forbidden' }); return }

    const { name } = req.body as { name?: string }
    const updates: Record<string, unknown> = {}
    if (name !== undefined) {
      if (!name.trim()) { res.status(400).json({ error: 'name cannot be empty' }); return }
      updates['name'] = name.trim()
    }
    if (!Object.keys(updates).length) { res.json({ data: sanitizeKey(key) }); return }

    const before = sanitizeKey(key)
    await key.update(updates)
    await logAdmin(req, 'apikey.update', key.id, before, sanitizeKey(key))
    res.json({ data: sanitizeKey(key) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/apikeys/:id/rotate — generates new key, keeps old in grace period
router.post('/:id/rotate', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const key = await ApiKey.findByPk(req.params['id'])
    if (!key) { res.status(404).json({ error: 'API key not found' }); return }
    if (key.status === 'revoked') { res.status(400).json({ error: 'Cannot rotate a revoked key' }); return }
    if (!await canManageKey(req, key)) { res.status(403).json({ error: 'Forbidden' }); return }

    // Expire any already-superseded versions (only keep latest-1 at any time)
    await ApiKeyVersion.update(
      { status: 'revoked' },
      { where: { api_key_id: key.id, status: 'superseded' } }
    )

    // Find the current active version number
    const activeVersion = await ApiKeyVersion.findOne({
      where: { api_key_id: key.id, status: 'active' },
      order: [['version', 'DESC']],
    })
    const currentVersionNum = activeVersion?.version ?? 1

    // Mark current active version as superseded with grace period
    if (activeVersion) {
      await activeVersion.update({ status: 'superseded', grace_expires_at: graceDeadline() })
    } else {
      // No version record yet (keys created before this feature) — create one for old key
      await ApiKeyVersion.create({
        api_key_id: key.id, key_hash: key.key_hash, key_prefix: key.key_prefix,
        version: currentVersionNum, status: 'superseded',
        grace_expires_at: graceDeadline(),
      })
    }

    // Generate new key material
    const rawKey     = crypto.randomBytes(32).toString('hex')
    const newPrefix  = `ak_${crypto.randomBytes(4).toString('hex').slice(0, 4)}`
    const newFullKey = `${newPrefix}_${rawKey}`
    const newHash    = sha256(newFullKey.slice(3))  // hash everything after 'ak_' — matches gateway auth.rs
    const newVersion = currentVersionNum + 1

    // Update the primary key record
    await key.update({ key_prefix: newPrefix, key_hash: newHash, key_encrypted: appKeyEncrypt(newFullKey), status: 'active', last_used_at: null })

    // Record the new version
    await ApiKeyVersion.create({
      api_key_id: key.id, key_hash: newHash, key_prefix: newPrefix,
      version: newVersion, status: 'active', grace_expires_at: null,
    })

    const json = key.toJSON() as unknown as Record<string, unknown>
    delete json['key_hash']
    delete json['key_encrypted']
    await logAdmin(req, 'apikey.rotate', key.id, null, { ...json, new_version: newVersion, grace_hours: GRACE_HOURS })
    await logAudit(req, 'apikey.rotate', 'api_key', key.id, { name: key.name, key_prefix: newPrefix, new_version: newVersion, grace_hours: GRACE_HOURS })
    await triggerGatewayReload()
    res.json({ data: { ...json, full_key: newFullKey }, grace_hours: GRACE_HOURS })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/apikeys/:id/versions/:vid — force-revoke a superseded version
router.delete('/:id/versions/:vid', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const key = await ApiKey.findByPk(req.params['id'])
    if (!key) { res.status(404).json({ error: 'API key not found' }); return }
    if (!await canManageKey(req, key)) { res.status(403).json({ error: 'Forbidden' }); return }

    const version = await ApiKeyVersion.findOne({
      where: { id: req.params['vid'], api_key_id: key.id },
    })
    if (!version) { res.status(404).json({ error: 'Version not found' }); return }
    if (version.status === 'active') { res.status(400).json({ error: 'Cannot revoke the active version — rotate or revoke the key instead' }); return }
    if (version.status === 'revoked') { res.status(400).json({ error: 'Version already revoked' }); return }

    await version.update({ status: 'revoked', grace_expires_at: null })
    await logAdmin(req, 'apikey.version.revoke', key.id, null, { version_id: version.id, version_num: version.version })
    res.json({ data: sanitizeVersion(version) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/apikeys/:id/revoke — owner or admin
router.patch('/:id/revoke', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const key = await ApiKey.findByPk(req.params['id'])
    if (!key) { res.status(404).json({ error: 'API key not found' }); return }
    if (!await canManageKey(req, key)) { res.status(403).json({ error: 'Forbidden' }); return }
    const before = sanitizeKey(key)
    await key.update({ status: 'revoked' })
    // Revoke all versions when key is fully revoked
    await ApiKeyVersion.update({ status: 'revoked', grace_expires_at: null }, { where: { api_key_id: key.id } })
    await logAdmin(req, 'apikey.revoke', key.id, before, sanitizeKey(key))
    await logAudit(req, 'apikey.revoke', 'api_key', key.id, { name: key.name, key_prefix: key.key_prefix })
    await triggerGatewayReload()
    res.json({ data: sanitizeKey(key) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/apikeys/:id — hard delete; only allowed when key is already revoked
router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const key = await ApiKey.findByPk(req.params['id'])
    if (!key) { res.status(404).json({ error: 'API key not found' }); return }
    if (key.status !== 'revoked') { res.status(400).json({ error: 'Only revoked keys can be deleted' }); return }
    if (!await canManageKey(req, key)) { res.status(403).json({ error: 'Forbidden' }); return }
    await logAdmin(req, 'apikey.delete', key.id, sanitizeKey(key), null)
    await key.destroy()
    await triggerGatewayReload()
    res.status(204).end()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/apikeys/:id/transfer — owner or admin
router.patch('/:id/transfer', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const key = await ApiKey.findByPk(req.params['id'])
    if (!key) { res.status(404).json({ error: 'API key not found' }); return }
    if (key.status === 'revoked') { res.status(400).json({ error: 'Cannot transfer a revoked key' }); return }
    if (!await canManageKey(req, key)) { res.status(403).json({ error: 'Forbidden' }); return }

    const { new_owner } = req.body as { new_owner?: string }
    if (!new_owner?.trim()) { res.status(400).json({ error: 'new_owner is required' }); return }

    const before = sanitizeKey(key)
    await key.update({ owner: new_owner.trim() })
    await logAdmin(req, 'apikey.transfer', key.id, before, sanitizeKey(key))
    res.json({ data: sanitizeKey(key) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
