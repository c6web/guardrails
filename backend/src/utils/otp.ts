import crypto from 'crypto'
import nodemailer from 'nodemailer'
import { env } from '../config/env'
import { NotificationServer } from '../models/data-db/NotificationServer'
import { User } from '../models/users-db/User'
import { UserActivityLog } from '../models/logs-db/UserActivityLog'
import { notificationDecrypt } from './gatewayKeyCrypto'

const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

export async function isOtpAvailable(): Promise<boolean> {
  const smtpHost = env['SMTP_HOST'] as string | undefined
  if (smtpHost) return true
  try {
    const count = await NotificationServer.count({ where: { type: 'smtp' } })
    return count > 0
  } catch {
    return false
  }
}

function generateRefCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let ref = ''
  for (let i = 0; i < 6; i++) ref += chars[crypto.randomInt(chars.length)]
  return ref
}

export async function generateAndSendOtp(email: string, ip: string): Promise<{ success: boolean; error?: string; ref_code?: string }> {
  const available = await isOtpAvailable()
  if (!available) {
    return { success: false, error: 'SMTP not configured. Cannot send OTP.' }
  }

  const user = await User.findOne({ where: { email } })
  if (!user) {
    return { success: false, error: 'User not found.' }
  }

  const code = String(crypto.randomInt(100000, 999999))
  const refCode = generateRefCode()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

  user.otp_code_hash = hashCode(code)
  user.otp_expires_at = expiresAt
  user.otp_attempts = 0
  user.otp_locked_until = null
  await user.save()

  // Build transporter & from address — use SMTP_HOST env var first, fall back to first SMTP notification server
  let transporter: nodemailer.Transporter
  let fromAddr: string
  const smtpHost = env['SMTP_HOST'] as string | undefined
  if (smtpHost) {
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(env['SMTP_PORT'] ?? '587', 10),
      secure: (env['SMTP_PORT'] === '465'),
      requireTLS: env['SMTP_PORT'] !== '465',
      auth: env['SMTP_USER'] ? { user: env['SMTP_USER'], pass: env['SMTP_PASS'] } : undefined,
      connectionTimeout: 10_000,
    })
    fromAddr = env['SMTP_FROM'] || 'noreply@localhost'
  } else {
    const server = await NotificationServer.findOne({ where: { type: 'smtp' }, order: [['created_at', 'ASC']] })
    if (!server) {
      return { success: false, error: 'SMTP not configured. Cannot send OTP.' }
    }
    const rawConfig = server.config as Record<string, unknown>
    const decrypted = (obj: Record<string, unknown>): Record<string, unknown> => {
      const out: Record<string, unknown> = { ...obj }
      for (const key of ['password', 'api_key', 'secret', 'pass']) {
        const v = out[key]
        if (v && typeof v === 'string' && (v.startsWith('enc:') || v.startsWith('v2:'))) {
          try { out[key] = notificationDecrypt(v) } catch { /* keep encrypted */ }
        }
      }
      return out
    }
    const config = decrypted(rawConfig)
    const port = parseInt((config['port'] as string) ?? '587', 10)
    transporter = nodemailer.createTransport({
      host: config['host'] as string,
      port,
      secure: port === 465,
      requireTLS: config['tls'] === true && port !== 465,
      auth: config['username'] ? { user: config['username'] as string, pass: config['password'] as string } : undefined,
      connectionTimeout: 10_000,
    })
    fromAddr = config['from_name']
      ? `"${config['from_name']}" <${config['from_address']}>`
      : (config['from_address'] as string) || env['SMTP_FROM'] || 'noreply@localhost'
  }

  try {
    await transporter.sendMail({
      from: fromAddr,
      to: email,
      subject: 'AI Firewall Gateway — OTP Code',
      text: `Your one-time password is: ${code}\n\nThis code expires in 5 minutes.\n\nIf you did not request this code, ignore this email.`,
      html: `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#0D1117;padding:48px 24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
<tr><td align="center">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;width:100%;background:#1C232D;border-radius:10px;border:1px solid #21262D">
<tr><td style="padding:40px 36px 32px;text-align:center">
<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 1024 1024" style="display:block;margin:0 auto 20px">
<rect x="110" y="110" width="804" height="804" rx="180" ry="180" fill="none" stroke="#76B400" stroke-width="30"/>
<g transform="translate(0,1024) scale(0.1,-0.1)" fill="#76B400">
<path d="M4410 7064 c-452 -43 -767 -179 -1035 -448 -122 -122 -209 -237 -278 -366 -45 -84 -64 -129 -285 -660 -100 -238 -164 -392 -324 -775 -28 -66 -88 -209 -134 -317 -104 -245 -146 -367 -175 -498 -76 -356 72 -656 379 -767 162 -59 93 -56 1400 -60 1332 -5 1270 -8 1140 58 -278 140 -445 377 -489 693 l-12 86 -639 0 c-691 0 -677 -1 -728 55 -21 23 -25 36 -25 93 0 63 7 84 122 357 66 160 154 369 193 465 64 156 99 239 237 570 105 251 187 440 208 476 30 51 100 116 157 145 105 54 86 53 889 56 l745 4 154 162 c84 89 196 207 249 262 296 306 361 376 361 389 0 8 -15 16 -37 20 -38 6 -2007 6 -2073 0z"/>
<path d="M7053 7063 c-40 -4 -50 -13 -230 -206 -103 -111 -303 -323 -443 -472 -980 -1036 -1079 -1147 -1258 -1401 -391 -556 -452 -1166 -149 -1490 220 -236 584 -347 1028 -315 746 55 1379 509 1652 1187 138 342 149 664 30 904 -81 162 -252 291 -468 352 -85 24 -326 33 -422 15 -36 -6 -43 -5 -43 9 0 8 88 109 196 222 109 114 339 358 513 542 173 184 377 399 454 478 87 90 137 150 135 160 -3 16 -41 17 -478 18 -261 0 -494 -1 -517 -3z m-432 -2149 c59 -28 115 -78 140 -126 85 -166 -37 -504 -239 -663 -126 -101 -277 -155 -427 -155 -304 0 -420 189 -304 493 72 187 225 355 387 425 130 55 349 68 443 26z"/>
</g></svg>
<div style="font-size:13px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#8A9490;margin-bottom:8px">GenAI Firewall Gateway</div>
<div style="font-size:20px;font-weight:700;color:#E8EBE0;margin-bottom:24px">One-time password</div>
<div style="font-size:13px;color:#A6B2AC;line-height:1.6;margin-bottom:28px">Use the code below to complete your sign-in. This code expires in <strong style="color:#E8EBE0">5 minutes</strong>.</div>
<div style="background:#161B22;border:1px solid #21262D;border-radius:8px;padding:20px 16px;margin-bottom:24px;letter-spacing:12px;font-size:36px;font-weight:700;color:#76B400;font-family:SF Mono,Menlo,Courier,monospace">${code}</div>
<div style="display:inline-block;border:1px solid #21262D;border-radius:6px;padding:8px 16px;margin-bottom:24px;font-size:12px;color:#8A9490;font-family:SF Mono,Menlo,Courier,monospace;letter-spacing:2px">Ref: ${refCode}</div>
<div style="font-size:12px;color:#8A9490;line-height:1.5">If you did not request this code, you can safely ignore this email.<br>No one can sign in to your account without access to this email.</div>
</td></tr>
<tr><td style="padding:0 36px 28px;text-align:center">
<div style="height:1px;background:#21262D;margin-bottom:20px"></div>
<div style="font-size:11px;color:#8A9490">Guardrails — AI Firewall Gateway</div>
</td></tr>
</table>
</td></tr></table>`,
    })

    // Log the send event (never log the OTP)
    try {
      await UserActivityLog.create({
        user_id: null,
        user_email: email,
        activity_type: 'otp_send',
        details: { ip_address: ip },
        ip_address: ip,
      })
    } catch { /* non-critical */ }

    return { success: true, ref_code: refCode }
  } catch (err) {
    user.otp_code_hash = null
    user.otp_expires_at = null
    user.otp_attempts = 0
    user.otp_locked_until = null
    await user.save()
    return { success: false, error: (err as Error).message }
  }
}

