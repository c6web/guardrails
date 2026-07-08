import type { Request, Response } from 'express'
import { Router } from 'express'
import { Op } from 'sequelize'
import { rateLimit } from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { AccessRequest } from '../models/users-db/AccessRequest'
import { User } from '../models/users-db/User'
import { Organization } from '../models/users-db/Organization'
import { Group } from '../models/data-db/Group'
import { ConnectedApp } from '../models/data-db/ConnectedApp'
import { UpstreamProviderLink } from '../models/data-db/UpstreamProviderLink'
import { ApiKey } from '../models/data-db/ApiKey'
import { ApiKeyVersion } from '../models/data-db/ApiKeyVersion'
import { AppPermission } from '../models/data-db/AppPermission'
import { sequelizeUsersDb } from '../config/database'
import { requireAuth } from '../middleware/auth'
import { requireRole } from '../middleware/requireRole'
import { verifyCaptcha } from '../utils/captcha'
import { appKeyEncrypt } from '../utils/gatewayKeyCrypto'
import { triggerGatewayReload } from '../utils/gatewayReload'
import { sendApprovalEmail, sendRejectionEmail } from '../utils/sendApprovalEmail'

const router = Router()

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many submission attempts. Please try again later.' },
})

const usedCaptchaTokens = new Set<string>()
setInterval(() => usedCaptchaTokens.clear(), 5 * 60 * 1000)

router.post('/', submitLimiter, async (req: Request, res: Response) => {
  try {
    const { full_name, email, company, reason, captcha_token, captcha_answer } = req.body

    if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
      res.status(400).json({ error: 'Full name is required' })
      return
    }
    if (!email || typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ error: 'Email is required' })
      return
    }
    if (!EMAIL_REGEX.test(email)) {
      res.status(400).json({ error: 'Invalid email format' })
      return
    }
    if (!captcha_token || captcha_answer === undefined || captcha_answer === null) {
      res.status(400).json({ error: 'CAPTCHA is required' })
      return
    }

    if (usedCaptchaTokens.has(captcha_token)) {
      res.status(400).json({ error: 'CAPTCHA already used. Please refresh and try again.' })
      return
    }

    const captchaAnswer = parseInt(captcha_answer, 10)
    if (isNaN(captchaAnswer) || !verifyCaptcha(captcha_token, captchaAnswer)) {
      res.status(400).json({ error: 'CAPTCHA verification failed. Please try again.' })
      return
    }

    usedCaptchaTokens.add(captcha_token)

    const normalizedEmail = email.toLowerCase().trim()
    const normalizedName = full_name.trim()

    const existingUser = await User.findOne({ where: { email: normalizedEmail } })
    if (existingUser) {
      res.status(409).json({ error: 'An account with this email already exists. Please sign in.' })
      return
    }

    const existingRequest = await AccessRequest.findOne({
      where: {
        email: normalizedEmail,
        status: { [Op.in]: ['pending', 'approved'] },
      },
    })
    if (existingRequest) {
      const msg = existingRequest.status === 'pending'
        ? 'You have already applied for access. Please wait for administrator approval.'
        : 'An account with this email already exists. Please sign in or contact your administrator.'
      res.status(409).json({ error: msg })
      return
    }

    const request = await AccessRequest.create({
      full_name: normalizedName,
      email: normalizedEmail,
      company: company?.trim() || null,
      reason: reason?.trim() || null,
    })

    res.status(201).json({
      data: { id: request.id, full_name: request.full_name, email: request.email, status: request.status },
    })
  } catch (err) {
    console.error('Access request error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20))
    const { status, q } = req.query

    const where: Record<string, unknown> = {}
    if (status && ['pending', 'approved', 'rejected'].includes(status as string)) {
      where.status = status
    }
    if (q && typeof q === 'string') {
      where[Op.or as unknown as string] = [
        { full_name: { [Op.iLike]: `%${q}%` } },
        { email: { [Op.iLike]: `%${q}%` } },
      ]
    }

    const { count, rows } = await AccessRequest.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      offset: (page - 1) * limit,
      limit,
    })

    res.json({
      data: rows,
      meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    })
  } catch (err) {
    console.error('List access requests error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

function generateUsername(fullName: string, email: string): string {
  const fromName = fullName
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, '')
    .replace(/\s+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^[.\-_]+|[.\-_]+$/g, '')
  if (fromName.length >= 3) return fromName
  const fromEmail = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_.-]/g, '')
  return fromEmail || 'user'
}

