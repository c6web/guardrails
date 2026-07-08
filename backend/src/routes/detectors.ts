import type { Request, Response } from 'express';
import { Router } from 'express'
import { Op } from 'sequelize'
import { Detector } from '../models/data-db/Detector'
import { DetectionFramework } from '../models/data-db/DetectionFramework'
import { AdminActivityLog } from '../models/logs-db/AdminActivityLog'

import { requireAuth } from '../middleware/auth'
import { logAudit } from '../utils/auditLog'

const GROUP_IDS = {
  admin:            '00000000-0000-0000-0000-000000000001',
  viewer:           '00000000-0000-0000-0000-000000000002',
  user:             '00000000-0000-0000-0000-000000000003',
  knowledge_admin:  '00000000-0000-0000-0000-000000000004',
} as const

const router = Router()

// GET /api/detectors/stats — viewer+
router.get('/stats', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const qualityGood = await Detector.count({ where: { quality_review_result: 'good' } })
    const qualityPoison = await Detector.count({ where: { quality_review_result: 'poison' } })
    const qualityPoor = await Detector.count({ where: { quality_review_result: 'poor_quality' } })
    const qualityReviewed = qualityGood + qualityPoison + qualityPoor
    const total = await Detector.count()
    const qualityNotReviewed = total - qualityReviewed
    res.json({ data: { qualityGood, qualityPoison, qualityPoor, qualityReviewed, qualityNotReviewed } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

const FRAMEWORK_INCLUDE = [{
  model: DetectionFramework,
  as: 'detectionFrameworks',
  through: { attributes: [] },
  required: false,
}]

function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for']
  return (typeof fwd === 'string' ? fwd.split(',')[0].trim() : null) ?? req.ip ?? '0.0.0.0'
}

async function logAdmin(
  req: Request,
  action: string,
  targetId: string,
  before?: object | null,
  after?: object | null,
) {
  if (!req.user) return
  try {
    await AdminActivityLog.create({
      admin_id:    req.user.userId,
      admin_email: req.user.email,
      action,
      target_type: 'detector',
      target_id:   targetId,
      before_state: before ?? null,
      after_state:  after ?? null,
      ip_address:  clientIp(req),
    })
  } catch { /* non-blocking */ }
}

// GET /api/detectors — user+ (supports search + pagination)
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
    const gid = req.user.groupId
    if (gid !== GROUP_IDS.admin && gid !== GROUP_IDS.viewer && gid !== GROUP_IDS.user && gid !== GROUP_IDS.knowledge_admin) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return
    }
    const search = req.query['search'] as string | undefined
    const page  = Math.max(1, parseInt(req.query['page']  as string || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(req.query['limit'] as string || '50', 10)))
    const offset = (page - 1) * limit
    const sortCol = (req.query['sort'] as string | undefined) ?? ''
    const orderDir = ((req.query['order'] as string | undefined) ?? 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC'

    const where: any = {}
    if (search?.trim()) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ]
    }

    const validCols = ['name', 'description', 'created_at', 'updated_at']
    const orderCol = validCols.includes(sortCol) ? sortCol : 'name'

    const total = await Detector.count({ where })
    const detectors = await Detector.findAll({
      where,
      limit,
      offset,
      include: FRAMEWORK_INCLUDE,
      order: [[orderCol, orderDir]],
    })
    res.json({ data: detectors.map(d => d.toJSON()), meta: { page, limit, total, totalPages: Math.ceil(total / limit) } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/detectors/:id — user+
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
    const gid = req.user.groupId
    if (gid !== GROUP_IDS.admin && gid !== GROUP_IDS.viewer && gid !== GROUP_IDS.user && gid !== GROUP_IDS.knowledge_admin) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return
    }
    const detector = await Detector.findByPk(req.params['id'], { include: FRAMEWORK_INCLUDE })
    if (!detector) { res.status(404).json({ error: 'Detector not found' }); return }
    res.json({ data: detector.toJSON() })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/detectors — admin, user, or knowledge admin
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
    const gid = req.user.groupId
    if (gid !== GROUP_IDS.admin && gid !== GROUP_IDS.user && gid !== GROUP_IDS.knowledge_admin) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return
    }

    const { name, description, keywords, rule_type, scanning_scope, framework_ids, mode, redaction_placeholder } = req.body as {
      name?: string
      description?: string
      keywords?: string[]
      rule_type?: string
      scanning_scope?: string
      framework_ids?: string[]
      mode?: string
      redaction_placeholder?: string
    }

    if (!name?.trim() || !description?.trim()) {
      res.status(400).json({ error: 'name, description are required' })
      return
    }

    const validRuleTypes = ['keyword', 'regex']
    if (rule_type !== undefined && !validRuleTypes.includes(rule_type)) {
      res.status(400).json({ error: 'rule_type must be "keyword" or "regex"' })
      return
    }

    const validScopes = ['input', 'output', 'both']
    if (scanning_scope !== undefined && !validScopes.includes(scanning_scope)) {
      res.status(400).json({ error: 'scanning_scope must be "input", "output", or "both"' })
      return
    }

    const validModes = ['block', 'flag', 'redact']
    if (mode !== undefined && !validModes.includes(mode)) {
      res.status(400).json({ error: 'mode must be "block", "flag", or "redact"' })
      return
    }

    const rt = rule_type ?? 'keyword'

    // G13: redact mode requires non-empty placeholder
    if (mode === 'redact') {
      const ph = redaction_placeholder ?? ''
      if (!ph.trim()) {
        res.status(400).json({ error: 'redaction_placeholder is required when mode is "redact"' })
        return
      }
    }

    // G13: regex rule_type requires at least one keyword pattern
    if (rt === 'regex' && (!keywords || keywords.length === 0)) {
      res.status(400).json({ error: 'rule_type "regex" requires at least one keyword pattern' })
      return
    }

    // G13: validate regex syntax for each pattern
    if (rt === 'regex' && keywords) {
      for (let i = 0; i < keywords.length; i++) {
        try { new RegExp(keywords[i]) } catch {
          res.status(400).json({ error: `Invalid regex pattern at index ${i}: ${keywords[i]}` })
          return
        }
      }
    }

    const detector = await Detector.create({
      name: name.trim(),
      description: description.trim(),
      threshold: 0.5,
      keywords: keywords ?? null,
      rule_type: rule_type ?? 'keyword',
      scanning_scope: scanning_scope ?? 'input',
      mode: mode ?? 'block',
      redaction_placeholder: redaction_placeholder ?? null,
    })

    if (framework_ids && framework_ids.length > 0) {
      for (const fid of framework_ids) {
        const fw = await DetectionFramework.findByPk(fid)
        if (fw) await detector.addDetectionFrameworks(fw)
      }
    }

    await detector.reload({ include: FRAMEWORK_INCLUDE })
    const json = detector.toJSON()
    await logAdmin(req, 'detector.create', detector.id, null, json)
    await logAudit(req, 'detector.create', 'detector', detector.id, { name: detector.name, rule_type: detector.rule_type })
    res.status(201).json({ data: json })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/detectors/:id — admin, user, or knowledge admin
