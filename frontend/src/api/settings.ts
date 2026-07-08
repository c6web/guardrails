import { apiFetch } from './client'

export interface TableStatus {
  table: string
  column: string
  v2: number
  legacy: number
  total: number
}

export interface EncryptionStatusData {
  tables: TableStatus[]
  all_v2: boolean
}

export async function getEncryptionStatus(): Promise<EncryptionStatusData> {
  const res = await apiFetch<{ data: EncryptionStatusData }>('/api/settings/encryption-status')
  return res.data
}

export interface MigrateLogsResponse {
  status: 'started' | 'already_running'
  message: string
}

export async function triggerLogMigration(): Promise<MigrateLogsResponse> {
  const res = await apiFetch<{ data: MigrateLogsResponse }>('/api/settings/encryption-status/migrate-logs', {
    method: 'POST',
  })
  return res.data
}
