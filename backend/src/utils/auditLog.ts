import type { Request } from 'express'
import { AuditLog } from '../models/logs-db/AuditLog'

function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for']
  return (typeof fwd === 'string' ? fwd.split(',')[0].trim() : null) ?? req.ip ?? '0.0.0.0'
}

export async function logAudit(
  req: Request,
  action: string,
  resourceType: string,
  resourceId: string,
  details: object = {},
): Promise<void> {
  if (!req.user) return
  try {
    await AuditLog.create({
      actor_id:      req.user.userId,
      actor_email:   req.user.email,
      action,
      resource_type: resourceType,
      resource_id:   resourceId,
      details,
      ip_address:    clientIp(req),
    })
  } catch { /* non-blocking */ }
}
