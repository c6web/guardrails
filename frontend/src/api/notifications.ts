import { apiFetch } from './client'

export interface NotificationServer {
  id: string
  name: string
  description?: string | null
  type: string
  config: Record<string, unknown>
  is_default: boolean
  // Sequelize may serialize timestamps as camelCase or snake_case depending on version
  created_at?: string
  updated_at?: string
  createdAt?: string
  updatedAt?: string
}

export interface NotificationLog {
  id: string
  server_id: string | null
  server_name: string
  server_type: string
  recipient: string
  subject: string
  status: 'sent' | 'failed'
  error_message: string | null
  message_id: string | null
  triggered_by: string | null
  created_at: string
}

export interface LogMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export async function getNotificationServers(): Promise<NotificationServer[]> {
  const res = await apiFetch<{ data: NotificationServer[] }>('/api/notifications/servers')
  return res.data
}

export async function createNotificationServer(payload: {
  name: string; description?: string; type: string; config: Record<string, unknown>
}): Promise<NotificationServer> {
  const res = await apiFetch<{ data: NotificationServer }>('/api/notifications/servers', {
    method: 'POST', body: JSON.stringify(payload),
  })
  return res.data
}

export async function updateNotificationServer(id: string, payload: {
  name?: string; description?: string | null; config?: Record<string, unknown>
}): Promise<NotificationServer> {
  const res = await apiFetch<{ data: NotificationServer }>(`/api/notifications/servers/${id}`, {
    method: 'PATCH', body: JSON.stringify(payload),
  })
  return res.data
}

export async function deleteNotificationServer(id: string): Promise<void> {
  await apiFetch(`/api/notifications/servers/${id}`, { method: 'DELETE' })
}

export async function setDefaultNotificationServer(id: string): Promise<void> {
  await apiFetch(`/api/notifications/servers/${id}/set-default`, { method: 'POST' })
}

export async function testNotificationServer(
  id: string,
  recipient: string,
): Promise<{ success: boolean; message_id?: string; error?: string }> {
  const res = await apiFetch<{ data: { success: boolean; message_id?: string; error?: string } }>(
    `/api/notifications/servers/${id}/test`,
    { method: 'POST', body: JSON.stringify({ recipient }) },
  )
  return res.data
}

export async function getNotificationLogs(params: {
  page?: number; limit?: number; status?: string; server_id?: string; from?: string; to?: string
} = {}): Promise<{ data: NotificationLog[]; meta: LogMeta }> {
  const q = new URLSearchParams()
  if (params.page)      q.set('page',      String(params.page))
  if (params.limit)     q.set('limit',     String(params.limit))
  if (params.status)    q.set('status',    params.status)
  if (params.server_id) q.set('server_id', params.server_id)
  if (params.from)      q.set('from',      params.from)
  if (params.to)        q.set('to',        params.to)
  return apiFetch<{ data: NotificationLog[]; meta: LogMeta }>(
    `/api/notifications/logs?${q.toString()}`
  )
}

export async function deleteNotificationLog(id: string): Promise<void> {
  await apiFetch(`/api/notifications/logs/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function bulkDeleteNotificationLogs(ids: string[]): Promise<void> {
  await apiFetch('/api/notifications/logs/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
}

export async function deleteNotificationLogsBefore(daysBack: number): Promise<number> {
  const res = await apiFetch<{ deletedCount: number }>('/api/notifications/logs/delete-before', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ daysBack }),
  })
  return res.deletedCount
}

export async function deleteAllNotificationLogs(): Promise<number> {
  const res = await apiFetch<{ deletedCount: number }>('/api/notifications/logs/delete-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  return res.deletedCount
}
