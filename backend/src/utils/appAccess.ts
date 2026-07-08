import type { Request } from 'express'
import { ConnectedApp } from '../models/data-db/ConnectedApp'
import { AppPermission } from '../models/data-db/AppPermission'

export const GROUP_IDS = {
  admin:            '00000000-0000-0000-0000-000000000001',
  viewer:           '00000000-0000-0000-0000-000000000002',
  user:             '00000000-0000-0000-0000-000000000003',
  knowledge_admin:  '00000000-0000-0000-0000-000000000004',
} as const

export function isAdminOrViewer(req: Request): boolean {
  const gid = req.user?.groupId
  return gid === GROUP_IDS.admin || gid === GROUP_IDS.viewer
}

function isAdmin(req: Request): boolean {
  return req.user?.groupId === GROUP_IDS.admin
}

/**
 * Returns null for admin/viewer (unrestricted) or the deduplicated list of
 * app IDs the user may access: apps they own (owner_id) ∪ apps granted via AppPermission.
 */
export async function getAccessibleAppIds(req: Request): Promise<string[] | null> {
  if (!req.user) return []
  if (isAdminOrViewer(req)) return null

  const [ownedApps, grantedPerms] = await Promise.all([
    ConnectedApp.findAll({
      where: { owner_id: req.user.userId },
      attributes: ['id'],
    }),
    AppPermission.findAll({
      where: { user_id: req.user.userId },
      attributes: ['app_id'],
    }),
  ])

  const ids = new Set<string>()
  for (const app of ownedApps) ids.add(app.id)
  for (const perm of grantedPerms) ids.add(perm.app_id)
  return [...ids]
}

/**
 * Returns true if the user can access the given app.
 * Admin/viewer can always access any app.
 */
export async function canAccessApp(req: Request, appId: string): Promise<boolean> {
  if (!req.user) return false
  if (isAdminOrViewer(req)) return true

  const [owned, granted] = await Promise.all([
    ConnectedApp.findOne({ where: { id: appId, owner_id: req.user.userId }, attributes: ['id'] }),
    AppPermission.findOne({ where: { app_id: appId, user_id: req.user.userId }, attributes: ['id'] }),
  ])
  return owned !== null || granted !== null
}

/**
 * Returns true if the user can manage (mutate/delete/rotate/reveal) the given app.
 * Admin always can; other users must be the app owner (AppPermission grants read-only).
 */
export async function canManageApp(req: Request, appId: string): Promise<boolean> {
  if (!req.user) return false
  if (isAdmin(req)) return true

  const owned = await ConnectedApp.findOne({
    where: { id: appId, owner_id: req.user.userId },
    attributes: ['id'],
  })
  return owned !== null
}
