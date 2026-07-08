import type { Request, Response} from 'express';
import { Router } from 'express'
import { Op } from 'sequelize'
import { ConnectedApp } from '../models/data-db/ConnectedApp'
import { ApiKey } from '../models/data-db/ApiKey'
import { AiProvider } from '../models/data-db/AiProvider'
import { AppPermission } from '../models/data-db/AppPermission'
import { User } from '../models/users-db/User'
import { ThreatKnowledge } from '../models/data-db/ThreatKnowledge'
import { Detector } from '../models/data-db/Detector'
import { AppThreatKnowledgeSelection } from '../models/data-db/AppThreatKnowledgeSelection'
import { AppDetectorSelection } from '../models/data-db/AppDetectorSelection'

import { ToolGuardrail } from '../models/data-db/ToolGuardrail'
import { AppToolGuardrailSelection } from '../models/data-db/AppToolGuardrailSelection'
import { requireAuth } from '../middleware/auth'
import { logAudit } from '../utils/auditLog'
import { triggerGatewayReload, triggerGatewayCacheFlush } from '../utils/gatewayReload'
import { resolveQuota, type QuotaInput } from '../utils/quota'
import { getAccessibleAppIds, canAccessApp, canManageApp, GROUP_IDS } from '../utils/appAccess'

const router = Router()

const CONTENT_QUALITY_SCAN_MODES = ['block', 'redact', 'flag', 'monitor'] as const

async function validateProviderIds(
  primary?: string | null,
  backup1?: string | null,
  backup2?: string | null
): Promise<string | null> {
  const ids = [primary, backup1, backup2].filter((id): id is string => id !== null && id !== undefined)
  if (ids.length === 0) return null
  
  const providers = await AiProvider.findAll({ where: { id: ids }, attributes: ['id'] })
  const found = new Set(providers.map(p => p.id))
  for (const id of ids) {
    if (!found.has(id)) return `Provider not found: ${id}`
  }
  return null
}

function sanitizeKey(key: ApiKey) {
  const json = key.toJSON() as unknown as Record<string, unknown>
  delete json['key_hash']
  delete json['key_encrypted']
  return json
}

// GET /api/apps — all authenticated users; user role filtered to accessible apps
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
    const search = req.query['search'] as string | undefined
    const limit = Math.min(100, Math.max(1, parseInt(req.query['limit'] as string || '100', 10)))

    const where: any = {}
    if (search?.trim()) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { team: { [Op.iLike]: `%${search}%` } },
      ]
    }

    const appIds = await getAccessibleAppIds(req)
    if (appIds !== null) {
      if (appIds.length === 0) { res.json({ data: [] }); return }
      where['id'] = appIds
    }

    const apps = await ConnectedApp.findAll({ where, limit, order: [['name', 'ASC']] })
    res.json({ data: apps })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/apps/:id/apikeys — list API keys for an app (accessible to all roles with app access)
