import type {
  AiRequestLogData, AiRequestLogRecord,
  AuditLogData, AuditLogRecord,
  UserActivityLogData, UserActivityLogRecord,
  AdminActivityLogData, AdminActivityLogRecord,
  EmbeddingLogData, EmbeddingLogRecord,
  AiProviderCallLogData, AiProviderCallLogRecord,
  ReloadLogRecord,
  LogQueryOptions, LogQueryResult,
} from './types'

import type { Sequelize } from 'sequelize'

export interface ILogStore {
  /** Establish connection / initialise models. Called once during bootstrap. */
  connect(): Promise<void>

  // ── Write operations ────────────────────────────────────────────────────────
  insertAiRequestLog(data: AiRequestLogData): Promise<void>
  insertAuditLog(data: AuditLogData): Promise<void>
  insertUserActivityLog(data: UserActivityLogData): Promise<void>
  insertAdminActivityLog(data: AdminActivityLogData): Promise<void>
  insertEmbeddingLog(data: EmbeddingLogData): Promise<void>
  insertAiProviderCallLog(data: AiProviderCallLogData): Promise<void>

  // ── Read operations ─────────────────────────────────────────────────────────
  queryAiRequestLogs(opts: LogQueryOptions): Promise<LogQueryResult<AiRequestLogRecord>>
  queryAuditLogs(opts: LogQueryOptions): Promise<LogQueryResult<AuditLogRecord>>
  queryUserActivityLogs(opts: LogQueryOptions): Promise<LogQueryResult<UserActivityLogRecord>>
  queryAdminActivityLogs(opts: LogQueryOptions): Promise<LogQueryResult<AdminActivityLogRecord>>
  queryEmbeddingLogs(opts: LogQueryOptions): Promise<LogQueryResult<EmbeddingLogRecord>>
  queryAiProviderCallLogs(opts: LogQueryOptions): Promise<LogQueryResult<AiProviderCallLogRecord>>
  getAiProviderCallLogStats(filters: Record<string, unknown>): Promise<{ tokensInTotal: number; tokensOutTotal: number; tokensTotal: number; totalCalls: number }>

  // ── Reload log operations ────────────────────────────────────────────────────
  queryReloadLogs(opts: LogQueryOptions): Promise<LogQueryResult<ReloadLogRecord>>
  deleteReloadLog(id: string): Promise<boolean>
  bulkDeleteReloadLogs(ids: string[]): Promise<number>
  deleteReloadLogsBefore(daysBack: number): Promise<number>
  deleteAllReloadLogs(): Promise<number>

  // ── Delete operations ───────────────────────────────────────────────────────
  deleteEmbeddingLog(id: string): Promise<boolean>
  bulkDeleteEmbeddingLogs(ids: string[]): Promise<number>
  deleteEmbeddingLogsBefore(daysBack: number): Promise<number>
  deleteAllEmbeddingLogs(): Promise<number>
  deleteAiProviderCallLog(id: string): Promise<boolean>
  bulkDeleteAiProviderCallLogs(ids: string[]): Promise<number>
  deleteProviderCallLogsBefore(daysBack: number): Promise<number>
  deleteAllProviderCallLogs(): Promise<number>
  deleteAiRequestLog(id: string): Promise<boolean>
  deleteAiRequestLogByRequestId(requestId: string): Promise<boolean>
  bulkDeleteAiRequestLogs(ids: string[]): Promise<number>
  deleteAiRequestLogsBefore(daysBack: number): Promise<number>
  deleteAllAiRequestLogs(): Promise<number>
  deleteAuditLog(id: string): Promise<boolean>
  bulkDeleteAuditLogs(ids: string[]): Promise<number>
  deleteAuditLogsBefore(daysBack: number): Promise<number>
  deleteAllAuditLogs(): Promise<number>
  deleteUserActivityLog(id: string): Promise<boolean>
  bulkDeleteUserActivityLogs(ids: string[]): Promise<number>
  deleteUserActivityLogsBefore(daysBack: number): Promise<number>
  deleteAllUserActivityLogs(): Promise<number>
  deleteAdminActivityLog(id: string): Promise<boolean>
  bulkDeleteAdminActivityLogs(ids: string[]): Promise<number>
  deleteAdminActivityLogsBefore(daysBack: number): Promise<number>
  deleteAllAdminActivityLogs(): Promise<number>

  // ── Classification feedback operations ──────────────────────────────────────
  setClassificationFeedback(requestId: string, correct: boolean | null, reason?: string): Promise<boolean>

  // ── Benign (false-positive) operations ──────────────────────────────────────
  markAsBenign(requestId: string, reason?: string): Promise<boolean>

  // ── Stats operations ────────────────────────────────────────────────────────
  countSimilarThreats(detector: string, sourceIp: string, userIdentifier: string): Promise<{ sameDetector: number; sameSource: number; sameUser: number }>

  get sequelize(): Sequelize | undefined
}
