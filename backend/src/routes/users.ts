import type { Request, Response } from 'express';
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { Op } from 'sequelize'
import { User } from '../models/users-db/User'
import { Organization } from '../models/users-db/Organization'
import { sequelizeUsersDb } from '../config/database'
import { Group } from '../models/data-db/Group'
import { ConnectedApp } from '../models/data-db/ConnectedApp'
import { UpstreamProviderLink } from '../models/data-db/UpstreamProviderLink'
import { ApiKey } from '../models/data-db/ApiKey'
import { ApiKeyVersion } from '../models/data-db/ApiKeyVersion'
import { AppPermission } from '../models/data-db/AppPermission'
import { PasswordPolicy } from '../models/data-db/PasswordPolicy'
import { AdminActivityLog } from '../models/logs-db/AdminActivityLog'
import { UserActivityLog } from '../models/logs-db/UserActivityLog'
import { requireAuth, isAdmin, hasViewerOrAbove, hasAccess } from '../middleware/auth'
import { logAudit } from '../utils/auditLog'
import { appKeyEncrypt } from '../utils/gatewayKeyCrypto'
import { triggerGatewayReload } from '../utils/gatewayReload'
import { isOtpAvailable } from '../utils/otp'
import { isTrustedProxy } from '../utils/validateEndpoint'
import { env } from '../config/env'

function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for']
  const peer = req.ip
  if (typeof fwd === 'string' && env.TRUSTED_PROXY_DEPTH > 0 && isTrustedProxy(peer, env.TRUSTED_PROXY_CIDR)) {
    return fwd.split(',')[0].trim()
  }
  return peer ?? '0.0.0.0'
}

async function logAdmin(
  req: Request,
  action: string, targetId: string, targetType = 'user',
  before?: object | null, after?: object | null,
) {
  if (!req.user) return
  try {
    await AdminActivityLog.create({
      admin_id: req.user.userId, admin_email: req.user.email,
      action, target_type: targetType, target_id: targetId,
      before_state: before ?? null, after_state: after ?? null,
      ip_address: clientIp(req),
    })
  } catch { /* never block request for logging failures */ }
}

const router = Router()

function sanitize(user: User) {
  const { password_hash: _ph, ...safe } = user.toJSON() as unknown as Record<string, unknown>
  void _ph
  return safe
}

async function validatePassword(password: string): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = []
  const policy = await PasswordPolicy.findByPk(1)

  if (!policy) {
    return { valid: false, errors: ['Password policy not configured'] }
  }

  if (password.length < policy.min_length) {
    errors.push(`Password must be at least ${policy.min_length} characters long`)
  }
  if (policy.require_uppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  }
  if (policy.require_lowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter')
  }
  if (policy.require_numbers && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number')
  }
  if (policy.require_symbols && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character')
  }

  return { valid: errors.length === 0, errors }
}

