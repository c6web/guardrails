import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import type { JwtPayload } from '../types'

const GROUP_IDS = {
  admin:            '00000000-0000-0000-0000-000000000001',
  viewer:           '00000000-0000-0000-0000-000000000002',
  user:             '00000000-0000-0000-0000-000000000003',
  knowledge_admin:  '00000000-0000-0000-0000-000000000004',
} as const

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' })
    return
  }
  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload
    if ((payload as any).otp_pending) {
      res.status(401).json({ error: 'OTP verification required' })
      return
    }
    req.user = payload
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function isAdmin(req: Request): boolean {
  return req.user?.groupId === GROUP_IDS.admin
}

export function hasViewerOrAbove(req: Request): boolean {
  const gid = req.user?.groupId
  return gid === GROUP_IDS.admin || gid === GROUP_IDS.viewer
}

export function hasAccess(req: Request): boolean {
  const gid = req.user?.groupId
  return gid === GROUP_IDS.admin || gid === GROUP_IDS.viewer || gid === GROUP_IDS.user || gid === GROUP_IDS.knowledge_admin
}

export function canManageKnowledge(req: Request): boolean {
  const gid = req.user?.groupId
  return gid === GROUP_IDS.admin || gid === GROUP_IDS.knowledge_admin
}
