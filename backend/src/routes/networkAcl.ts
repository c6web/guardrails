import type { Request, Response } from 'express'
import { Router } from 'express'
import { NetworkAclList } from '../models/data-db/NetworkAclList'
import { NetworkAclEntry } from '../models/data-db/NetworkAclEntry'
import { GatewayInstance } from '../models/data-db/GatewayInstance'
import { requireRole } from '../middleware/requireRole'

const router = Router()

const VALID_LIST_TYPES  = ['allowlist', 'blocklist'] as const
const VALID_ENTRY_TYPES = ['ip', 'cidr', 'host', 'domain'] as const

// ── Validation helpers ────────────────────────────────────────────────────────

function isValidIp(value: string): boolean {
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(value)
  if (ipv4) {
    const parts = value.split('.').map(Number)
    return parts.every(p => p >= 0 && p <= 255)
  }
  // IPv6 simple check
  return /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i.test(value)
}

function isValidCidr(value: string): boolean {
  const [ip, subnet] = value.split('/')
  if (!subnet) return false
  const subnetNum = Number(subnet)
  return isValidIp(ip) && subnetNum >= 0 && subnetNum <= 32
}

function isValidFqdn(value: string): boolean {
  // Allow alphanumeric, hyphens, dots. Must have at least one dot or be localhost-style
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(value)
}

function isValidDomain(value: string): boolean {
  // Allow wildcards like *.example.com
  const pattern = /^(\*\.)?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i
  return pattern.test(value)
}

function validateEntryValue(value: string, entryType: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'Value cannot be empty'

  switch (entryType) {
    case 'ip':
      if (!isValidIp(trimmed)) return 'Invalid IP address format'
      break
    case 'cidr':
      if (!isValidCidr(trimmed)) return 'Invalid CIDR range (e.g., 10.0.0.0/8)'
      break
    case 'host':
      if (!isValidFqdn(trimmed)) return 'Invalid FQDN format (e.g., api.example.com)'
      break
    case 'domain':
      if (!isValidDomain(trimmed)) return 'Invalid domain format (e.g., example.com or *.malicious.net)'
      break
  }
  return null
}

