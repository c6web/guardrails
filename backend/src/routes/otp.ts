import type { Request, Response } from 'express';
import { Router } from 'express'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { User } from '../models/users-db/User'
import { RefreshToken } from '../models/users-db/RefreshToken'
import { Group } from '../models/data-db/Group'
import { generateAndSendOtp, verifyOtp, logOtpVerifyEvent, isOtpAvailable } from '../utils/otp'
import { env } from '../config/env'
import { UserActivityLog } from '../models/logs-db/UserActivityLog'

const router = Router()

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

// POST /api/auth/otp/send — sends OTP to user's email
router.post('/send', async (req: Request, res: Response): Promise<void> => {
  try {
    const available = await isOtpAvailable()
    if (!available) {
      res.status(400).json({ error: 'OTP is not available — configure an email provider first' })
      return
    }

    const { username, password, otp_pending_token } = req.body as Record<string, unknown>

    // Case 1: Login flow with otp_pending_token
    if (otp_pending_token && typeof otp_pending_token === 'string') {
      let decoded: any
      try {
        decoded = jwt.verify(otp_pending_token, env.JWT_SECRET, { algorithms: ['HS256'] })
      } catch {
        res.status(401).json({ error: 'Invalid or expired OTP challenge' })
        return
      }

      if (!decoded.otp_pending) {
        res.status(401).json({ error: 'Invalid OTP challenge token' })
        return
      }

      const user = await User.findByPk(decoded.userId)
      if (!user) {
        res.status(401).json({ error: 'Invalid credentials' })
        return
      }

      if (!user.otp_enabled) {
        res.status(403).json({ error: 'OTP is not enabled for this account' })
        return
      }

      const ip = req.socket?.remoteAddress ?? req.ip ?? '0.0.0.0'
      const result = await generateAndSendOtp(user.email, ip)

      if (!result.success) {
        res.status(500).json({ error: `Failed to send OTP: ${result.error}` })
        return
      }

      res.json({ success: true, message: 'OTP sent to your email', ref_code: result.ref_code })
      return
    }

    // Case 2: Legacy flow with username + password
    if (!username || !password) {
      res.status(400).json({ error: 'username and password or otp_pending_token are required' })
      return
    }

    const user = await User.findOne({ where: { username: username as string } })
    const DUMMY_HASH = '$2a$12$invalidhashfortimingnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn..'
    const hashToCompare = user ? user.password_hash : DUMMY_HASH
    let valid: boolean
    try { valid = await bcrypt.compare(password as string, hashToCompare) } catch { valid = false }

    if (!user || !valid) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    if (!user.otp_enabled) {
      res.status(403).json({ error: 'OTP is not enabled for this account' })
      return
    }

    const ip = req.socket?.remoteAddress ?? req.ip ?? '0.0.0.0'
    const result = await generateAndSendOtp(user.email, ip)

    if (!result.success) {
      res.status(500).json({ error: `Failed to send OTP: ${result.error}` })
      return
    }

    res.json({ success: true, message: 'OTP sent to your email', ref_code: result.ref_code })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/auth/otp/verify — verifies OTP code
router.post('/verify', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, code, otp_pending_token } = req.body as Record<string, unknown>
    if (!code) {
      res.status(400).json({ error: 'code is required' })
      return
    }

    // Case 1: Login flow with otp_pending_token
    if (otp_pending_token && typeof otp_pending_token === 'string') {
      let decoded: any
      try {
        decoded = jwt.verify(otp_pending_token, env.JWT_SECRET, { algorithms: ['HS256'] })
      } catch {
        res.status(401).json({ error: 'Invalid or expired OTP challenge' })
        return
      }

      if (!decoded.otp_pending) {
        res.status(401).json({ error: 'Invalid OTP challenge token' })
        return
      }

      const user = await User.findByPk(decoded.userId)
      if (!user) {
        res.status(401).json({ error: 'Invalid credentials' })
        return
      }

      const valid = await verifyOtp(user.email, code as string)
      await logOtpVerifyEvent(user.email, user.id, valid)

      if (!valid) {
        res.status(401).json({ error: 'Invalid or expired OTP code' })
        return
      }

      // Mark email as verified (first-time use)
      if (!user.otp_verified_at) {
        user.otp_verified_at = new Date()
        await user.save()
      }

      // Issue full access token + refresh token (same as auth.ts login)
      const groupId = user.group_id ?? null
      const groupRole = user.group_id
        ? (await Group.findOne({ where: { id: user.group_id }, attributes: ['role'] }))?.role ?? 'user'
        : 'user'
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

      res.cookie('refreshToken', rawRefresh, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      })

      user.last_seen_at = new Date()
      await user.save()

      try {
        await UserActivityLog.create({
          user_id: user.id,
          user_email: user.email,
          activity_type: 'login',
          details: { username: user.username, groupId, otp: true },
          ip_address: req.socket?.remoteAddress ?? req.ip ?? '0.0.0.0',
        })
      } catch {}

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
      return
    }

    // Case 2: Legacy flow with username + code
    if (!username) {
      res.status(400).json({ error: 'username and code, or otp_pending_token and code are required' })
      return
    }

    const user = await User.findOne({ where: { username: username as string } })
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    const valid = await verifyOtp(user.email, code as string)
    await logOtpVerifyEvent(user.email, user.id, valid)

    if (!valid) {
      res.status(401).json({ error: 'Invalid or expired OTP code' })
      return
    }

    // Mark email as verified (first-time use)
    if (!user.otp_verified_at) {
      user.otp_verified_at = new Date()
      await user.save()
    }

    res.json({ success: true, message: 'OTP verified' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