// GET /api/users — paginated list (viewer+, or knowledge_admin for app owner selection)
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!hasViewerOrAbove(req) && !hasAccess(req)) { res.status(403).json({ error: 'Insufficient permissions' }); return }
    const page  = Math.max(1, parseInt(req.query['page'] as string || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(req.query['limit'] as string || '20', 10)))
    const offset = (page - 1) * limit

    const where: Record<string, unknown> = {}
    if (req.query['group_id']) where['group_id'] = req.query['group_id']
    if (req.query['organization_id']) where['organization_id'] = req.query['organization_id']
    if (req.query['status']) where['status'] = req.query['status']
    if (req.query['q']) {
      where[Op.or as unknown as string] = [
        { username: { [Op.iLike]: `%${req.query['q']}%` } },
        { display_name: { [Op.iLike]: `%${req.query['q']}%` } },
        { email:    { [Op.iLike]: `%${req.query['q']}%` } },
      ]
    }

    const { count, rows } = await User.findAndCountAll({ where, limit, offset, order: [['created_at', 'DESC']] })
    res.json({
      data: rows.map(sanitize),
      meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/users/:id — admin/viewer can view anyone; any user can view their own record
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!hasViewerOrAbove(req) && req.user?.userId !== req.params['id']) {
      res.status(403).json({ error: 'Insufficient permissions' }); return
    }
    const user = await User.findByPk(req.params['id'])
    if (!user) { res.status(404).json({ error: 'User not found' }); return }
    res.json({ data: sanitize(user) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/users — admin only
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Admin access required' }); return }
    const { username, email, password, display_name, group_id, team, status, create_first_app } =
      req.body as {
        username?: string; email?: string; password?: string
        display_name?: string; group_id?: string; team?: string
        status?: 'active' | 'dormant' | 'suspended'
        create_first_app?: boolean
      }

    if (!username || !email || !password || !group_id) {
      res.status(400).json({ error: 'username, email, password, group_id are required' })
      return
    }

    const group = await Group.findByPk(group_id)
    if (!group) { res.status(400).json({ error: 'Invalid group_id' }); return }

    const password_hash = await bcrypt.hash(password, 12)
    const orgName = display_name ?? username
    const user = await sequelizeUsersDb.transaction(async (t) => {
      const created = await User.create({
        username, email, password_hash,
        display_name: orgName,
        group_id,
        team: team ?? null,
        status: status ?? 'active',
        last_seen_at: null,
      }, { transaction: t })
      const org = await Organization.create({
        name: orgName,
        owner_user_id: created.id,
      }, { transaction: t })
      await created.update({ organization_id: org.id }, { transaction: t })
      return created
    })
    if (create_first_app && user.organization_id) {
      const defaultLink = await UpstreamProviderLink.findOne({ where: { is_default: true } })
      const app = await ConnectedApp.create({
        name: `My First App (${email})`,
        team: display_name?.trim() || username,
        env: 'development',
        primary_provider_id: defaultLink?.ai_provider_id || null,
        org_id: user.organization_id,
        owner: display_name?.trim() || username,
        owner_email: email,
        owner_id: user.id,
        enable_t2: true,
        enable_knowledge_dev: true,
        quota_mode: 'fixed',
        quota_limit: 2000,
        quota_warning_limit: 1800,
        quota_enforcement: 'hard',
      })

      const rawKey = crypto.randomBytes(32).toString('hex')
      const prefix = `ak_${crypto.randomBytes(4).toString('hex').slice(0, 4)}`
      const fullKey = `${prefix}_${rawKey}`
      const keyHash = crypto.createHash('sha256').update(fullKey.slice(3)).digest('hex')

      const apiKey = await ApiKey.create({
        name: 'Default key',
        key_prefix: prefix,
        key_hash: keyHash,
        key_encrypted: appKeyEncrypt(fullKey),
        app_id: app.id,
        owner: email,
        rotation_policy: 'no-rotation',
        status: 'active',
        last_used_at: null,
      })

      await ApiKeyVersion.create({
        api_key_id: apiKey.id,
        key_hash: keyHash,
        key_prefix: prefix,
        version: 1,
        status: 'active',
        grace_expires_at: null,
      })

      await AppPermission.create({
        app_id: app.id,
        user_id: user.id,
        user_email: email,
        user_name: display_name?.trim() || username,
      })

      triggerGatewayReload()
    }

    await logAdmin(req, 'user.create', user.id, 'user', null, sanitize(user))
    await logAudit(req, 'user.create', 'user', user.id, { email: user.email, group_id })
    res.status(201).json({ data: sanitize(user) })
  } catch (err: unknown) {
    const e = err as { name?: string; constraint?: string }
    if (e.name === 'SequelizeUniqueConstraintError') {
      const constraint = (e as any).errors?.[0]?.path
      if (constraint === 'display_name') {
        res.status(409).json({ error: 'Display name already in use' })
      } else {
        res.status(409).json({ error: 'Username or email already exists' })
      }
      return
    }
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/users/:id
router.patch('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findByPk(req.params['id'])
    if (!user) { res.status(404).json({ error: 'User not found' }); return }

    // Only admin can change group_id, status, must_change_password, or organization_id
    if (isAdmin(req)) {
      const { group_id, status, must_change_password, password, organization_id, ...rest } = req.body as Record<string, unknown>

      // Admins cannot change their own group (prevents accidental self-demotion)
      if (group_id !== undefined && req.user?.userId === user.id) {
        res.status(400).json({ error: 'Cannot change your own group' })
        return
      }

      // Validate org if changing it
      if (organization_id !== undefined && organization_id !== null) {
        const orgExists = await Organization.findByPk(organization_id as string)
        if (!orgExists) {
          res.status(400).json({ error: 'Organization not found' })
          return
        }
      }

      const before = sanitize(user)
      const updates: Record<string, unknown> = { ...rest }
      if (group_id !== undefined) updates['group_id'] = group_id
      if (status !== undefined) updates['status'] = status
      if (must_change_password !== undefined) updates['must_change_password'] = must_change_password
      if (password) updates['password_hash'] = await bcrypt.hash(password as string, 12)
      if (organization_id !== undefined) updates['organization_id'] = organization_id

      await user.update(updates)
      const after = sanitize(user)

      const isSelfEdit = req.user?.userId === user.id
      if (isSelfEdit) {
        try {
          await UserActivityLog.create({
            user_id: user.id, user_email: user.email,
            activity_type: 'profile_update',
            details: { changed_fields: Object.keys(updates).filter(k => k !== 'password_hash') },
            ip_address: clientIp(req),
          })
        } catch { /* non-blocking */ }
      } else {
        await logAdmin(req, 'user.update', user.id, 'user', before, after)
        const hasOrgChange = organization_id !== undefined
        const auditAction = group_id !== undefined ? 'user.group_change' : hasOrgChange ? 'user.org_change' : 'user.update'
        const auditDetails = group_id !== undefined
          ? { email: user.email, group_id_before: (before as Record<string,unknown>)['group_id'], group_id_after: group_id }
          : hasOrgChange
            ? { email: user.email, organization_id_before: (before as Record<string,unknown>)['organization_id'], organization_id_after: organization_id }
            : { email: user.email, changed_fields: Object.keys(updates).filter(k => k !== 'password_hash') }
        await logAudit(req, auditAction, 'user', user.id, auditDetails)
      }

      res.json({ data: after })
    } else if (req.user?.userId === user.id) {
      // Self-edit: only explicitly allowed fields
      const ALLOWED_SELF_FIELDS = ['display_name', 'team'] as const
      const updates: Record<string, unknown> = {}
      for (const key of ALLOWED_SELF_FIELDS) {
        const val = (req.body as Record<string, unknown>)[key]
        if (val !== undefined) updates[key] = val
      }
      await user.update(updates)
      const after = sanitize(user)

      try {
        await UserActivityLog.create({
          user_id: user.id, user_email: user.email,
          activity_type: 'profile_update',
          details: { changed_fields: Object.keys(updates).filter(k => k !== 'password_hash') },
          ip_address: clientIp(req),
        })
      } catch { /* non-blocking */ }

      res.json({ data: after })
    } else {
      res.status(403).json({ error: 'Forbidden' })
    }
  } catch (err: unknown) {
    const e = err as { name?: string; constraint?: string }
    if (e.name === 'SequelizeUniqueConstraintError') {
      const constraint = (e as any).errors?.[0]?.path
      if (constraint === 'display_name') {
        res.status(409).json({ error: 'Display name already in use' })
      } else {
        res.status(409).json({ error: 'Username or email already exists' })
      }
      return
    }
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/users/:id — admin only
router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Admin access required' }); return }
    if (req.user?.userId === req.params['id']) {
      res.status(400).json({ error: 'Cannot delete your own account' })
      return
    }
    const user = await User.findByPk(req.params['id'])
    if (!user) { res.status(404).json({ error: 'User not found' }); return }
    const snapshot = sanitize(user)
    await user.destroy()
    await logAdmin(req, 'user.delete', req.params['id'], 'user', snapshot, null)
    await logAudit(req, 'user.delete', 'user', user.id, { email: user.email })
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/users/:id/otp — toggle OTP on/off (admin or self)
router.put('/:id/otp', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string
    const { enabled } = req.body as { enabled?: boolean }

    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled flag is required' })
      return
    }

    const user = await User.findByPk(id)
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    if (enabled) {
      const available = await isOtpAvailable()
      if (!available) {
        res.status(400).json({ error: 'OTP is not available — configure an email provider first' })
        return
      }
    }

    // Only allow toggle by admin or the user themselves
    if (req.user?.userId !== id && !isAdmin(req)) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return
    }

    const wasEnabled = user.otp_enabled
    user.otp_enabled = enabled

    if (!enabled) {
      user.otp_verified_at = null
    }

    await user.save()

    await UserActivityLog.create({
      user_id: id,
      user_email: user.email || '',
      activity_type: 'otp_toggle',
      details: { user_id: id, enabled_before: wasEnabled, enabled_after: enabled },
      ip_address: req.socket?.remoteAddress ?? req.ip ?? '0.0.0.0',
    }).catch(() => {})

    res.json({ success: true, otp_enabled: user.otp_enabled })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/users/:id/require-password-change — admin sets must_change_password flag without resetting password
router.post('/:id/require-password-change', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Admin access required' }); return }
    const user = await User.findByPk(req.params['id'])
    if (!user) { res.status(404).json({ error: 'User not found' }); return }

    if (user.must_change_password) {
      res.status(400).json({ error: 'User already required to change password' })
      return
    }

    const before = sanitize(user)
    user.must_change_password = true
    await user.save()

    await logAdmin(req, 'user.require_password_change', req.params['id'], 'user', before, sanitize(user))
    await logAudit(req, 'user.require_password_change', 'user', user.id, { email: user.email })
    res.json({ success: true, message: `Password change required for ${user.email}` })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/users/:id/reset-password — admin forces a password reset with provided password
router.post('/:id/reset-password', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Admin access required' }); return }
    const user = await User.findByPk(req.params['id'])
    if (!user) { res.status(404).json({ error: 'User not found' }); return }

    const snapshot = sanitize(user)
    const newPassword = req.body?.password
    if (!newPassword) { res.status(400).json({ error: 'Password is required' }); return }

    const validation = await validatePassword(newPassword)
    if (!validation.valid) {
      res.status(400).json({ error: 'Invalid password', details: validation.errors })
      return
    }

    const newHash = await bcrypt.genSalt(12).then(salt => bcrypt.hash(newPassword, salt))
    user.password_hash = newHash
    user.password_changed_at = new Date()
    user.must_change_password = true
    user.password_grace_until = null
    await user.save()

    await logAdmin(req, 'user.reset_password', req.params['id'], 'user', snapshot, sanitize(user))
    await logAudit(req, 'user.reset_password', 'user', user.id, { email: user.email })
    res.json({ success: true, message: `Password reset for ${user.email}` })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/users/:id/change-password — self-service password change
router.post('/:id/change-password', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const targetUser = await User.findByPk(req.params['id'])
    if (!targetUser) { res.status(404).json({ error: 'User not found' }); return }

    // Check authorization: user can change their own password, or admin can change anyone's
    if (req.user?.userId !== targetUser.id && !isAdmin(req)) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return
    }

    const { current_password, new_password } = req.body as { current_password?: string; new_password?: string }

    if (!new_password) {
      res.status(400).json({ error: 'new_password is required' })
      return
    }

    // Non-admins must verify current password
    if (!isAdmin(req) || req.user?.userId === targetUser.id) {
      if (!current_password) {
        res.status(400).json({ error: 'current_password is required' })
        return
      }
      const valid = await bcrypt.compare(current_password, targetUser.password_hash)
      if (!valid) {
        await UserActivityLog.create({
          user_id: targetUser.id,
          user_email: targetUser.email,
          activity_type: 'password_change_failed',
          details: { reason: 'invalid_current_password' },
          ip_address: req.socket?.remoteAddress ?? req.ip ?? '0.0.0.0',
        }).catch(() => {})
        res.status(401).json({ error: 'Current password is incorrect' })
        return
      }
    }

    // Validate new password against policy
    const validation = await validatePassword(new_password)
    if (!validation.valid) {
      res.status(400).json({ error: 'Invalid password', details: validation.errors })
      return
    }

    const snapshot = sanitize(targetUser)
    const newHash = await bcrypt.genSalt(12).then(salt => bcrypt.hash(new_password, salt))
    targetUser.password_hash = newHash
    targetUser.password_changed_at = new Date()
    targetUser.must_change_password = false
    targetUser.password_grace_until = null
    await targetUser.save()

    const isSelfChange = req.user?.userId === targetUser.id
    if (isSelfChange) {
      try {
        await UserActivityLog.create({
          user_id: targetUser.id,
          user_email: targetUser.email,
          activity_type: 'password_changed',
          details: { changed_by: 'self' },
          ip_address: req.socket?.remoteAddress ?? req.ip ?? '0.0.0.0',
        })
      } catch { /* non-blocking */ }
    } else {
      await logAdmin(req, 'user.password_change', targetUser.id, 'user', snapshot, sanitize(targetUser))
      await logAudit(req, 'user.password_change', 'user', targetUser.id, { email: targetUser.email })
    }

    res.json({ success: true, message: 'Password changed successfully' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
