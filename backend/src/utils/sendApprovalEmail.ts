import nodemailer from 'nodemailer'
import { env } from '../config/env'
import { NotificationServer } from '../models/data-db/NotificationServer'
import { notificationDecrypt } from './gatewayKeyCrypto'

export async function sendApprovalEmail(to: string, username: string, password: string, adminNotes?: string): Promise<boolean> {
  return sendEmail('approved', to, { username, password, adminNotes })
}

export async function sendRejectionEmail(to: string, adminNotes?: string): Promise<boolean> {
  return sendEmail('rejected', to, { adminNotes })
}

async function sendEmail(
  type: 'approved' | 'rejected',
  to: string,
  opts: { username?: string; password?: string; adminNotes?: string },
): Promise<boolean> {
  try {
    let transporter: nodemailer.Transporter
    let fromAddr: string

    const smtpHost = env['SMTP_HOST'] as string | undefined
    if (smtpHost) {
      transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(env['SMTP_PORT'] ?? '587', 10),
        secure: env['SMTP_PORT'] === '465',
        requireTLS: env['SMTP_PORT'] !== '465',
        auth: env['SMTP_USER'] ? { user: env['SMTP_USER'], pass: env['SMTP_PASS'] } : undefined,
        connectionTimeout: 10_000,
      })
      fromAddr = env['SMTP_FROM'] || 'noreply@localhost'
    } else {
      const server = await NotificationServer.findOne({ where: { type: 'smtp' }, order: [['created_at', 'ASC']] })
      if (!server) return false

      const rawConfig = server.config as Record<string, unknown>
      const decrypted: Record<string, unknown> = { ...rawConfig }
      for (const key of ['password', 'api_key', 'secret', 'pass']) {
        const v = decrypted[key]
        if (v && typeof v === 'string' && (v.startsWith('enc:') || v.startsWith('v2:'))) {
          try { decrypted[key] = notificationDecrypt(v) } catch { /* keep encrypted */ }
        }
      }
      const port = parseInt((decrypted['port'] as string) ?? '587', 10)
      transporter = nodemailer.createTransport({
        host: decrypted['host'] as string,
        port,
        secure: port === 465,
        requireTLS: decrypted['tls'] === true && port !== 465,
        auth: decrypted['username'] ? { user: decrypted['username'] as string, pass: decrypted['password'] as string } : undefined,
        connectionTimeout: 10_000,
      })
      fromAddr = decrypted['from_name']
        ? `"${decrypted['from_name']}" <${decrypted['from_address']}>`
        : (decrypted['from_address'] as string) || env['SMTP_FROM'] || 'noreply@localhost'
    }

    const notesHtml = opts.adminNotes
      ? `<div style="background:#161B22;border:1px solid #21262D;border-radius:8px;padding:14px;margin-bottom:16px">
<div style="font-size:12px;color:#8A9490;margin-bottom:4px">Admin Notes</div>
<div style="font-size:13px;color:#A6B2AC;line-height:1.5">${escapeHtml(opts.adminNotes)}</div>
</div>`
      : ''
    const notesText = opts.adminNotes ? `\n\nAdmin notes:\n${opts.adminNotes}` : ''

    if (type === 'approved') {
      await transporter.sendMail({
        from: fromAddr,
        to,
        subject: 'Your AI Firewall Gateway Account Has Been Approved',
        text: [
          `Your access request has been approved.`,
          ``,
          `Username: ${opts.username}`,
          `Temporary password: ${opts.password}`,
          ``,
          `IMPORTANT: You must change your password on first login.`,
          `For security reasons, no sign-in link is included in this email.`,
          `Contact your administrator for the console URL.`,
          notesText,
          ``,
          `If you did not apply for access, please ignore this email.`,
          `If you did request access but have questions, please contact your administrator.`,
        ].join('\n'),
        html: `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#0D1117;padding:48px 24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
<tr><td align="center">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;width:100%;background:#1C232D;border-radius:10px;border:1px solid #21262D">
<tr><td style="padding:40px 36px 20px;text-align:center">
<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 1024 1024" style="display:block;margin:0 auto 20px">
<rect x="110" y="110" width="804" height="804" rx="180" ry="180" fill="none" stroke="#76B400" stroke-width="30"/>
<g transform="translate(0,1024) scale(0.1,-0.1)" fill="#76B400">
<path d="M4410 7064 c-452 -43 -767 -179 -1035 -448 -122 -122 -209 -237 -278 -366 -45 -84 -64 -129 -285 -660 -100 -238 -164 -392 -324 -775 -28 -66 -88 -209 -134 -317 -104 -245 -146 -367 -175 -498 -76 -356 72 -656 379 -767 162 -59 93 -56 1400 -60 1332 -5 1270 -8 1140 58 -278 140 -445 377 -489 693 l-12 86 -639 0 c-691 0 -677 -1 -728 55 -21 23 -25 36 -25 93 0 63 7 84 122 357 66 160 154 369 193 465 64 156 99 239 237 570 105 251 187 440 208 476 30 51 100 116 157 145 105 54 86 53 889 56 l745 4 154 162 c84 89 196 207 249 262 296 306 361 376 361 389 0 8 -15 16 -37 20 -38 6 -2007 6 -2073 0z"/>
<path d="M7053 7063 c-40 -4 -50 -13 -230 -206 -103 -111 -303 -323 -443 -472 -980 -1036 -1079 -1147 -1258 -1401 -391 -556 -452 -1166 -149 -1490 220 -236 584 -347 1028 -315 746 55 1379 509 1652 1187 138 342 149 664 30 904 -81 162 -252 291 -468 352 -85 24 -326 33 -422 15 -36 -6 -43 -5 -43 9 0 8 88 109 196 222 109 114 339 358 513 542 173 184 377 399 454 478 87 90 137 150 135 160 -3 16 -41 17 -478 18 -261 0 -494 -1 -517 -3z m-432 -2149 c59 -28 115 -78 140 -126 85 -166 -37 -504 -239 -663 -126 -101 -277 -155 -427 -155 -304 0 -420 189 -304 493 72 187 225 355 387 425 130 55 349 68 443 26z"/>
</g></svg>
<div style="font-size:13px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#8A9490;margin-bottom:4px">GenAI Firewall Gateway</div>
<div style="font-size:22px;font-weight:700;color:#E8EBE0;margin-bottom:20px">Account Approved</div>
<div style="font-size:14px;color:#A6B2AC;line-height:1.6;margin-bottom:24px;text-align:left">
<p style="margin:0 0 12px">Your access request has been approved. Use the credentials below to sign in.</p>
<div style="background:#161B22;border:1px solid #21262D;border-radius:8px;padding:16px;margin-bottom:16px">
<div style="font-size:12px;color:#8A9490;margin-bottom:2px">Username</div>
<div style="font-size:16px;font-weight:600;color:#E8EBE0;font-family:SF Mono,Menlo,Courier,monospace">${opts.username}</div>
<div style="font-size:12px;color:#8A9490;margin:12px 0 2px">Temporary password</div>
<div style="font-size:16px;font-weight:600;color:#76B400;font-family:SF Mono,Menlo,Courier,monospace;letter-spacing:1px">${opts.password}</div>
</div>
<div style="background:rgba(185,134,11,0.12);border:1px solid rgba(185,134,11,0.3);border-radius:8px;padding:12px 14px;margin-bottom:16px">
<div style="font-size:12px;font-weight:600;color:#D9A32E;margin-bottom:4px">Security Notice</div>
<div style="font-size:12px;color:#A6B2AC;line-height:1.5">For security reasons, no sign-in link is included in this email. Contact your administrator for the console URL and sign in using the credentials above. You must change your password on first login.</div>
</div>
${notesHtml}
</div>
<div style="font-size:12px;color:#8A9490;line-height:1.5;margin-bottom:20px">If you did not apply for access, please ignore this email.<br>If you did request access but have questions, please contact your administrator.</div>
</td></tr>
<tr><td style="padding:0 36px 28px;text-align:center">
<div style="height:1px;background:#21262D;margin-bottom:20px"></div>
<div style="font-size:11px;color:#8A9490">Guardrails — AI Firewall Gateway</div>
</td></tr>
</table>
</td></tr></table>`,
      })
    } else {
      await transporter.sendMail({
        from: fromAddr,
        to,
        subject: 'Your AI Firewall Gateway Access Request',
        text: [
          `Your access request has been reviewed.`,
          ``,
          `Unfortunately, your request for access has been declined.`,
          notesText,
          ``,
          `If you did not apply for access, please ignore this email.`,
          `If you have questions, please contact your administrator.`,
        ].join('\n'),
        html: `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#0D1117;padding:48px 24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
<tr><td align="center">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;width:100%;background:#1C232D;border-radius:10px;border:1px solid #21262D">
<tr><td style="padding:40px 36px 20px;text-align:center">
<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 1024 1024" style="display:block;margin:0 auto 20px">
<rect x="110" y="110" width="804" height="804" rx="180" ry="180" fill="none" stroke="#76B400" stroke-width="30"/>
<g transform="translate(0,1024) scale(0.1,-0.1)" fill="#76B400">
<path d="M4410 7064 c-452 -43 -767 -179 -1035 -448 -122 -122 -209 -237 -278 -366 -45 -84 -64 -129 -285 -660 -100 -238 -164 -392 -324 -775 -28 -66 -88 -209 -134 -317 -104 -245 -146 -367 -175 -498 -76 -356 72 -656 379 -767 162 -59 93 -56 1400 -60 1332 -5 1270 -8 1140 58 -278 140 -445 377 -489 693 l-12 86 -639 0 c-691 0 -677 -1 -728 55 -21 23 -25 36 -25 93 0 63 7 84 122 357 66 160 154 369 193 465 64 156 99 239 237 570 105 251 187 440 208 476 30 51 100 116 157 145 105 54 86 53 889 56 l745 4 154 162 c84 89 196 207 249 262 296 306 361 376 361 389 0 8 -15 16 -37 20 -38 6 -2007 6 -2073 0z"/>
<path d="M7053 7063 c-40 -4 -50 -13 -230 -206 -103 -111 -303 -323 -443 -472 -980 -1036 -1079 -1147 -1258 -1401 -391 -556 -452 -1166 -149 -1490 220 -236 584 -347 1028 -315 746 55 1379 509 1652 1187 138 342 149 664 30 904 -81 162 -252 291 -468 352 -85 24 -326 33 -422 15 -36 -6 -43 -5 -43 9 0 8 88 109 196 222 109 114 339 358 513 542 173 184 377 399 454 478 87 90 137 150 135 160 -3 16 -41 17 -478 18 -261 0 -494 -1 -517 -3z m-432 -2149 c59 -28 115 -78 140 -126 85 -166 -37 -504 -239 -663 -126 -101 -277 -155 -427 -155 -304 0 -420 189 -304 493 72 187 225 355 387 425 130 55 349 68 443 26z"/>
</g></svg>
<div style="font-size:13px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#8A9490;margin-bottom:4px">GenAI Firewall Gateway</div>
<div style="font-size:22px;font-weight:700;color:#E8EBE0;margin-bottom:20px">Access Request Declined</div>
<div style="font-size:14px;color:#A6B2AC;line-height:1.6;margin-bottom:24px;text-align:left">
<p style="margin:0 0 12px">Your access request has been reviewed. Unfortunately, your request for access has been declined.</p>
${notesHtml}
</div>
<div style="font-size:12px;color:#8A9490;line-height:1.5;margin-bottom:20px">If you did not apply for access, please ignore this email.<br>If you have questions, please contact your administrator.</div>
</td></tr>
<tr><td style="padding:0 36px 28px;text-align:center">
<div style="height:1px;background:#21262D;margin-bottom:20px"></div>
<div style="font-size:11px;color:#8A9490">Guardrails — AI Firewall Gateway</div>
</td></tr>
</table>
</td></tr></table>`,
      })
    }

    return true
  } catch (err) {
    console.warn(`Failed to send ${type} email:`, (err as Error).message)
    return false
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
