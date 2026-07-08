import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { isAdmin, hasViewerOrAbove, hasAccess, canManageKnowledge } from './auth'
import { env } from '../config/env'
import type { JwtPayload } from '../types'

function extractUser(req: Request, res: Response): boolean {
  if (req.user) return true
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' })
    return false
  }
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload
    if ((payload as any).otp_pending) {
      res.status(401).json({ error: 'OTP verification required' })
      return false
    }
    req.user = payload
    return true
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
    return false
  }
}

export function requireRole(...roles: string[]) {
  const groupIdChecks: Record<string, (req: Request) => boolean> = {
    admin: isAdmin,
    viewer: hasViewerOrAbove,
    user: hasAccess,
    knowledge_admin: canManageKnowledge,
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!extractUser(req, res)) return

    if (roles.length === 0) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    for (const role of roles) {
      const check = groupIdChecks[role]
      if (check && check(req)) {
        next()
        return
      }
    }

    res.status(403).json({ error: 'Forbidden' })
  }
}