router.patch('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
    const gid = req.user.groupId
    if (gid !== GROUP_IDS.admin && gid !== GROUP_IDS.user && gid !== GROUP_IDS.knowledge_admin) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return
    }

    const detector = await Detector.findByPk(req.params['id'], { include: FRAMEWORK_INCLUDE })
    if (!detector) { res.status(404).json({ error: 'Detector not found' }); return }

    const before = detector.toJSON()

    const { name, description, keywords, rule_type, scanning_scope, framework_ids, mode, redaction_placeholder } = req.body as {
      name?: string
      description?: string
      keywords?: string[]
      rule_type?: string
      scanning_scope?: string
      framework_ids?: string[]
      mode?: string
      redaction_placeholder?: string
    }

    const validRuleTypes = ['keyword', 'regex']
    if (rule_type !== undefined && !validRuleTypes.includes(rule_type)) {
      res.status(400).json({ error: 'rule_type must be "keyword" or "regex"' })
      return
    }

    const validScopes = ['input', 'output', 'both']
    if (scanning_scope !== undefined && !validScopes.includes(scanning_scope)) {
      res.status(400).json({ error: 'scanning_scope must be "input", "output", or "both"' })
      return
    }

    const validModes = ['block', 'flag', 'redact']
    if (mode !== undefined && !validModes.includes(mode)) {
      res.status(400).json({ error: 'mode must be "block", "flag", or "redact"' })
      return
    }

    const rt = rule_type ?? detector.rule_type

    // G13: redact mode requires non-empty placeholder
    if (mode === 'redact') {
      const ph = redaction_placeholder ?? detector.redaction_placeholder ?? ''
      if (!ph.trim()) {
        res.status(400).json({ error: 'redaction_placeholder is required when mode is "redact"' })
        return
      }
    }

    // G13: regex rule_type requires at least one keyword pattern
    const kws = keywords ?? detector.keywords
    if (rt === 'regex' && (!kws || kws.length === 0)) {
      res.status(400).json({ error: 'rule_type "regex" requires at least one keyword pattern' })
      return
    }

    // G13: validate regex syntax for each pattern (only when keywords are provided)
    if (rt === 'regex' && keywords) {
      for (let i = 0; i < keywords.length; i++) {
        try { new RegExp(keywords[i]) } catch {
          res.status(400).json({ error: `Invalid regex pattern at index ${i}: ${keywords[i]}` })
          return
        }
      }
    }

    const updates: Record<string, unknown> = {}
    if (name                  !== undefined) updates['name']                  = name.trim()
    if (description           !== undefined) updates['description']           = description.trim()
    if (keywords              !== undefined) updates['keywords']              = keywords
    if (rule_type             !== undefined) updates['rule_type']             = rule_type
    if (scanning_scope        !== undefined) updates['scanning_scope']        = scanning_scope
    if (mode                  !== undefined) updates['mode']                  = mode
    if (redaction_placeholder !== undefined) updates['redaction_placeholder'] = redaction_placeholder

    await detector.update(updates)

    if (framework_ids !== undefined) {
      const current = await detector.getDetectionFrameworks()
      const currentIds = new Set(current.map(f => f.id))
      const newIds = new Set(framework_ids)
      for (const fw of current) {
        if (!newIds.has(fw.id)) await detector.removeDetectionFrameworks(fw)
      }
      for (const fid of framework_ids) {
        if (!currentIds.has(fid)) {
          const fw = await DetectionFramework.findByPk(fid)
if (fw) await detector.addDetectionFrameworks(fw)
        }
      }
    }

    await detector.reload({ include: FRAMEWORK_INCLUDE })
    const after = detector.toJSON()
    await logAdmin(req, 'detector.update', detector.id, before, after)
    await logAudit(req, 'detector.update', 'detector', detector.id, { name: detector.name, rule_type: detector.rule_type })
    res.json({ data: after })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/detectors/:id — admin, user, or knowledge admin