async function ensureUniqueUsername(base: string): Promise<string> {
  const existing = await User.findOne({ where: { username: base } })
  if (!existing) return base
  for (let i = 1; i < 100; i++) {
    const candidate = `${base}${i}`
    const found = await User.findOne({ where: { username: candidate } })
    if (!found) return candidate
  }
  return `${base}${Date.now()}`
}

async function createUserFromRequest(request: AccessRequest): Promise<{ user: User; password: string }> {
  const baseUsername = generateUsername(request.full_name, request.email)
  const username = await ensureUniqueUsername(baseUsername)
  const password = crypto.randomBytes(12).toString('base64url')
  const password_hash = await bcrypt.hash(password, 12)

  const group = await Group.findByPk('00000000-0000-0000-0000-000000000003')
  const groupId = group ? group.id : null

  const orgName = request.company?.trim() || request.full_name

  const user = await sequelizeUsersDb.transaction(async (t) => {
    const created = await User.create({
      username,
      email: request.email,
      password_hash,
      display_name: request.full_name,
      group_id: groupId,
      must_change_password: true,
      status: 'active',
    }, { transaction: t })

    const org = await Organization.create({
      name: orgName,
      owner_user_id: created.id,
    }, { transaction: t })

    await created.update({ organization_id: org.id }, { transaction: t })
    return created
  })

  const defaultLink = await UpstreamProviderLink.findOne({ where: { is_default: true } })

  const app = await ConnectedApp.create({
    name: `My First App (${request.email})`,
    team: request.company?.trim() || request.full_name,
    env: 'development',
    primary_provider_id: defaultLink?.ai_provider_id || null,
    org_id: user.organization_id || null,
    owner: request.full_name,
    owner_email: request.email,
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
    owner: request.email,
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
    user_email: request.email,
    user_name: request.full_name,
  })

  triggerGatewayReload()

  return { user, password }
}

router.patch('/:id', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { status, admin_notes, full_name, company, reason, send_email } = req.body

    const request = await AccessRequest.findByPk(id)
    if (!request) {
      res.status(404).json({ error: 'Request not found' })
      return
    }

    const VALID_STATUSES = ['pending', 'approved', 'rejected'] as const

    let createdUser: { id: string; username: string; email: string } | null = null

    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        res.status(400).json({ error: 'Status must be "pending", "approved", or "rejected"' })
        return
      }

      if (status === 'approved' && request.status !== 'approved') {
        const existing = await User.findOne({ where: { email: request.email } })
        if (!existing) {
          const result = await createUserFromRequest(request)
          createdUser = { id: result.user.id, username: result.user.username, email: result.user.email }
          if (send_email !== false) {
            sendApprovalEmail(request.email, result.user.username, result.password, admin_notes?.trim() || undefined)
              .then(sent => {
                if (sent) console.log(`Approval email sent to ${request.email}`)
                else console.warn(`Approval email not sent to ${request.email} (SMTP not configured)`)
              })
          }
        }
      } else if (status === 'rejected' && request.status !== 'rejected' && send_email !== false) {
        sendRejectionEmail(request.email, admin_notes?.trim() || undefined)
          .then(sent => {
            if (sent) console.log(`Rejection email sent to ${request.email}`)
            else console.warn(`Rejection email not sent to ${request.email} (SMTP not configured)`)
          })
      }

      request.status = status
      if (status !== 'pending') {
        request.reviewed_by = (req as any).user?.id || null
        request.reviewed_at = new Date()
      } else {
        request.reviewed_by = null
        request.reviewed_at = null
      }
    }
    if (admin_notes !== undefined) request.admin_notes = admin_notes?.trim() || null
    if (full_name !== undefined) request.full_name = full_name.trim()
    if (company !== undefined) request.company = company?.trim() || null
    if (reason !== undefined) request.reason = reason?.trim() || null
    await request.save()

    const resp: any = { data: request }
    if (createdUser) {
      resp.meta = { created_user: createdUser }
    }
    res.json(resp)
  } catch (err) {
    console.error('Update access request error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/:id', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const request = await AccessRequest.findByPk(id)
    if (!request) {
      res.status(404).json({ error: 'Request not found' })
      return
    }
    await request.destroy()
    res.status(204).end()
  } catch (err) {
    console.error('Delete access request error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
