import type { Request, Response } from 'express';
import { Router } from 'express'
import { PasswordPolicy } from '../models/data-db/PasswordPolicy'
import { AdminActivityLog } from '../models/logs-db/AdminActivityLog'
import { requireAuth, isAdmin, hasViewerOrAbove } from '../middleware/auth'
import { logAudit } from '../utils/auditLog'

function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for']
  return (typeof fwd === 'string' ? fwd.split(',')[0].trim() : null) ?? req.ip ?? '0.0.0.0'
}

async function logAdmin(
  req: Request,
  action: string,
  before?: object | null,
  after?: object | null,
) {
  if (!req.user) return
  try {
    await AdminActivityLog.create({
      admin_id: req.user.userId,
      admin_email: req.user.email,
      action,
      target_type: 'password_policy',
      target_id: 'global',
      before_state: before ?? null,
      after_state: after ?? null,
      ip_address: clientIp(req),
    })
  } catch { /* never block request for logging failures */ }
}

const router = Router()

// GET /api/password-policy — retrieve current password policy
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!hasViewerOrAbove(req)) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return
    }

    const policy = await PasswordPolicy.findByPk(1)
    if (!policy) {
      res.status(404).json({ error: 'Password policy not configured' })
      return
    }

    res.json({ data: policy.toJSON() })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/password-policy — update password policy (admin only)
router.patch('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) {
      res.status(403).json({ error: 'Admin access required' })
      return
    }

    const policy = await PasswordPolicy.findByPk(1)
    if (!policy) {
      res.status(404).json({ error: 'Password policy not configured' })
      return
    }

    const {
      max_age_days,
      grace_period_days,
      min_length,
      require_uppercase,
      require_lowercase,
      require_numbers,
      require_symbols,
    } = req.body as Record<string, unknown>

    const before = policy.toJSON()
    const updates: Record<string, unknown> = {}

    if (max_age_days !== undefined) updates['max_age_days'] = max_age_days === null ? null : Math.max(0, parseInt(max_age_days as string, 10))
    if (grace_period_days !== undefined) updates['grace_period_days'] = Math.max(0, parseInt(grace_period_days as string, 10))
    if (min_length !== undefined) updates['min_length'] = Math.max(1, parseInt(min_length as string, 10))
    if (require_uppercase !== undefined) updates['require_uppercase'] = Boolean(require_uppercase)
    if (require_lowercase !== undefined) updates['require_lowercase'] = Boolean(require_lowercase)
    if (require_numbers !== undefined) updates['require_numbers'] = Boolean(require_numbers)
    if (require_symbols !== undefined) updates['require_symbols'] = Boolean(require_symbols)

    await policy.update(updates)
    const after = policy.toJSON()

    await logAdmin(req, 'password_policy.update', before, after)
    await logAudit(req, 'password_policy.update', 'password_policy', 'global', { changed_fields: Object.keys(updates) })

    res.json({ data: after })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
