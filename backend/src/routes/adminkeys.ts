import type { Request, Response } from 'express';
import { Router } from 'express'
import crypto from 'crypto'
import { AdminApiKey } from '../models/data-db/AdminApiKey'
import { User } from '../models/users-db/User'
import { AdminActivityLog } from '../models/logs-db/AdminActivityLog'
import { logAudit } from '../utils/auditLog'
import { platformEncrypt, platformDecrypt } from '../utils/gatewayKeyCrypto'
import { env } from '../config/env'
import { isTrustedProxy } from '../utils/validateEndpoint'

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
      action, target_type: 'admin_api_key', target_id: targetId,
      before_state: before ?? null, after_state: after ?? null,
      ip_address: clientIp(req),
    })
  } catch { /* non-blocking */ }
}

function sha256(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex')
}

function decryptKeyValue(stored: string | null): string | null {
  if (!stored) return null
  try { return platformDecrypt(stored) } catch { return null }
}

function sanitize(key: AdminApiKey, ownerEmail?: string) {
  const json = key.toJSON() as unknown as Record<string, unknown>
  delete json['key_hash']
  json['owner_email'] = ownerEmail ?? null
  // Mask key_value in list responses — full key via /reveal endpoint only
  if (typeof json['key_value'] === 'string') {
    const prefix = (json['key_prefix'] as string) ?? ''
    json['key_value'] = `${prefix}${'•'.repeat(8)}`
  }
  return json
}

// GET /api/adminkeys
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const keys = await AdminApiKey.findAll({ order: [['created_at', 'DESC']] })

    // Batch-fetch owner emails
    const ownerIds = [...new Set(keys.map(k => k.owner_user_id))]
    const users = await User.findAll({ where: { id: ownerIds }, attributes: ['id', 'email'] })
    const emailMap = Object.fromEntries(users.map(u => [u.id, u.email]))

    res.json({ data: keys.map(k => sanitize(k, emailMap[k.owner_user_id])) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/adminkeys — generate new admin key (returns full value once)
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description } = req.body as { name?: string; description?: string }
    if (!name?.trim()) {
      res.status(400).json({ error: 'name is required' })
      return
    }

    const rawKey   = crypto.randomBytes(32).toString('hex')       // 64 hex chars, no prefix
    const prefix   = crypto.randomBytes(2).toString('hex')         // 4-char display label
    const key_hash = sha256(rawKey)
    const encryptedValue = platformEncrypt(rawKey)

    const key = await AdminApiKey.create({
      name: name.trim(),
      description: description?.trim() || null,
      key_prefix: prefix,
      key_hash,
      key_value: encryptedValue,
      owner_user_id: req.user!.userId,
      status: 'active',
    })

    const ownerEmail = req.user?.email
    const json = sanitize(key, ownerEmail)
    await logAdmin(req, 'admin_key.create', key.id, null, json)
    await logAudit(req, 'admin_key.create', 'admin_api_key', key.id, { name: key.name, key_prefix: prefix })
    res.status(201).json({ data: { ...json, full_key: rawKey } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/adminkeys/:id — rename / update description
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const key = await AdminApiKey.findByPk(req.params['id'])
    if (!key) { res.status(404).json({ error: 'Admin key not found' }); return }

    const { name, description } = req.body as { name?: string; description?: string }
    if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return }

    const updates: Partial<{ name: string; description: string | null }> = {
      name: name.trim(),
    }
    if (description !== undefined) updates.description = description?.trim() || null

    const before = sanitize(key)
    await key.update(updates)
    await logAdmin(req, 'admin_key.update', key.id, before, sanitize(key))
    res.json({ data: sanitize(key) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/adminkeys/:id/revoke
router.patch('/:id/revoke', async (req: Request, res: Response): Promise<void> => {
  try {
    const key = await AdminApiKey.findByPk(req.params['id'])
    if (!key) { res.status(404).json({ error: 'Admin key not found' }); return }
    if (key.status === 'revoked') { res.status(400).json({ error: 'Key already revoked' }); return }

    const before = sanitize(key)
    await key.update({ status: 'revoked' })
    await logAdmin(req, 'admin_key.revoke', key.id, before, sanitize(key))
    await logAudit(req, 'admin_key.revoke', 'admin_api_key', key.id, { name: key.name, key_prefix: key.key_prefix })
    res.json({ data: sanitize(key) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/adminkeys/:id/reveal — audit-logged; returns full key value
router.get('/:id/reveal', async (req: Request, res: Response): Promise<void> => {
  try {
    const key = await AdminApiKey.findByPk(req.params['id'])
    if (!key) { res.status(404).json({ error: 'Admin key not found' }); return }

    const fullKey = decryptKeyValue(key.key_value)
    if (!fullKey) { res.status(500).json({ error: 'Failed to decrypt key value' }); return }

    const ownerEmail = key.owner_user_id
      ? (await User.findByPk(key.owner_user_id, { attributes: ['email'] }))?.email ?? null
      : null

    await logAdmin(req, 'admin_key.reveal', key.id)
    await logAudit(req, 'admin_key.reveal', 'admin_api_key', key.id, { name: key.name, key_prefix: key.key_prefix })
    res.json({ data: { key_value: fullKey, key_prefix: key.key_prefix, name: key.name, owner_email: ownerEmail } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/adminkeys/:id — only when revoked
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const key = await AdminApiKey.findByPk(req.params['id'])
    if (!key) { res.status(404).json({ error: 'Admin key not found' }); return }
    if (key.status !== 'revoked') { res.status(400).json({ error: 'Only revoked keys can be deleted' }); return }

    await logAdmin(req, 'admin_key.delete', key.id, sanitize(key), null)
    await key.destroy()
    res.status(204).end()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
