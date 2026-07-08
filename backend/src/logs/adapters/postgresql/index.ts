import { Sequelize, Op, literal } from 'sequelize'
import { v4 as uuidv4 } from 'uuid'
import { env } from '../../../config/env'
import { logFieldDecrypt } from '../../../utils/gatewayKeyCrypto'
import { initAiRequestLogModel, AiRequestLog } from '../../../models/logs-db/AiRequestLog'
import { initAuditLogModel, AuditLog } from '../../../models/logs-db/AuditLog'
import { initUserActivityLogModel, UserActivityLog } from '../../../models/logs-db/UserActivityLog'
import { initAdminActivityLogModel, AdminActivityLog } from '../../../models/logs-db/AdminActivityLog'
import { initEmbeddingLogModel, EmbeddingLog } from '../../../models/logs-db/EmbeddingLog'
import { initAiProviderCallLogModel, AiProviderCallLog } from '../../../models/logs-db/AiProviderCallLog'
import { initReloadLogModel, ReloadLog } from '../../../models/logs-db/ReloadLog'
import type { ILogStore } from '../../ILogStore'
import type {
  AiRequestLogData, AiRequestLogRecord,
  AuditLogData, AuditLogRecord,
  UserActivityLogData, UserActivityLogRecord,
  AdminActivityLogData, AdminActivityLogRecord,
  EmbeddingLogData, EmbeddingLogRecord,
  AiProviderCallLogData, AiProviderCallLogRecord,
  ReloadLogRecord,
  LogQueryOptions, LogQueryResult,
} from '../../types'

export class PostgreSQLLogStore implements ILogStore {
  public readonly sequelize: Sequelize

  constructor() {
    this.sequelize = new Sequelize({
      host: env.LOG_PG_HOST,
      port: env.LOG_PG_PORT,
      username: env.LOG_PG_USER,
      password: env.LOG_PG_PASSWORD,
      database: env.LOG_PG_DB,
      dialect: 'postgres',
      logging: env.NODE_ENV === 'development' ? console.log : false,
      pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
    })
  }

  async connect(): Promise<void> {
    initAiRequestLogModel(this.sequelize)
    initAuditLogModel(this.sequelize)
    initUserActivityLogModel(this.sequelize)
    initAdminActivityLogModel(this.sequelize)
    initEmbeddingLogModel(this.sequelize)
    initAiProviderCallLogModel(this.sequelize)
    initReloadLogModel(this.sequelize)
    await this.sequelize.authenticate()
    console.log('[LogStore:postgresql] Connected to', env.LOG_PG_DB)
  }

  // ── Writes ──────────────────────────────────────────────────────────────────

  async insertAiRequestLog(data: AiRequestLogData): Promise<void> {
    await AiRequestLog.create({ id: uuidv4(), ...data })
  }

  async insertAuditLog(data: AuditLogData): Promise<void> {
    await AuditLog.create({ id: uuidv4(), ...data })
  }

  async insertUserActivityLog(data: UserActivityLogData): Promise<void> {
    await UserActivityLog.create({ id: uuidv4(), ...data })
  }

  async insertAdminActivityLog(data: AdminActivityLogData): Promise<void> {
    await AdminActivityLog.create({ id: uuidv4(), ...data })
  }

  async insertEmbeddingLog(data: EmbeddingLogData): Promise<void> {
    await EmbeddingLog.create({ id: uuidv4(), ...data })
  }

  async insertAiProviderCallLog(data: AiProviderCallLogData): Promise<void> {
    await AiProviderCallLog.create(data)
  }

  // ── Reads ───────────────────────────────────────────────────────────────────

  async queryAiRequestLogs(opts: LogQueryOptions): Promise<LogQueryResult<AiRequestLogRecord>> {
    if (opts.filters['guardrail_request_id']) {
      opts.filters['request_id'] = opts.filters['guardrail_request_id']
      delete opts.filters['guardrail_request_id']
    }
    const where = buildWhere(opts.filters, ['app_id', 'flagged', 'framework_id', 'model', 'method', 'source_ip', 'user_prompt', 'request_id', 'path'])
    applyDateRange(where, opts.filters)
    const { count, rows } = await AiRequestLog.findAndCountAll({
      where,
      limit: opts.limit,
      offset: (opts.page - 1) * opts.limit,
      order: [['created_at', 'DESC']],
    })
    return { rows: rows.map(r => decryptRequestLog(normalizeLog(r.toJSON()))), total: count }
  }