export async function verifyOtp(email: string, code: string): Promise<boolean> {
  const now = new Date()

  const user = await User.findOne({ where: { email } })
  if (!user) return false

  if (user.otp_locked_until && user.otp_locked_until > now) {
    return false
  }

  if (!user.otp_code_hash || !user.otp_expires_at) {
    return false
  }

  if (user.otp_expires_at < now) {
    user.otp_code_hash = null
    user.otp_expires_at = null
    user.otp_attempts = 0
    await user.save()
    return false
  }

  const incomingHash = hashCode(code)
  if (crypto.timingSafeEqual(Buffer.from(user.otp_code_hash), Buffer.from(incomingHash))) {
    user.otp_code_hash = null
    user.otp_expires_at = null
    user.otp_attempts = 0
    user.otp_locked_until = null
    await user.save()
    return true
  }

  user.otp_attempts++
  if (user.otp_attempts >= MAX_ATTEMPTS) {
    user.otp_locked_until = new Date(now.getTime() + LOCKOUT_MS)
  }
  await user.save()
  return false
}

export async function logOtpVerifyEvent(email: string, userId: string | null, success: boolean): Promise<void> {
  try {
    await UserActivityLog.create({
      user_id: userId,
      user_email: email,
      activity_type: 'otp_verify',
      details: { success },
      ip_address: '0.0.0.0',
    })
  } catch { /* non-critical */ }
}