router.get('/:id/apikeys', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
    if (!await canAccessApp(req, req.params['id']!)) { res.status(403).json({ error: 'Forbidden' }); return }
    const keys = await ApiKey.findAll({
      where: { app_id: req.params['id'] },
      order: [['created_at', 'DESC']],
    })
    res.json({ data: keys.map(sanitizeKey) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/apps/:id — all roles; user role limited to accessible apps
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
    if (!await canAccessApp(req, req.params['id']!)) { res.status(403).json({ error: 'Forbidden' }); return }
    const app = await ConnectedApp.findByPk(req.params['id'])
    if (!app) { res.status(404).json({ error: 'App not found' }); return }
    res.json({ data: app })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/apps — admin or user (admins can create any app, users auto-assigned as owner)
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
    const { name, team, env, status, owner_id, max_tokens, max_payload_size,
      primary_provider_id, backup1_provider_id, backup2_provider_id, enable_t2, enable_knowledge_dev,
      enable_response_cache, cache_ttl_seconds, multi_turn_semantic_enabled,
      enable_content_quality_scan, content_quality_scan_mode, content_quality_scan_threshold } =
      req.body as {
        name?: string; team?: string
        env?: 'production' | 'development' | 'qa'
        status?: 'enable' | 'disable'
        owner_id?: string | null
        max_tokens?: number | null
        max_payload_size?: number | null
        primary_provider_id?: string | null
        backup1_provider_id?: string | null
        backup2_provider_id?: string | null
        enable_t2?: boolean
        enable_knowledge_dev?: boolean
        enable_response_cache?: boolean
        cache_ttl_seconds?: number | null
        multi_turn_semantic_enabled?: boolean
        enable_content_quality_scan?: boolean
        content_quality_scan_mode?: string | null
        content_quality_scan_threshold?: number | null
      }

    if (!name || !env) {
      res.status(400).json({ error: 'name, env are required' })
      return
    }

    if (content_quality_scan_mode !== undefined && content_quality_scan_mode !== null
        && !CONTENT_QUALITY_SCAN_MODES.includes(content_quality_scan_mode as typeof CONTENT_QUALITY_SCAN_MODES[number])) {
      res.status(400).json({ error: `Invalid content_quality_scan_mode "${content_quality_scan_mode}". Must be one of: ${CONTENT_QUALITY_SCAN_MODES.join(', ')}` })
      return
    }

    const providerErr = await validateProviderIds(primary_provider_id, backup1_provider_id, backup2_provider_id)
    if (providerErr) {
      res.status(400).json({ error: providerErr })
      return
    }

    const quota = resolveQuota(req.body as QuotaInput)
    if ('error' in quota) {
      res.status(400).json({ error: quota.error })
      return
    }

    let ownerFields: { owner: string | null; owner_email: string | null; owner_id: string | null }
    if (owner_id) {
      const ownerUser = await User.findByPk(owner_id)
      if (!ownerUser) { res.status(400).json({ error: 'Selected owner does not exist' }); return }
      ownerFields = { owner: ownerUser.display_name, owner_email: ownerUser.email, owner_id: ownerUser.id }
    } else {
      ownerFields = { owner: req.user.username, owner_email: req.user.email, owner_id: req.user.userId }
    }

    const appOrgId = (req.body as Record<string, unknown>)['org_id'] as string | undefined
    const app = await ConnectedApp.create({
          name, team: team ?? '', env,
          status: status ?? 'enable',
          ...ownerFields,
          org_id: appOrgId ?? (req.user as any)?.organization_id ?? null,
          max_tokens: max_tokens ?? null,
          max_payload_size: max_payload_size ?? null,
          primary_provider_id: primary_provider_id ?? null,
          backup1_provider_id: backup1_provider_id ?? null,
          backup2_provider_id: backup2_provider_id ?? null,
          enable_t2: enable_t2 ?? true,
          enable_knowledge_dev: enable_knowledge_dev ?? false,
          enable_response_cache: enable_response_cache ?? false,
          cache_ttl_seconds: cache_ttl_seconds ?? null,
          multi_turn_semantic_enabled: multi_turn_semantic_enabled ?? false,
          enable_content_quality_scan: enable_content_quality_scan ?? false,
          content_quality_scan_mode: content_quality_scan_mode ?? null,
          content_quality_scan_threshold: content_quality_scan_threshold ?? null,
          ...quota.fields,
        })

    if (ownerFields.owner_id) {
      await AppPermission.create({
        app_id: app.id,
        user_id: ownerFields.owner_id,
        user_email: ownerFields.owner_email || '',
        user_name: ownerFields.owner || '',
      })
    }

    await logAudit(req, 'app.create', 'connected_app', app.id, { name, team, env })
    await triggerGatewayReload()
    res.status(201).json({ data: app })
  } catch (err: unknown) {
    const e = err as { name?: string }
    if (e.name === 'SequelizeUniqueConstraintError') {
      res.status(409).json({ error: 'App ID already exists' })
      return
    }
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/apps/:id — admin or app owner (by owner_id match)
router.patch(
  '/:id',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const app = await ConnectedApp.findByPk(req.params['id'])
      if (!app) { res.status(404).json({ error: 'App not found' }); return }

      if (!await canManageApp(req, app.id)) { res.status(403).json({ error: 'Forbidden' }); return }

    const { name, team, status, mode, owner_id, max_tokens, max_payload_size,
       primary_provider_id, backup1_provider_id, backup2_provider_id, enable_t2, enable_knowledge_dev, org_id,
       enable_response_cache, cache_ttl_seconds, multi_turn_semantic_enabled,
       enable_content_quality_scan, content_quality_scan_mode, content_quality_scan_threshold } = req.body as {
       name?: string; team?: string; env?: string
       status?: 'enable' | 'disable'; mode?: string
       owner_id?: string | null
       max_tokens?: number | null
       max_payload_size?: number | null
       primary_provider_id?: string | null
       backup1_provider_id?: string | null
       backup2_provider_id?: string | null
       enable_t2?: boolean
       enable_knowledge_dev?: boolean
       org_id?: string | null
       enable_response_cache?: boolean
       cache_ttl_seconds?: number | null
       multi_turn_semantic_enabled?: boolean
       enable_content_quality_scan?: boolean
       content_quality_scan_mode?: string | null
       content_quality_scan_threshold?: number | null
     }

      const env = (req.body as Record<string, unknown>)['env'] ?? app.env

      const VALID_MODES = ['guard', 'soft', 'monitor', 'bypass'] as const
      if (mode !== undefined && !VALID_MODES.includes(mode as typeof VALID_MODES[number])) {
        res.status(400).json({ error: `Invalid mode "${mode}". Must be one of: ${VALID_MODES.join(', ')}` })
        return
      }

      if (content_quality_scan_mode !== undefined && content_quality_scan_mode !== null
          && !CONTENT_QUALITY_SCAN_MODES.includes(content_quality_scan_mode as typeof CONTENT_QUALITY_SCAN_MODES[number])) {
        res.status(400).json({ error: `Invalid content_quality_scan_mode "${content_quality_scan_mode}". Must be one of: ${CONTENT_QUALITY_SCAN_MODES.join(', ')}` })
        return
      }

      const providerErr = await validateProviderIds(primary_provider_id, backup1_provider_id, backup2_provider_id)
      if (providerErr) {
        res.status(400).json({ error: providerErr })
        return
      }

      const quota = resolveQuota(req.body as QuotaInput, {
        quota_mode: app.quota_mode,
        quota_limit: app.quota_limit,
        quota_warning_limit: app.quota_warning_limit,
        quota_enforcement: app.quota_enforcement,
        quota_reset_day: app.quota_reset_day,
      })
      if ('error' in quota) {
        res.status(400).json({ error: quota.error })
        return
      }

      let ownerFields: { owner: string | null; owner_email: string | null; owner_id: string | null } = {
        owner: app.owner, owner_email: app.owner_email, owner_id: app.owner_id,
      }
      if (owner_id !== undefined && owner_id !== app.owner_id) {
        if (owner_id === null) {
          ownerFields = { owner: null, owner_email: null, owner_id: null }
        } else {
          const ownerUser = await User.findByPk(owner_id)
          if (!ownerUser) { res.status(400).json({ error: 'Selected owner does not exist' }); return }
          ownerFields = { owner: ownerUser.display_name, owner_email: ownerUser.email, owner_id: ownerUser.id }
        }
      }

      const before = { name: app.name, status: app.status, env: app.env }
      await app.update({
        name: name ?? app.name,
        team: team !== undefined ? team : app.team,
        env: env as 'production' | 'development' | 'qa',
        status: status ?? app.status,
        mode: mode ?? app.mode,
        ...ownerFields,
        max_tokens: max_tokens !== undefined ? max_tokens : app.max_tokens,
        max_payload_size: max_payload_size !== undefined ? max_payload_size : app.max_payload_size,
        primary_provider_id: primary_provider_id !== undefined ? primary_provider_id : app.primary_provider_id,
        backup1_provider_id: backup1_provider_id !== undefined ? backup1_provider_id : app.backup1_provider_id,
        backup2_provider_id: backup2_provider_id !== undefined ? backup2_provider_id : app.backup2_provider_id,
        enable_t2: enable_t2 !== undefined ? enable_t2 : app.enable_t2,
        enable_knowledge_dev: enable_knowledge_dev !== undefined ? enable_knowledge_dev : app.enable_knowledge_dev,
        enable_response_cache: enable_response_cache !== undefined ? enable_response_cache : app.enable_response_cache,
        cache_ttl_seconds: cache_ttl_seconds !== undefined ? cache_ttl_seconds : app.cache_ttl_seconds,
        multi_turn_semantic_enabled: multi_turn_semantic_enabled !== undefined ? multi_turn_semantic_enabled : app.multi_turn_semantic_enabled,
        enable_content_quality_scan: enable_content_quality_scan !== undefined ? enable_content_quality_scan : app.enable_content_quality_scan,
        content_quality_scan_mode: content_quality_scan_mode !== undefined ? content_quality_scan_mode : app.content_quality_scan_mode,
        content_quality_scan_threshold: content_quality_scan_threshold !== undefined ? content_quality_scan_threshold : app.content_quality_scan_threshold,
        org_id: org_id !== undefined ? (org_id || null) : app.org_id,
        ...quota.fields,
      })

      const changed = status && status !== before.status ? 'app.status_change' : 'app.update'
      await logAudit(req, changed, 'connected_app', app.id, { ...before, after: { name: app.name, status: app.status, env: app.env } })
      await triggerGatewayReload()
      res.json({ data: app })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

  // POST /api/apps/:id/cache/flush — force-expire this app's response cache entries
  router.post('/:id/cache/flush', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const app = await ConnectedApp.findByPk(req.params['id'])
      if (!app) { res.status(404).json({ error: 'App not found' }); return }
      if (!await canManageApp(req, app.id)) { res.status(403).json({ error: 'Forbidden' }); return }

      const result = await triggerGatewayCacheFlush(app.id)
      await logAudit(req, 'app.cache_flush', 'connected_app', app.id, { app_name: app.name })

      res.json({ data: result })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // DELETE /api/apps/:id — admin or app owner
  router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
      const app = await ConnectedApp.findByPk(req.params['id'])
      if (!app) { res.status(404).json({ error: 'App not found' }); return }
      if (!await canManageApp(req, app.id)) { res.status(403).json({ error: 'Forbidden' }); return }
      await logAudit(req, 'app.delete', 'connected_app', app.id, { name: app.name, env: app.env })
      await app.destroy()
      await triggerGatewayReload()
      res.status(204).send()
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // GET /api/apps/:id/permissions — list permissions for an app
  router.get('/:id/permissions', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
      const app = await ConnectedApp.findByPk(req.params['id'])
      if (!app) { res.status(404).json({ error: 'App not found' }); return }

      if (!await canAccessApp(req, app.id)) { res.status(403).json({ error: 'Forbidden' }); return }

      const permissions = await AppPermission.findAll({
        where: { app_id: req.params['id'] },
        order: [['created_at', 'DESC']],
      })
      res.json({ data: permissions })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/apps/:id/permissions — add a user permission
  router.post('/:id/permissions', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
      const { user_id } = req.body as { user_id?: string }
      if (!user_id) {
        res.status(400).json({ error: 'user_id is required' })
        return
      }

      const app = await ConnectedApp.findByPk(req.params['id'])
      if (!app) { res.status(404).json({ error: 'App not found' }); return }

      if (!await canManageApp(req, app.id)) { res.status(403).json({ error: 'Forbidden' }); return }

      const user = await User.findByPk(user_id)
      if (!user) { res.status(404).json({ error: 'User not found' }); return }

      // Only users in the Users or Knowledge Admins group can be granted app permissions
      if (user.group_id !== GROUP_IDS.user && user.group_id !== GROUP_IDS.knowledge_admin) {
        res.status(400).json({ error: 'Only users in the Users or Knowledge Admins group can be granted app permissions' })
        return
      }

      const permission = await AppPermission.create({
        app_id: req.params['id'],
        user_id,
        user_email: user.email,
        user_name: user.display_name || user.username,
      })

      await logAudit(req, 'app.permission.add', 'app_permission', permission.id, { app_id: app.id, user_id, user_email: user.email })
      res.status(201).json({ data: permission })
    } catch (err: unknown) {
      const e = err as { name?: string }
      if (e.name === 'SequelizeUniqueConstraintError') {
        res.status(409).json({ error: 'User already has permission for this app' })
        return
      }
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // DELETE /api/apps/:id/permissions/:permissionId — remove a user permission
  router.delete('/:id/permissions/:permissionId', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }

      const app = await ConnectedApp.findByPk(req.params['id'])
      if (!app) { res.status(404).json({ error: 'App not found' }); return }

      if (!await canManageApp(req, app.id)) { res.status(403).json({ error: 'Forbidden' }); return }

      const permission = await AppPermission.findByPk(req.params['permissionId'])
      if (!permission) { res.status(404).json({ error: 'Permission not found' }); return }

      if (permission.app_id !== req.params['id']) {
        res.status(400).json({ error: 'Permission does not belong to this app' })
        return
      }

      await logAudit(req, 'app.permission.remove', 'app_permission', permission.id, { app_id: app.id, user_id: permission.user_id })
      await permission.destroy()
      res.status(204).send()
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /api/apps/bulk-delete — body: { ids: string[] }
  router.post('/bulk-delete', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
      const { ids }: { ids: string[] } = req.body || {}
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: 'ids array required' })
        return
      }

      const appsToDelete = await ConnectedApp.findAll({ where: { id: ids }, attributes: ['id', 'name', 'env', 'owner_email'] })

      // Verify access for every app; reject the whole batch if any are inaccessible
      for (const app of appsToDelete) {
        if (!await canManageApp(req, app.id)) {
          res.status(403).json({ error: 'Forbidden — you do not have access to one or more of the selected apps' })
          return
        }
      }

      for (const app of appsToDelete) {
        await logAudit(req, 'app.delete', 'connected_app', app.id, { name: app.name, env: app.env })
        await app.destroy()
      }
      await triggerGatewayReload()

      res.json({ success: true, deletedCount: appsToDelete.length })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // GET /api/apps/:id/threat-knowledge — list all threat knowledge with enabled flag per app
  router.get('/:id/threat-knowledge', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
      const app = await ConnectedApp.findByPk(req.params['id'])
      if (!app) { res.status(404).json({ error: 'App not found' }); return }

      if (!await canAccessApp(req, app.id)) { res.status(403).json({ error: 'Forbidden' }); return }

      const allTK = await ThreatKnowledge.findAll({ order: [['name', 'ASC']] })
      const selected = await AppThreatKnowledgeSelection.findAll({ where: { app_id: req.params['id'] } })
      const selectedIds = new Set(selected.map(s => s.threat_knowledge_id))
      const isCustom = selectedIds.size > 0
      const data = allTK.map(tk => ({
        id: tk.id,
        name: tk.name,
        description: tk.description,

        threat_context: tk.threat_context,
        status: tk.status,
        source: tk.source,
        enabled: selectedIds.size === 0 || selectedIds.has(tk.id),
      }))
      res.json({ data, isCustom })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // PUT /api/apps/:id/threat-knowledge — replace full selection
  router.put('/:id/threat-knowledge', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
      const app = await ConnectedApp.findByPk(req.params['id'])
      if (!app) { res.status(404).json({ error: 'App not found' }); return }

      if (!await canManageApp(req, app.id)) { res.status(403).json({ error: 'Forbidden' }); return }

      const { selectedIds }: { selectedIds: string[] | null } = req.body
      if (selectedIds !== null && !Array.isArray(selectedIds)) {
        res.status(400).json({ error: 'selectedIds must be an array or null' })
        return
      }

      // Reset to all-enabled (delete all rows)
      if (selectedIds === null) {
        await AppThreatKnowledgeSelection.destroy({ where: { app_id: req.params['id'] } })
      } else {
        await AppThreatKnowledgeSelection.destroy({ where: { app_id: req.params['id'] } })
        for (const id of selectedIds) {
          try {
            await AppThreatKnowledgeSelection.create({ app_id: req.params['id'], threat_knowledge_id: id })
          } catch {}
        }
      }

      res.json({ success: true })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // GET /api/apps/:id/detectors — list all detectors with enabled flag per app
  router.get('/:id/detectors', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
      const app = await ConnectedApp.findByPk(req.params['id'])
      if (!app) { res.status(404).json({ error: 'App not found' }); return }

      if (!await canAccessApp(req, app.id)) { res.status(403).json({ error: 'Forbidden' }); return }

      const allDetectors = await Detector.findAll({
        where: { scanning_scope: ['input', 'both'] },
        order: [['name', 'ASC']],
      })
      const selected = await AppDetectorSelection.findAll({ where: { app_id: req.params['id'] } })
      const selectedIds = new Set(selected.map(s => s.detector_id))
      const isCustom = selectedIds.size > 0
      const data = allDetectors.map(d => ({
        id: d.id,
        name: d.name,
        description: d.description,
        threshold: d.threshold,
        rule_type: d.rule_type,
        scanning_scope: d.scanning_scope,
        mode: d.mode,
        keywords: d.keywords,
        redaction_placeholder: d.redaction_placeholder,
        enabled: selectedIds.size === 0 || selectedIds.has(d.id),
      }))
      res.json({ data, isCustom })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // PUT /api/apps/:id/detectors — replace full selection
  router.put('/:id/detectors', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
      const app = await ConnectedApp.findByPk(req.params['id'])
      if (!app) { res.status(404).json({ error: 'App not found' }); return }

      if (!await canManageApp(req, app.id)) { res.status(403).json({ error: 'Forbidden' }); return }

      const { selectedIds }: { selectedIds: string[] | null } = req.body
      if (selectedIds !== null && !Array.isArray(selectedIds)) {
        res.status(400).json({ error: 'selectedIds must be an array or null' })
        return
      }

      if (selectedIds === null) {
        await AppDetectorSelection.destroy({ where: { app_id: req.params['id'] } })
      } else {
        await AppDetectorSelection.destroy({ where: { app_id: req.params['id'] } })
        for (const id of selectedIds) {
          try {
            await AppDetectorSelection.create({ app_id: req.params['id'], detector_id: id })
          } catch {}
        }
      }

      res.json({ success: true })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // GET /api/apps/:id/tool-guardrails — list all tools with blocked flag for this app
  router.get('/:id/tool-guardrails', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
      const app = await ConnectedApp.findByPk(req.params['id'])
      if (!app) { res.status(404).json({ error: 'App not found' }); return }

      if (!await canAccessApp(req, app.id)) { res.status(403).json({ error: 'Forbidden' }); return }

      const allTools = await ToolGuardrail.findAll({ where: { active: true }, order: [['tool_name', 'ASC']] })
      const selected = await AppToolGuardrailSelection.findAll({ where: { app_id: req.params['id'] } })
      const selectedIds = new Set(selected.map(s => s.tool_guardrail_id))
      const isCustom = selectedIds.size > 0
      const data = allTools.map(t => ({
        id: t.id,
        tool_name: t.tool_name,
        description: t.description,
        blocked: selectedIds.has(t.id),
      }))
      res.json({ data, isCustom })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // PUT /api/apps/:id/tool-guardrails — replace full blocked tool selection
  router.put('/:id/tool-guardrails', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
      const app = await ConnectedApp.findByPk(req.params['id'])
      if (!app) { res.status(404).json({ error: 'App not found' }); return }

      if (!await canManageApp(req, app.id)) { res.status(403).json({ error: 'Forbidden' }); return }

      const { selectedIds }: { selectedIds: string[] | null } = req.body
      if (selectedIds !== null && !Array.isArray(selectedIds)) {
        res.status(400).json({ error: 'selectedIds must be an array or null' })
        return
      }

      await AppToolGuardrailSelection.destroy({ where: { app_id: req.params['id'] } })

      if (selectedIds && selectedIds.length > 0) {
        for (const id of selectedIds) {
          try {
            await AppToolGuardrailSelection.create({ app_id: req.params['id'], tool_guardrail_id: id })
          } catch {}
        }
      }

      res.json({ success: true })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  export default router

