import type { Request, Response } from 'express';
import { Router } from 'express'
import { Op } from 'sequelize'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { User } from '../models/users-db/User'
import { RefreshToken } from '../models/users-db/RefreshToken'
import { Group } from '../models/data-db/Group'
import { PasswordPolicy } from '../models/data-db/PasswordPolicy'
import { UserActivityLog } from '../models/logs-db/UserActivityLog'
import { env } from '../config/env'
import { isTrustedProxy } from '../utils/validateEndpoint'




function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for']
  const peer = req.socket?.remoteAddress ?? req.ip
  if (typeof forwarded === 'string' && env.TRUSTED_PROXY_DEPTH > 0 && isTrustedProxy(peer, env.TRUSTED_PROXY_CIDR)) {
    return forwarded.split(',')[0].trim()
  }
  return peer ?? '0.0.0.0'
}

async function writeActivity(
  activityType: string,
  userId: string | null,
  userEmail: string,
  details: object,
  ip: string,
) {
  try {
    await UserActivityLog.create({ user_id: userId, user_email: userEmail, activity_type: activityType, details, ip_address: ip })
  } catch { /* never block auth for logging failures */ }
}

const router = Router()

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

async function validatePassword(password: string): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = []
  try {
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
  } catch { /* non-blocking */ }

  return { valid: errors.length === 0, errors }
}

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body as { username?: string; password?: string }
    if (!username || !password) {
      res.status(400).json({ error: 'username and password are required' })
      return
    }

    const user = await User.findOne({ where: { username } })
    const DUMMY_HASH = '$2a$12$invalidhashfortimingnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn..'
    const hashToCompare = user ? user.password_hash : DUMMY_HASH
    let valid: boolean
    try { valid = await bcrypt.compare(password, hashToCompare) } catch { valid = false }

    if (!user || !valid) {
      await writeActivity('login_failed', user?.id ?? null, user?.email ?? username, { username, reason: 'invalid_credentials' }, clientIp(req))
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }
    if (user.status === 'suspended') {
      await writeActivity('login_blocked', user.id, user.email, { username, reason: 'account_suspended' }, clientIp(req))
      res.status(403).json({ error: 'Account suspended' })
      return
    }

    // Note: must_change_password flag is returned in the user object so frontend can redirect to setup page

    // Check password expiry and grace period
    const policy = await PasswordPolicy.findByPk(1)
    const now = new Date()
    if (policy?.max_age_days) {
      const changedAt = user.password_changed_at ?? user.created_at
      const expiresAt = new Date(changedAt)
      expiresAt.setDate(expiresAt.getDate() + policy.max_age_days)

      if (now > expiresAt) {
        // Password has expired, start grace period if not already in one
        if (!user.password_grace_until) {
          const graceUntil = new Date()
          graceUntil.setDate(graceUntil.getDate() + (policy.grace_period_days ?? 7))
          user.password_grace_until = graceUntil
          await user.save()
        }

        if (now > user.password_grace_until!) {
          // Grace period expired — deny login
          await writeActivity('login_blocked', user.id, user.email, { username, reason: 'password_expired' }, clientIp(req))
          res.status(403).json({ error: 'password_expired', message: 'Your password has expired. Contact your administrator to reset it.' })
          return
        }

        // Within grace period — allow login but include warning
      }
    }

    // If user has email OTP enabled, issue short-lived otp_pending token instead of full access
    if (user.otp_enabled) {
      const otpPendingToken = jwt.sign(
        { userId: user.id, username: user.username, groupId: user.group_id, email: user.email, otp_pending: true, otp_type: 'email' },
        env.JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '5m' }
      )
      res.json({ otp_required: true, otp_type: 'email', otp_pending_token: otpPendingToken })
      return
    }

    const groupId = user.group_id ?? null
    const groupRole = user.group_id ? (await Group.findOne({ where: { id: user.group_id }, attributes: ['role'] }))?.role ?? 'user' : 'user'
    const accessToken = jwt.sign(
      { userId: user.id, username: user.username, display_name: user.display_name, groupId, email: user.email, role: groupRole },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '15m' }
    )

    const rawRefresh = crypto.randomBytes(32).toString('hex')
    const tokenHash = hashToken(rawRefresh)
    await RefreshToken.create({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: addDays(new Date(), 7),
      revoked: false,
    })

    user.last_seen_at = new Date()
    await user.save()

    await writeActivity('login', user.id, user.email, { username: user.username, groupId }, clientIp(req))

    res.cookie('refreshToken', rawRefresh, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    const group = groupId ? await Group.findByPk(groupId) : null
      res.json({
       accessToken,
       user: {
         id: user.id,
         username: user.username,
         display_name: user.display_name,
         email: user.email,
         role: groupRole,
         groupId,
         groupName: group?.name ?? null,
         must_change_password: user.must_change_password,
       },
     })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/auth/force-password-change — forced password change (no current password required)
router.post('/force-password-change', async (req: Request, res: Response): Promise<void> => {
  try {
    const { new_password } = req.body as { new_password?: string }
    if (!new_password || new_password.length < 8) {
      res.status(400).json({ error: 'new_password is required and must be at least 8 characters' })
      return
    }

    const validation = await validatePassword(new_password)
    if (!validation.valid) {
      res.status(400).json({ error: 'Invalid password', details: validation.errors })
      return
    }

    const authHeader = req.headers.authorization as string | undefined
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authorization required' })
      return
    }

    const token = authHeader.substring(7)
    let decoded: { userId: string; username: string; otp_pending?: boolean }
    try {
      decoded = jwt.verify(token, env.JWT_SECRET as string, { algorithms: ['HS256'] }) as { userId: string; username: string; otp_pending?: boolean }
    } catch {
      res.status(401).json({ error: 'Invalid token' })
      return
    }
    if (decoded.otp_pending) {
      res.status(401).json({ error: 'OTP verification required' })
      return
    }

    const user = await User.findByPk(decoded.userId)
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    if (!user.must_change_password) {
      res.status(403).json({ error: 'Password setup not required' })
      return
    }

    const newHash = await bcrypt.genSalt(12).then(salt => bcrypt.hash(new_password, salt))
    user.password_hash = newHash
    user.must_change_password = false
    user.password_changed_at = new Date()
    user.password_grace_until = null
    await user.save()

    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = req.cookies?.refreshToken as string | undefined
    if (!raw) {
      res.status(401).json({ error: 'No refresh token' })
      return
    }

    const hash = hashToken(raw)
    let token = await RefreshToken.findOne({ where: { token_hash: hash, revoked: false } })
    if (!token) {
      token = await RefreshToken.findOne({ where: { token_hash: hash } })
      if (token) {
        if (token.revoked) {
          // Token reuse detected — revoke all remaining valid tokens for this user
          await RefreshToken.update({ revoked: true }, { where: { user_id: token.user_id, revoked: false } })
          try {
            await UserActivityLog.create({
              user_id: token.user_id, user_email: '',
              activity_type: 'token_reuse_detected',
              details: { token_hash: hash.substring(0, 16) },
              ip_address: '0.0.0.0',
            })
          } catch {}
          res.status(401).json({ error: 'Invalid or expired refresh token' })
          return
        }
        if (token.expires_at < new Date()) {
          token.revoked = true
          await token.save()
          res.status(401).json({ error: 'Invalid or expired refresh token' })
          return
        }
      }
    }
    if (!token) {
      res.status(401).json({ error: 'Invalid or expired refresh token' })
      return
    }

    if (token.expires_at < new Date()) {
      token.revoked = true
      await token.save()
      res.status(401).json({ error: 'Invalid or expired refresh token' })
      return
    }

    const user = await User.findByPk(token.user_id)
    if (!user) {
      res.status(401).json({ error: 'User not found' })
      return
    }

    // Rotate token
    token.revoked = true
    await token.save()

    const newRaw = crypto.randomBytes(32).toString('hex')
    const newHash = hashToken(newRaw)
    await RefreshToken.create({
      user_id: user.id,
      token_hash: newHash,
      expires_at: addDays(new Date(), 7),
      revoked: false,
    })

    res.cookie('refreshToken', newRaw, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    const groupId = user.group_id ?? null
    const groupRoleRefresh = user.group_id ? (await Group.findOne({ where: { id: user.group_id }, attributes: ['role'] }))?.role ?? 'user' : 'user'
    const accessToken = jwt.sign(
      { userId: user.id, username: user.username, display_name: user.display_name, groupId, email: user.email, role: groupRoleRefresh },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '15m' }
    )
    // Prune expired tokens (fire-and-forget)
    RefreshToken.destroy({ where: { expires_at: { [Op.lt]: new Date() } } }).catch(() => {})

    res.json({ accessToken })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/auth/me — returns current user's full profile
router.get('/me', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
    const user = await User.findByPk(req.user.userId)
    if (!user) { res.status(404).json({ error: 'User not found' }); return }
    const { password_hash: _ph, ...safe } = user.toJSON() as unknown as Record<string, unknown>
    void _ph
    res.json({ data: { ...safe, must_change_password: user.must_change_password } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/auth/logout
router.post('/logout', async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = req.cookies?.refreshToken as string | undefined
    if (raw) {
      const hash = hashToken(raw)
      const token = await RefreshToken.findOne({ where: { token_hash: hash } })
      if (token) {
        token.revoked = true
        await token.save()
        const user = await User.findByPk(token.user_id)
        if (user) {
          await writeActivity('logout', user.id, user.email, { username: user.username }, clientIp(req))
        }
      }
    }
    res.clearCookie('refreshToken')
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
