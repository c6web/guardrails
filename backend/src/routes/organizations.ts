import type { Request, Response } from 'express'
import { Router } from 'express'
import { Organization } from '../models/users-db/Organization'
import { sequelizeUsersDb } from '../config/database'
import { requireAuth, isAdmin } from '../middleware/auth'
import { logAudit } from '../utils/auditLog'
import { QueryTypes } from 'sequelize'

const router = Router()

interface OrgRow {
  id: string
  name: string
  description: string | null
  owner_user_id: string | null
  member_count: number
  created_at: string
  updated_at: string
}

// GET /api/organizations — admin only, list all with member counts
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Admin access required' }); return }

    const rows = await sequelizeUsersDb.query<OrgRow>(`
      SELECT o.id, o.name, o.description, o.owner_user_id, o.created_at, o.updated_at,
             COUNT(u.id)::int AS member_count
        FROM organizations o
        LEFT JOIN users u ON u.organization_id = o.id
       GROUP BY o.id
       ORDER BY o.name ASC
    `, { type: QueryTypes.SELECT })

    res.json({ data: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/organizations/:id — admin only
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Admin access required' }); return }

    const [rows] = await sequelizeUsersDb.query<OrgRow>(`
      SELECT o.id, o.name, o.description, o.owner_user_id, o.created_at, o.updated_at,
             COUNT(u.id)::int AS member_count
        FROM organizations o
        LEFT JOIN users u ON u.organization_id = o.id
       WHERE o.id = :id
       GROUP BY o.id
    `, { type: QueryTypes.SELECT, replacements: { id: req.params['id'] } })

    if (!rows) { res.status(404).json({ error: 'Organization not found' }); return }

    res.json({ data: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/organizations — admin only
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Admin access required' }); return }

    const { name, description, owner_user_id } = req.body as { name?: string; description?: string | null; owner_user_id?: string | null }
    if (!name?.trim()) {
      res.status(400).json({ error: 'name is required' }); return
    }

    const org = await Organization.create({ name: name.trim(), description: description ?? null, owner_user_id: owner_user_id ?? null })
    await logAudit(req, 'org.create', 'organization', org.id, { name: org.name })
    res.status(201).json({ data: org })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/organizations/:id — admin only
router.patch('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Admin access required' }); return }

    const org = await Organization.findByPk(req.params['id'])
    if (!org) { res.status(404).json({ error: 'Organization not found' }); return }

    const { name, description, owner_user_id } = req.body as { name?: string; description?: string | null; owner_user_id?: string | null }
    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name.trim()
    if (description !== undefined) updates.description = description
    if (owner_user_id !== undefined) updates.owner_user_id = owner_user_id

    const before = { name: org.name, description: org.description, owner_user_id: org.owner_user_id }
    await org.update(updates)
    await logAudit(req, 'org.update', 'organization', org.id, { before, after: updates })
    res.json({ data: org })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/organizations/:id — admin only; blocked if members assigned
router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Admin access required' }); return }

    const org = await Organization.findByPk(req.params['id'])
    if (!org) { res.status(404).json({ error: 'Organization not found' }); return }

    const [{ cnt }] = await sequelizeUsersDb.query<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt FROM users WHERE organization_id = :id`,
      { type: QueryTypes.SELECT, replacements: { id: req.params['id'] } }
    )
    if (cnt > 0) {
      res.status(409).json({ error: 'Cannot delete an organization with active members. Reassign members first.' })
      return
    }

    await logAudit(req, 'org.delete', 'organization', org.id, { name: org.name })
    await org.destroy()
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