  async queryAuditLogs(opts: LogQueryOptions): Promise<LogQueryResult<AuditLogRecord>> {
    const where = buildWhere(opts.filters, ['actor_id', 'actor_email', 'action', 'resource_type'])
    applyDateRange(where, opts.filters)
    const { count, rows } = await AuditLog.findAndCountAll({
      where,
      limit: opts.limit,
      offset: (opts.page - 1) * opts.limit,
      order: [['created_at', 'DESC']],
    })
    return { rows: rows.map(r => normalizeLog(r.toJSON())), total: count }
  }

  async queryUserActivityLogs(opts: LogQueryOptions): Promise<LogQueryResult<UserActivityLogRecord>> {
    const where = buildWhere(opts.filters, ['user_id', 'user_email', 'activity_type'])
    applyDateRange(where, opts.filters)
    const { count, rows } = await UserActivityLog.findAndCountAll({
      where,
      limit: opts.limit,
      offset: (opts.page - 1) * opts.limit,
      order: [['created_at', 'DESC']],
    })
    return { rows: rows.map(r => normalizeLog(r.toJSON())), total: count }
  }

  async queryAdminActivityLogs(opts: LogQueryOptions): Promise<LogQueryResult<AdminActivityLogRecord>> {
    const where = buildWhere(opts.filters, ['admin_id', 'admin_email', 'action', 'target_type'])
    applyDateRange(where, opts.filters)
    const { count, rows } = await AdminActivityLog.findAndCountAll({
      where,
      limit: opts.limit,
      offset: (opts.page - 1) * opts.limit,
      order: [['created_at', 'DESC']],
    })
    return { rows: rows.map(r => normalizeLog(r.toJSON())), total: count }
  }

  async queryEmbeddingLogs(opts: LogQueryOptions): Promise<LogQueryResult<EmbeddingLogRecord>> {
    const where = buildWhere(opts.filters, ['request_id', 'provider_id', 'provider_name', 'success', 'source'])
    applyDateRange(where, opts.filters)
    const { count, rows } = await EmbeddingLog.findAndCountAll({
      where,
      limit: opts.limit,
      offset: (opts.page - 1) * opts.limit,
      order: [['created_at', 'DESC']],
    })
    return { rows: rows.map(r => decryptEmbeddingLog(normalizeLog(r.toJSON()))), total: count }
  }

  async queryAiProviderCallLogs(opts: LogQueryOptions): Promise<LogQueryResult<AiProviderCallLogRecord>> {
    const where = buildWhere(opts.filters, ['call_type', 'provider_id', 'model', 'success', 'source', 'app_id', 'vendor'])
    applyDateRange(where, opts.filters)
    const { count, rows } = await AiProviderCallLog.findAndCountAll({
      where,
      limit: opts.limit,
      offset: (opts.page - 1) * opts.limit,
      order: [['id', 'DESC']],
    })
    return { rows: rows.map(r => decryptProviderCallLog(normalizeLog(r.toJSON()))), total: count }
  }