// GET /api/network-acl/lists — list all ACL lists with entry counts
router.get('/lists', async (_req: Request, res: Response): Promise<void> => {
  try {
    const lists = await NetworkAclList.findAll({
      order: [['name', 'ASC']],
    })

    const listsWithCounts = await Promise.all(
      lists.map(async (list) => {
        const entryCount = await NetworkAclEntry.count({
          where: { list_id: list.id },
        })
        return {
          ...list.toJSON(),
          entry_count: entryCount,
        }
      })
    )

    res.json({ data: listsWithCounts })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/network-acl/lists — create a new list (admin)
router.post('/lists', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, list_type, description } = req.body as {
      name?: string; list_type?: string; description?: string
    }
    if (!name || !name.trim()) {
      res.status(400).json({ error: 'name is required' })
      return
    }
    if (!list_type || !(VALID_LIST_TYPES as readonly string[]).includes(list_type)) {
      res.status(400).json({ error: `list_type must be one of: ${VALID_LIST_TYPES.join(', ')}` })
      return
    }
    const list = await NetworkAclList.create({
      name: name.trim(),
      list_type: list_type as 'allowlist' | 'blocklist',
      description: description?.trim() || null,
    })
    res.status(201).json({ data: list })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/network-acl/lists/:id — update list (admin)
router.patch('/lists/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const list = await NetworkAclList.findByPk(req.params['id'])
    if (!list) { res.status(404).json({ error: 'List not found' }); return }
    const { name, list_type, description } = req.body as {
      name?: string; list_type?: string; description?: string | null
    }
    if (list_type !== undefined && !(VALID_LIST_TYPES as readonly string[]).includes(list_type)) {
      res.status(400).json({ error: `list_type must be one of: ${VALID_LIST_TYPES.join(', ')}` })
      return
    }
    await list.update({
      ...(name        !== undefined && { name: name.trim() }),
      ...(list_type   !== undefined && { list_type: list_type as 'allowlist' | 'blocklist' }),
      ...(description !== undefined && { description: description?.trim() || null }),
    })
    res.json({ data: list })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/network-acl/lists/:id — delete list if not in use (admin)
router.delete('/lists/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const list = await NetworkAclList.findByPk(req.params['id'])
    if (!list) { res.status(404).json({ error: 'List not found' }); return }

    const assignedCount = await GatewayInstance.count({ where: { acl_list_id: req.params['id'] } })
    if (assignedCount > 0) {
      res.status(409).json({ error: `Cannot delete: list is assigned to ${assignedCount} gateway instance(s)` })
      return
    }

    await list.destroy()
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/network-acl/lists/:id/entries — entries for a specific list
router.get('/lists/:id/entries', async (req: Request, res: Response): Promise<void> => {
  try {
    const list = await NetworkAclList.findByPk(req.params['id'])
    if (!list) { res.status(404).json({ error: 'List not found' }); return }
    const entries = await NetworkAclEntry.findAll({
      where: { list_id: req.params['id'] },
      order: [['created_at', 'ASC']],
    })
    res.json({ data: entries })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/network-acl/lists/:id/entries — add entry to list (admin)
router.post('/lists/:id/entries', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const list = await NetworkAclList.findByPk(req.params['id'])
    if (!list) { res.status(404).json({ error: 'List not found' }); return }
    const { value, entry_type, note, enabled } = req.body as {
      value?: string; entry_type?: string; note?: string; enabled?: boolean
    }
    if (!value || !value.trim()) {
      res.status(400).json({ error: 'value is required' })
      return
    }
    if (!entry_type || !(VALID_ENTRY_TYPES as readonly string[]).includes(entry_type)) {
      res.status(400).json({ error: `entry_type must be one of: ${VALID_ENTRY_TYPES.join(', ')}` })
      return
    }
    const validationError = validateEntryValue(value, entry_type)
    if (validationError) {
      res.status(400).json({ error: validationError })
      return
    }
    const entry = await NetworkAclEntry.create({
      list_id:    req.params['id']!,
      value:      value.trim(),
      entry_type: entry_type as 'ip' | 'cidr' | 'host' | 'domain',
      note:       note?.trim() || null,
      enabled:    enabled !== false,
    })
    res.status(201).json({ data: entry })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/network-acl/lists/:id/entries/:entryId — update entry (admin)
router.patch('/lists/:id/entries/:entryId', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const entry = await NetworkAclEntry.findOne({
      where: { id: req.params['entryId'], list_id: req.params['id'] },
    })
    if (!entry) { res.status(404).json({ error: 'Entry not found' }); return }
    const { value, entry_type, note, enabled } = req.body as {
      value?: string; entry_type?: string; note?: string | null; enabled?: boolean
    }
    if (entry_type !== undefined && !(VALID_ENTRY_TYPES as readonly string[]).includes(entry_type)) {
      res.status(400).json({ error: `entry_type must be one of: ${VALID_ENTRY_TYPES.join(', ')}` })
      return
    }
    const finalValue = value !== undefined ? value : entry.value
    const finalEntryType = entry_type !== undefined ? entry_type : entry.entry_type
    const validationError = validateEntryValue(finalValue, finalEntryType)
    if (validationError) {
      res.status(400).json({ error: validationError })
      return
    }
    await entry.update({
      ...(value      !== undefined && { value: value.trim() }),
      ...(entry_type !== undefined && { entry_type: entry_type as 'ip' | 'cidr' | 'host' | 'domain' }),
      ...(note       !== undefined && { note: note?.trim() || null }),
      ...(enabled    !== undefined && { enabled }),
    })
    res.json({ data: entry })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/network-acl/lists/:id/entries/:entryId — delete entry (admin)
router.delete('/lists/:id/entries/:entryId', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const entry = await NetworkAclEntry.findOne({
      where: { id: req.params['entryId'], list_id: req.params['id'] },
    })
    if (!entry) { res.status(404).json({ error: 'Entry not found' }); return }
    await entry.destroy()
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
