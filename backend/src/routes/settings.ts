import type { Request, Response } from 'express';
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { getOrCreatePasswordPolicy } from '../models/data-db/PasswordPolicyConfig'
import { requireRole } from '../middleware/requireRole'
import { requireAuth } from '../middleware/auth'
import { EmbeddingProvider } from '../models/data-db/EmbeddingProvider'
import { getOrCreateConfig } from '../models/data-db/EmbeddingProviderConfig'
import { ThreatKnowledge } from '../models/data-db/ThreatKnowledge'
import { Op, QueryTypes } from 'sequelize'
import { getActiveEmbeddingDimension } from '../utils/embedding/activeDimension'
import { triggerGatewayReload } from '../utils/gatewayReload'
import { sequelizeDataDb, sequelizeLogsDb } from '../config/database'
import { env } from '../config/env'
import { encrypt as encryptValue, decrypt as decryptValue } from '../utils/gatewayKeyCrypto'

const router = Router()
router.use(requireAuth)

// GET /api/settings/password-policy — public (any logged-in user)
router.get('/password-policy', async (_req: Request, res: Response): Promise<void> => {
  try {
    const cfg = await getOrCreatePasswordPolicy()
    res.json({ data: {
      min_length: cfg.min_length,
      require_uppercase: cfg.require_uppercase,
      require_lowercase: cfg.require_lowercase,
      require_digit: cfg.require_digit,
      require_special: cfg.require_special,
    } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/settings/password-policy — admin only
router.put('/password-policy', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const cfg = await getOrCreatePasswordPolicy()
    const body = req.body as {
      min_length?: number
      require_uppercase?: boolean
      require_lowercase?: boolean
      require_digit?: boolean
      require_special?: boolean
    }

    cfg.min_length            = typeof body.min_length === 'number' ? body.min_length : cfg.min_length
    cfg.require_uppercase     = typeof body.require_uppercase === 'boolean' ? body.require_uppercase : cfg.require_uppercase
    cfg.require_lowercase     = typeof body.require_lowercase === 'boolean' ? body.require_lowercase : cfg.require_lowercase
    cfg.require_digit         = typeof body.require_digit === 'boolean' ? body.require_digit : cfg.require_digit
    cfg.require_special       = typeof body.require_special === 'boolean' ? body.require_special : cfg.require_special

    await cfg.save()
    res.json({ success: true, data: {
      min_length: cfg.min_length,
      require_uppercase: cfg.require_uppercase,
      require_lowercase: cfg.require_lowercase,
      require_digit: cfg.require_digit,
      require_special: cfg.require_special,
    } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/users/:id/change-password — user changes own password (subject to policy)
router.post('/users/:id/change-password', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params.id as string
    const newPassword = req.body?.password
    if (!newPassword) { res.status(400).json({ error: 'Password is required' }); return }

    const cfg = await getOrCreatePasswordPolicy()
    const errors: string[] = []

    // Validate against password policy
    if (newPassword.length < cfg.min_length) {
      errors.push(`Password must be at least ${cfg.min_length} characters`)
    }
    if (cfg.require_uppercase && !/[A-Z]/.test(newPassword)) {
      errors.push('Password must contain an uppercase letter')
    }
    if (cfg.require_lowercase && !/[a-z]/.test(newPassword)) {
      errors.push('Password must contain a lowercase letter')
    }
    if (cfg.require_digit && !/[0-9]/.test(newPassword)) {
      errors.push('Password must contain a digit')
    }
    if (cfg.require_special && !/[^A-Za-z0-9]/.test(newPassword)) {
      errors.push('Password must contain a special character')
    }

    if (errors.length > 0) {
      res.status(400).json({ error: 'Password does not meet policy requirements', violations: errors })
      return
    }

    const newHash = await bcrypt.genSalt(12).then(salt => bcrypt.hash(newPassword, salt))
    const { User } = require('../models/users-db/User')
    const user = await User.findByPk(userId)
    if (!user) { res.status(404).json({ error: 'User not found' }); return }

    user.password_hash = newHash
    await user.save()

    res.json({ success: true, message: `Password updated for ${user.email}` })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/settings/embedding — admin only
router.get('/embedding', requireRole('admin'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const config = await getOrCreateConfig()
    const activeDim = await getActiveEmbeddingDimension()

    let primaryProvider: any = null
    if (config.primary_id) {
      const p = await EmbeddingProvider.findByPk(config.primary_id)
      if (p) primaryProvider = { id: p.id, name: p.name, model: p.model, dimensions: p.dimensions }
    }

    const total = await ThreatKnowledge.count()
    const embedded = await ThreatKnowledge.count({ where: { embedding: { [Op.ne]: null } } })
    
    let mismatch = 0
    if (activeDim !== null && activeDim !== undefined) {
      const rows = await (ThreatKnowledge as any).sequelize.query(
        `SELECT COUNT(*) AS cnt FROM threat_knowledge WHERE embedding IS NOT NULL AND array_length(embedding::real[], 1) != :dim`,
        {
          replacements: { dim: activeDim },
          type: QueryTypes.SELECT,
        }
      )
      mismatch = parseInt((rows as any[])[0]?.cnt ?? '0', 10)
    }

    res.json({ data: {
      dimensions: config.dimensions,
      active_dim: activeDim,
      semantic_threshold: config.semantic_threshold,
      primary_provider: primaryProvider,
      threat_knowledge: { total, embedded, mismatch },
    } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/settings/embedding — admin only
router.put('/embedding', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const config = await getOrCreateConfig()
    const newDim = req.body?.dimensions as number | undefined
    const newThreshold = req.body?.semantic_threshold as number | undefined
    const hasDim = newDim !== undefined

    // dimensions and semantic_threshold can be updated independently
    if (hasDim && (typeof newDim !== 'number' || !Number.isInteger(newDim) || newDim <= 0)) {
      res.status(400).json({ error: 'dimensions must be a positive integer' })
      return
    }

    if (newThreshold !== undefined) {
      if (typeof newThreshold !== 'number' || newThreshold < 0 || newThreshold > 1) {
        res.status(400).json({ error: 'semantic_threshold must be a number between 0 and 1' })
        return
      }
      config.semantic_threshold = newThreshold
    }

    if (hasDim) config.dimensions = newDim as number
    await config.save()

    // Only re-sync provider dimensions when the dimension actually changed
    if (hasDim) {
      const providerIds = [config.primary_id, config.backup1_id, config.backup2_id].filter(Boolean) as string[]
      for (const id of providerIds) {
        const provider = await EmbeddingProvider.findByPk(id)
        if (provider) {
          await provider.update({ dimensions: newDim as number })
        }
      }
    }

    await triggerGatewayReload()

    res.json({ success: true, data: {
      dimensions: config.dimensions,
      active_dim: config.dimensions,
      semantic_threshold: config.semantic_threshold,
    } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Encryption status (admin-only) ──────────────────────────────────────────
// Re-encryption uses the canonical decrypt/encrypt from gatewayKeyCrypto.ts
// (format-sniffing decrypt + versioned "v2:" encrypt) rather than a local
// copy, so this code path can't drift from the source of truth.

interface TableStatus {
  table: string
  column: string
  v2: number
  legacy: number
  total: number
}

router.get('/encryption-status', requireRole('admin'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const status: TableStatus[] = []

    // Tier-1 tables (data-db)
    const dataTables: [string, string, string | null][] = [
      ['gateway_api_keys', 'key_encrypted', null],
      ['api_keys', 'key_encrypted', null],
      ['ai_providers', 'api_key', null],
      ['embedding_providers', 'api_key', null],
      ['admin_api_keys', 'key_value', null],
    ]
    for (const [table, col] of dataTables) {
      const total = (await sequelizeDataDb.query(
        `SELECT COUNT(*) AS cnt FROM ${table} WHERE ${col} IS NOT NULL AND ${col} != ''`,
        { type: QueryTypes.SELECT }
      ) as any[])[0]?.cnt ?? 0
      const v2 = (await sequelizeDataDb.query(
        `SELECT COUNT(*) AS cnt FROM ${table} WHERE ${col} IS NOT NULL AND ${col} LIKE 'v2:%'`,
        { type: QueryTypes.SELECT }
      ) as any[])[0]?.cnt ?? 0
      status.push({ table, column: col, v2: Number(v2), legacy: Number(total) - Number(v2), total: Number(total) })
    }

    // notification_servers (JSONB config with enc:/v2: sub-keys)
    const nsTotal = (await sequelizeDataDb.query(
      `SELECT COUNT(*) AS cnt FROM notification_servers WHERE config IS NOT NULL`,
      { type: QueryTypes.SELECT }
    ) as any[])[0]?.cnt ?? 0
    const nsRows = await sequelizeDataDb.query(
      `SELECT config FROM notification_servers WHERE config IS NOT NULL`,
      { type: QueryTypes.SELECT }
    ) as any[]
    let nsV2 = 0
    let nsLegacy = 0
    for (const row of nsRows) {
      const config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config
      let hasV2 = false
      let hasLegacy = false
      for (const key of ['password', 'api_key', 'secret']) {
        const v = config[key]
        if (typeof v === 'string') {
          if (v.startsWith('v2:')) hasV2 = true
          else if (v.startsWith('enc:')) hasLegacy = true
        }
      }
      if (hasV2 && !hasLegacy) nsV2++
      else if (hasLegacy) nsLegacy++
    }
    status.push({ table: 'notification_servers', column: 'config.*', v2: nsV2, legacy: nsLegacy, total: nsTotal })

    // Tier-2 tables (logs-db)
    const logColumns: [string, string[]][] = [
      ['ai_request_logs', ['user_prompt', 'response_body', 'raw_input_payload', 'raw_output_payload']],
      ['embedding_logs', ['input_text']],
      ['ai_provider_call_logs', ['request_payload', 'response_payload']],
    ]
    for (const [table, columns] of logColumns) {
      let totalRows = 0, v2Rows = 0
      for (const col of columns) {
        const total = (await sequelizeLogsDb.query(
          `SELECT COUNT(*) AS cnt FROM ${table} WHERE ${col} IS NOT NULL AND ${col} != ''`,
          { type: QueryTypes.SELECT }
        ) as any[])[0]?.cnt ?? 0
        const v2 = (await sequelizeLogsDb.query(
          `SELECT COUNT(*) AS cnt FROM ${table} WHERE ${col} IS NOT NULL AND ${col} LIKE 'v2:%'`,
          { type: QueryTypes.SELECT }
        ) as any[])[0]?.cnt ?? 0
        totalRows += Number(total)
        v2Rows += Number(v2)
      }
      status.push({ table, column: 'multiple', v2: v2Rows, legacy: totalRows - v2Rows, total: totalRows })
    }

    const allV2 = status.every(s => s.legacy === 0)
    res.json({ data: { tables: status, all_v2: allV2 } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Background migration state
let logMigrationRunning = false

router.post('/encryption-status/migrate-logs', requireRole('admin'), async (_req: Request, res: Response): Promise<void> => {
  try {
    if (logMigrationRunning) {
      res.json({ data: { status: 'already_running', message: 'Log field migration is already in progress.' } })
      return
    }

    logMigrationRunning = true
    res.json({ data: { status: 'started', message: 'Log field backfill migration started.' } })

    const secret = env.PLATFORM_KEY_SECRET
    const BATCH = 200
    const DELAY_MS = 50

    const logColumns: [string, string, string][] = [
      ['ai_request_logs', 'user_prompt', 'log-field'],
      ['ai_request_logs', 'response_body', 'log-field'],
      ['ai_request_logs', 'raw_input_payload', 'log-field'],
      ['ai_request_logs', 'raw_output_payload', 'log-field'],
      ['embedding_logs', 'input_text', 'log-field'],
      ['ai_provider_call_logs', 'request_payload', 'log-field'],
      ['ai_provider_call_logs', 'response_payload', 'log-field'],
    ]

    ;(async () => {
      for (const [table, col, purpose] of logColumns) {
        let total = 0
        while (true) {
          try {
            const rows = await sequelizeLogsDb.query(
              `SELECT ctid, ${col} FROM ${table} WHERE ${col} IS NOT NULL AND ${col} LIKE 'enc:%' LIMIT ${BATCH}`,
              { type: QueryTypes.SELECT }
            ) as any[]

            if (rows.length === 0) break

            for (const row of rows) {
              try {
                const val: string = row[col]
                if (!val.startsWith('enc:')) continue
                const plaintext = decryptValue(val, secret, purpose)
                const reenc = encryptValue(plaintext, secret, purpose)
                await sequelizeLogsDb.query(
                  `UPDATE ${table} SET ${col} = :val WHERE ctid = :ctid`,
                  { replacements: { val: reenc, ctid: row.ctid }, type: QueryTypes.UPDATE }
                )
                total++
              } catch { /* skip unreadable rows */ }
            }

            await new Promise(r => setTimeout(r, DELAY_MS))
          } catch (err) {
            console.error(`[encryption-migrate] ${table}.${col} batch error:`, err)
            await new Promise(r => setTimeout(r, 2000))
          }
        }
        console.log(`[encryption-migrate] ${table}.${col}: ${total} rows migrated`)
      }
      console.log('[encryption-migrate] log field backfill complete')
      logMigrationRunning = false
    })().catch(err => {
      console.error('[encryption-migrate] fatal error:', err)
      logMigrationRunning = false
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
