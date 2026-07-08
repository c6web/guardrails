import type { Request, Response } from 'express';
import { Router } from 'express'
import { Group } from '../models/data-db/Group'
import { requireAuth, isAdmin } from '../middleware/auth'
import { logAudit } from '../utils/auditLog'

const router = Router()

function sanitize(group: Group) {
  return group.toJSON() as unknown as Record<string, unknown>
}

// GET /api/groups — admin only
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Admin access required' }); return }
    const groups = await Group.findAll({ order: [['name', 'ASC']] })
    res.json({ data: groups.map(sanitize) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/groups/:id — admin only
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Admin access required' }); return }
    const group = await Group.findByPk(req.params['id'])
    if (!group) { res.status(404).json({ error: 'Group not found' }); return }
    res.json({ data: sanitize(group) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/groups — admin only
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Admin access required' }); return }
    const { name, role } = req.body as { name?: string; role?: 'admin' | 'viewer' | 'user' }

    if (!name || !role) {
      res.status(400).json({ error: 'name and role are required' })
      return
    }

    const group = await Group.create({ name, role, is_default: false })
    await logAudit(req, 'group.create', 'group', group.id, { name, role })
    res.status(201).json({ data: sanitize(group) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/groups/:id — admin only (cannot rename default groups)
router.patch('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Admin access required' }); return }
    const group = await Group.findByPk(req.params['id'])
    if (!group) { res.status(404).json({ error: 'Group not found' }); return }

    if (group.is_default && req.body.name !== undefined) {
      res.status(400).json({ error: 'Cannot rename default groups' })
      return
    }

    const before = sanitize(group)
    const { name, role } = req.body as { name?: string; role?: 'admin' | 'viewer' | 'user' }
    if (name !== undefined) group.name = name
    if (role !== undefined) group.role = role
    await group.save()
    const after = sanitize(group)

    await logAudit(req, 'group.update', 'group', group.id, { ...before, after })
    res.json({ data: after })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/groups/:id — admin only (cannot delete default groups)
router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isAdmin(req)) { res.status(403).json({ error: 'Admin access required' }); return }
    const group = await Group.findByPk(req.params['id'])
    if (!group) { res.status(404).json({ error: 'Group not found' }); return }

    if (group.is_default) {
      res.status(400).json({ error: 'Cannot delete default groups' })
      return
    }

    const snapshot = sanitize(group)
    await group.destroy()
    await logAudit(req, 'group.delete', 'group', group.id, snapshot)
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