  async getAiProviderCallLogStats(filters: Record<string, unknown>): Promise<{ tokensInTotal: number; tokensOutTotal: number; tokensTotal: number; totalCalls: number }> {
    const where = buildWhere(filters, ['call_type', 'provider_id', 'model', 'success', 'source', 'app_id', 'vendor'])
    applyDateRange(where, filters)
    const result = await AiProviderCallLog.findOne({
      where,
      attributes: [
        [Sequelize.fn('COALESCE', Sequelize.fn('SUM', Sequelize.col('tokens_in')), 0), 'tokensInTotal'],
        [Sequelize.fn('COALESCE', Sequelize.fn('SUM', Sequelize.col('tokens_out')), 0), 'tokensOutTotal'],
        [Sequelize.fn('COALESCE', Sequelize.fn('SUM', Sequelize.col('tokens_total')), 0), 'tokensTotal'],
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'totalCalls'],
      ],
      raw: true,
    })
    return {
      tokensInTotal: Number((result as any).tokensInTotal) || 0,
      tokensOutTotal: Number((result as any).tokensOutTotal) || 0,
      tokensTotal: Number((result as any).tokensTotal) || 0,
      totalCalls: Number((result as any).totalCalls) || 0,
    }
  }

  // ── Deletes ──────────────────────────────────────────────────────────────────

  async deleteEmbeddingLog(id: string): Promise<boolean> {
    const result = await EmbeddingLog.destroy({ where: { id } })
    return result > 0
  }

  async bulkDeleteEmbeddingLogs(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0
    return EmbeddingLog.destroy({ where: { id: ids } })
  }

  async deleteAiProviderCallLog(id: string): Promise<boolean> {
    const result = await AiProviderCallLog.destroy({ where: { id } })
    return result > 0
  }

  async bulkDeleteAiProviderCallLogs(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0
    return AiProviderCallLog.destroy({ where: { id: ids } })
  }

  async deleteProviderCallLogsBefore(daysBack: number): Promise<number> {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - daysBack)
    const result = await AiProviderCallLog.destroy({ where: { created_at: { [Op.lte]: cutoff.toISOString() } } })
    return result
  }

  async deleteAllProviderCallLogs(): Promise<number> {
    return AiProviderCallLog.destroy({ where: {} })
  }

  async deleteAiRequestLog(id: string): Promise<boolean> {
    const result = await AiRequestLog.destroy({ where: { request_id: id } })
    return result > 0
  }

  async deleteAiRequestLogByRequestId(requestId: string): Promise<boolean> {
    const result = await AiRequestLog.destroy({ where: { request_id: requestId } })
    return result > 0
  }

  async bulkDeleteAiRequestLogs(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0
    const result = await AiRequestLog.destroy({
      where: { request_id: ids },
    })
    return result
  }

  async deleteAuditLog(id: string): Promise<boolean> {
    const result = await AuditLog.destroy({ where: { id } })
    return result > 0
  }

  async bulkDeleteAuditLogs(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0
    const result = await AuditLog.destroy({ where: { id: ids } })
    return result
  }

  async deleteUserActivityLog(id: string): Promise<boolean> {
    const result = await UserActivityLog.destroy({ where: { id } })
    return result > 0
  }

  async bulkDeleteUserActivityLogs(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0
    const result = await UserActivityLog.destroy({ where: { id: ids } })
    return result
  }

  async deleteUserActivityLogsBefore(daysBack: number): Promise<number> {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - daysBack)
    const result = await UserActivityLog.destroy({ where: { created_at: { [Op.lte]: cutoff.toISOString() } } })
    return result
  }

  async deleteAllUserActivityLogs(): Promise<number> {
    return UserActivityLog.destroy({ where: {} })
  }

  async deleteAdminActivityLog(id: string): Promise<boolean> {
    const result = await AdminActivityLog.destroy({ where: { id } })
    return result > 0
  }

  async bulkDeleteAdminActivityLogs(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0
    const result = await AdminActivityLog.destroy({ where: { id: ids } })
    return result
  }

  async deleteAdminActivityLogsBefore(daysBack: number): Promise<number> {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - daysBack)
    const result = await AdminActivityLog.destroy({ where: { created_at: { [Op.lte]: cutoff.toISOString() } } })
    return result
  }

  async deleteAllAdminActivityLogs(): Promise<number> {
    return AdminActivityLog.destroy({ where: {} })
  }

  async deleteEmbeddingLogsBefore(daysBack: number): Promise<number> {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - daysBack)
    const result = await EmbeddingLog.destroy({ where: { created_at: { [Op.lte]: cutoff.toISOString() } } })
    return result
  }

  async deleteAllEmbeddingLogs(): Promise<number> {
    return EmbeddingLog.destroy({ where: {} })
  }

  async deleteAiRequestLogsBefore(daysBack: number): Promise<number> {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - daysBack)
    const cutoffStr = cutoff.toISOString()
    let total = 0
    let count = 1
    while (count > 0) {
      const batch = await AiRequestLog.findAll({
        where: { created_at: { [Op.lte]: cutoffStr } },
        limit: 1000,
        attributes: ['id'],
      })
      if (batch.length === 0) break
      count = await AiRequestLog.destroy({ where: { id: batch.map(r => r.id) } })
      total += count
    }
    return total
  }

  async deleteAllAiRequestLogs(): Promise<number> {
    let total = 0
    let count = 1
    while (count > 0) {
      const batch = await AiRequestLog.findAll({ limit: 1000, attributes: ['id'] })
      if (batch.length === 0) break
      count = await AiRequestLog.destroy({ where: { id: batch.map(r => r.id) } })
      total += count
    }
    return total
  }

  async deleteAuditLogsBefore(daysBack: number): Promise<number> {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - daysBack)
    const result = await AuditLog.destroy({ where: { created_at: { [Op.lte]: cutoff.toISOString() } } })
    return result
  }

  async deleteAllAuditLogs(): Promise<number> {
    return AuditLog.destroy({ where: {} })
  }

  // ── Reload logs ─────────────────────────────────────────────────────────────

  async queryReloadLogs(opts: LogQueryOptions): Promise<LogQueryResult<ReloadLogRecord>> {
    const where = buildWhere(opts.filters, ['result', 'triggered_by', 'key_prefix', 'gateway_instance_id'])
    applyDateRange(where, opts.filters)
    const { count, rows } = await ReloadLog.findAndCountAll({
      where,
      limit: opts.limit,
      offset: (opts.page - 1) * opts.limit,
      order: [['created_at', 'DESC']],
    })
    return { rows: rows.map(r => normalizeLog(r.toJSON())), total: count }
  }

  async deleteReloadLog(id: string): Promise<boolean> {
    const result = await ReloadLog.destroy({ where: { id } })
    return result > 0
  }

  async bulkDeleteReloadLogs(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0
    return ReloadLog.destroy({ where: { id: ids } })
  }

  async deleteReloadLogsBefore(daysBack: number): Promise<number> {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - daysBack)
    const result = await ReloadLog.destroy({ where: { created_at: { [Op.lte]: cutoff.toISOString() } } })
    return result
  }

  async deleteAllReloadLogs(): Promise<number> {
    return ReloadLog.destroy({ where: {} })
  }

  // ── Classification feedback ────────────────────────────────────────────────

  async setClassificationFeedback(requestId: string, correct: boolean | null, reason?: string): Promise<boolean> {
    const updates: Record<string, unknown> = { is_classification_correct: correct }
    if (reason) updates['correction_reason'] = reason
    const [count] = await AiRequestLog.update(updates, { where: { request_id: requestId } })
    return count > 0
  }

  async countSimilarThreats(detector: string, sourceIp: string, userIdentifier: string): Promise<{ sameDetector: number; sameSource: number; sameUser: number }> {
    const since = literal(`NOW() - INTERVAL '24 hours'`)
    const base = { flagged: true, created_at: { [Op.gte]: since } }
    const [sameDetector, sameSource, sameUser] = await Promise.all([
      detector   ? AiRequestLog.count({ where: { ...base, detector } }) : Promise.resolve(0),
      sourceIp   ? AiRequestLog.count({ where: { ...base, source_ip: sourceIp } }) : Promise.resolve(0),
      userIdentifier ? AiRequestLog.count({ where: { ...base, app_api_key: userIdentifier } }) : Promise.resolve(0),
    ])
    return { sameDetector, sameSource, sameUser }
  }

  async markAsBenign(requestId: string, reason?: string): Promise<boolean> {
    const updates: Record<string, unknown> = { flagged: false }
    if (reason) updates['correction_reason'] = reason
    const [count] = await AiRequestLog.update(updates, { where: { request_id: requestId } })
    return count > 0
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

 
function normalizeLog<T>(plain: unknown): T {
  const raw = plain as Record<string, unknown>
  if (!raw['created_at'] && raw['createdAt'] !== null) {
    const v = raw['createdAt']
    raw['created_at'] = v instanceof Date ? v.toISOString() : v
    delete raw['createdAt']
  } else if (raw['created_at'] instanceof Date) {
    raw['created_at'] = (raw['created_at'] as Date).toISOString()
  }
  return raw as T
}

function buildWhere(
  filters: Record<string, unknown>,
  allowed: string[],
): Record<string, unknown> {
  const where: Record<string, unknown> = {}
  for (const key of allowed) {
    const val = filters[key]
    if (val !== undefined && val !== '') {
      if (Array.isArray(val)) {
        where[key] = { [Op.in]: val }
      } else {
        where[key] = val
      }
    }
  }
  return where
}

function applyDateRange(where: Record<string, unknown>, filters: Record<string, unknown>): void {
  const from = filters['from'] as string | undefined
  const to   = filters['to']   as string | undefined
  if (from || to) {
    const range: Record<symbol, Date> = {}
    if (from) range[Op.gte] = new Date(from)
    if (to)   range[Op.lte] = new Date(to)
    where['created_at'] = range
  }
}

function decryptRequestLog<T>(record: T): T {
  const r = record as Record<string, unknown>
  if (typeof r['user_prompt'] === 'string') r['user_prompt'] = logFieldDecrypt(r['user_prompt'])
  if (typeof r['response_body'] === 'string') r['response_body'] = logFieldDecrypt(r['response_body'])
  if (typeof r['raw_input_payload'] === 'string') r['raw_input_payload'] = logFieldDecrypt(r['raw_input_payload'])
  if (typeof r['raw_output_payload'] === 'string') r['raw_output_payload'] = logFieldDecrypt(r['raw_output_payload'])
  return record
}

function decryptEmbeddingLog<T>(record: T): T {
  const r = record as Record<string, unknown>
  if (typeof r['input_text'] === 'string') r['input_text'] = logFieldDecrypt(r['input_text'])
  return record
}

function decryptProviderCallLog<T>(record: T): T {
  const r = record as Record<string, unknown>
  for (const field of ['request_payload', 'response_payload']) {
    const v = r[field]
    if (typeof v !== 'string') continue
    const plain = logFieldDecrypt(v)
    try { r[field] = JSON.parse(plain) } catch { r[field] = plain }
  }
  return record
}