router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
    const gid = req.user.groupId
    if (gid !== GROUP_IDS.admin && gid !== GROUP_IDS.user && gid !== GROUP_IDS.knowledge_admin) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return
    }

    const detector = await Detector.findByPk(req.params['id'], { include: FRAMEWORK_INCLUDE })
    if (!detector) { res.status(404).json({ error: 'Detector not found' }); return }

    const before = detector.toJSON()
    await detector.destroy()
    await logAdmin(req, 'detector.delete', detector.id, before, null)
    await logAudit(req, 'detector.delete', 'detector', detector.id, { name: detector.name })
    res.json({ data: { id: detector.id } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/detectors/bulk/delete — admin, user, or knowledge admin
router.post('/bulk-delete', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
    const gid = req.user.groupId
    if (gid !== GROUP_IDS.admin && gid !== GROUP_IDS.user && gid !== GROUP_IDS.knowledge_admin) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return
    }

    const { ids } = req.body as { ids?: string[] }
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids array is required' })
      return
    }

    const detectors = await Detector.findAll({ where: { id: ids } })
    for (const detector of detectors) {
      const before = detector.toJSON()
      await detector.destroy()
      await logAdmin(req, 'detector.delete', detector.id, before, null)
      await logAudit(req, 'detector.delete', 'detector', detector.id, { name: detector.name })
    }
    res.json({ success: true, deletedCount: detectors.length })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/detectors/:id/frameworks — add a framework mapping
router.post('/:id/frameworks', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
    const detector = await Detector.findByPk(req.params['id'])
    if (!detector) { res.status(404).json({ error: 'Detector not found' }); return }
    const framework = await DetectionFramework.findByPk(req.body.framework_id)
    if (!framework) { res.status(404).json({ error: 'Framework not found' }); return }
    await detector.addDetectionFrameworks(framework)
    await detector.reload({ include: FRAMEWORK_INCLUDE })
    res.json({ data: detector.toJSON() })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/detectors/:id/frameworks — list linked frameworks
router.get('/:id/frameworks', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
    const detector = await Detector.findByPk(req.params['id'], { include: FRAMEWORK_INCLUDE })
    if (!detector) { res.status(404).json({ error: 'Detector not found' }); return }
    const frameworks = detector.get ? detector.get('detectionFrameworks') : []
    res.json({ data: frameworks })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/detectors/:id/frameworks/:frameworkId — remove a framework mapping
router.delete('/:id/frameworks/:frameworkId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }
    const detector = await Detector.findByPk(req.params['id'], { include: FRAMEWORK_INCLUDE })
    if (!detector) { res.status(404).json({ error: 'Detector not found' }); return }
    const framework = await DetectionFramework.findByPk(req.params['frameworkId'])
    if (!framework) { res.status(404).json({ error: 'Framework not found' }); return }
    await detector.removeDetectionFrameworks(framework)
    await detector.reload({ include: FRAMEWORK_INCLUDE })
    res.json({ data: detector.toJSON() })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/detectors/:id/test
router.post('/:id/test', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const detector = await Detector.findByPk(req.params['id'])
    if (!detector) { res.status(404).json({ error: 'Detector not found' }); return }

    const { prompt } = req.body as { prompt?: string }
    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'prompt is required' })
      return
    }

    const MAX_PROMPT_LENGTH = 5000
    const MAX_PATTERNS = 20
    if (prompt.length > MAX_PROMPT_LENGTH) {
      res.status(400).json({ error: `Prompt too long (max ${MAX_PROMPT_LENGTH} characters)` })
      return
    }

    const patterns = (detector.keywords ?? []).slice(0, MAX_PATTERNS)
    if (patterns.length === 0) {
      res.json({ matched: false, matched_pattern: null })
      return
    }

    if (detector.rule_type === 'regex') {
      for (const pattern of patterns) {
        let re: RegExp
        try {
          re = new RegExp(pattern, 'gi')
        } catch {
          res.status(422).json({ error: `Invalid regex pattern: ${pattern}` })
          return
        }
        if (re.test(prompt)) {
          const placeholder = detector.redaction_placeholder ?? '[REDACTED]'
          const redacted_preview = detector.mode === 'redact'
            ? prompt.replace(new RegExp(pattern, 'gi'), () => placeholder)
            : null
          res.json({ matched: true, matched_pattern: pattern, redacted_preview })
          return
        }
      }
    } else {
      const lower = prompt.toLowerCase()
      for (const kw of patterns) {
        if (lower.includes(kw.toLowerCase())) {
          res.json({ matched: true, matched_pattern: kw, redacted_preview: null })
          return
        }
      }
    }

    res.json({ matched: false, matched_pattern: null, redacted_preview: null })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/detectors/test-all — batch test all detectors against a prompt
router.post('/test-all', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { prompt } = req.body as { prompt?: string }
    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'prompt is required' })
      return
    }

    const MAX_PROMPT_LENGTH = 5000
    const MAX_PATTERNS = 20
    if (prompt.length > MAX_PROMPT_LENGTH) {
      res.status(400).json({ error: `Prompt too long (max ${MAX_PROMPT_LENGTH} characters)` })
      return
    }

    const detectors = await Detector.findAll({ include: FRAMEWORK_INCLUDE })
    const results = (await Promise.all(detectors.map(async d => {
      const patterns = (d.keywords ?? []).slice(0, MAX_PATTERNS)
      if (patterns.length === 0) return null

      let matched = false
      let matchedPattern: string | null = null

      if (d.rule_type === 'regex') {
        for (const pattern of patterns) {
          try {
            const re = new RegExp(pattern, 'i')
            if (re.test(prompt)) { matched = true; matchedPattern = pattern; break }
          } catch { /* skip invalid regex */ }
        }
      } else {
        const lower = prompt.toLowerCase()
        for (const kw of patterns) {
          if (lower.includes(kw.toLowerCase())) { matched = true; matchedPattern = kw; break }
        }
      }

      return {
        detector_id: d.id,
        detector_name: d.name,
        rule_type: d.rule_type,
        matched,
        matched_pattern: matchedPattern,
      }
    }))) as Array<{ detector_id: string; detector_name: string; rule_type: string; matched: boolean; matched_pattern: string | null } | null>

    const hits = results.filter(r => r !== null && r.matched)
    res.json({ total: detectors.length, hits: hits.length, results })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/detectors/validate — validate a regex pattern against Rust dialect compatibility
router.post('/validate', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { pattern, rule_type } = req.body as { pattern?: string; rule_type?: string }

    if (!pattern || typeof pattern !== 'string') {
      res.status(400).json({ valid: false, error: 'pattern is required' })
      return
    }

    const rt = (rule_type ?? 'regex').toLowerCase()
    if (rt !== 'regex') {
      res.json({ valid: true, rust_compatible: true, pattern })
      return
    }

    // Check for Rust-incompatible constructs (Rust regex crate lacks backtrack feature)
    const issues: string[] = []

     // 1. Backreferences (\1, \2, \k<name>) — NOT supported in Rust regex crate
    // Check for named capture backreference: \k<name>
    if (/\\k</.test(pattern)) {
      issues.push('Named capture backreferences (\\k<name>) are not supported in Rust regex')
    }

    // Check for numbered backreference: group followed by \digit (e.g., (\w+)\1)
    // Match: opening paren ... closing paren ... optional whitespace ... backslash ... digit 1-9
    if (/[\(].*[\)][\s]*\\[1-9]/.test(pattern)) {
      issues.push('Backreferences (\\1, \\2) are not supported by the Rust regex crate')
    }

    // 3. Variable-length lookbehind — Rust only supports fixed-width lookbehind
    // Detect (?<= or (?<! followed by unbounded quantifier (* or +)
    if (/[\(]\?<[=!][^)]*[*+].*\)/.test(pattern)) {
      issues.push('Variable-length lookbehind detected — Rust regex only supports fixed-width lookbehind')
    }

    // 4. Unicode property escapes with limited Rust support
    const propRe = /\\p\{([^}]+)\}/g
    let m: RegExpExecArray | null
    while ((m = propRe.exec(pattern)) !== null) {
      const inner = m[1].toLowerCase()
      if (/emoji_modifier|extended_pictographic|rune/.test(inner)) {
        issues.push(`Unicode property ${m[0]} may have limited support in Rust regex`)
      }
    }

    if (issues.length > 0) {
      res.status(422).json({ valid: false, rust_compatible: false, pattern, issues })
      return
    }

    // Pattern passes Rust-dialect validation
    res.json({ valid: true, rust_compatible: true, pattern })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
