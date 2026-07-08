// Plain TypeScript interfaces for all log record shapes.
// Kept free of any ORM types so every adapter can implement them.

export interface AiRequestLogData {
  request_id: string
  app_id: string
  app_name: string
  model: string
  method: string
  path: string
  source_ip: string
  app_api_key: string
  tokens_in: number
  tokens_out: number
  duration_ms: number
  status_code: number
  flagged?: boolean
  framework_id?: string | null
  detector?: string | null
  confidence?: number | null
  action?: string | null
  threat_title?: string | null
  excerpt?: string | null
  user_prompt?: string | null
  response_body?: string | null
  upstream_provider_id?: string | null
  upstream_provider_name?: string | null
  classifier_provider_id?: string | null
  classifier_provider_name?: string | null
  pipeline_trace?: unknown | null
  final_decision?: string | null
  blocked_stage?: string | null
  gateway_instance_id?: string | null
  cache_hit?: boolean | null
  cache_tier?: string | null
}

export interface AuditLogData {
  actor_id?: string | null
  actor_email: string
  action: string
  resource_type: string
  resource_id: string
  details: object
  ip_address: string
}

export interface UserActivityLogData {
  user_id?: string | null
  user_email: string
  activity_type: string
  details: object
  ip_address: string
}

export interface AdminActivityLogData {
  admin_id: string
  admin_email: string
  action: string
  target_type: string
  target_id?: string | null
  before_state?: object | null
  after_state?: object | null
  ip_address: string
}

// Record types include generated fields (id, created_at)
export interface AiRequestLogRecord extends AiRequestLogData {
  id: string
  created_at: Date
  pipeline_trace?: unknown | null
  final_decision?: string | null
  blocked_stage?: string | null
}

export interface AuditLogRecord extends AuditLogData {
  id: string
  created_at: Date
}

export interface UserActivityLogRecord extends UserActivityLogData {
  id: string
  created_at: Date
}

export interface AdminActivityLogRecord extends AdminActivityLogData {
  id: string
  created_at: Date
}

export interface EmbeddingLogData {
  request_id?: string | null
  provider_id: string
  provider_name: string
  model?: string | null
  input_chars: number
  input_text?: string | null
  dimensions?: number | null
  success: boolean
  error_message?: string | null
  duration_ms: number
  source: string
}

export interface EmbeddingLogRecord extends EmbeddingLogData {
  id: string
  created_at: Date
}

export interface AiProviderCallLogData {
  request_id?: string | null
  call_type: string
  source: string
  app_id?: string | null
  app_name?: string | null
  provider_id?: string | null
  provider_name?: string | null
  vendor?: string | null
  model?: string | null
  endpoint?: string | null
  request_payload?: string | null
  response_payload?: string | null
  tokens_in?: number | null
  tokens_out?: number | null
  tokens_total?: number | null
  duration_ms: number
  status_code?: number | null
  success: boolean
  error_message?: string | null
  triggered_by?: string | null
}

export interface AiProviderCallLogRecord extends AiProviderCallLogData {
  id: string
  created_at: Date
}

interface ReloadLogData {
  triggered_by: string
  key_prefix: string
  gateway_instance_id?: string | null
  source_ip: string
  result: string
  error_message?: string | null
  duration_ms: number
}

export interface ReloadLogRecord extends ReloadLogData {
  id: string
  created_at: Date
}

export interface LogQueryOptions {
  page: number
  limit: number
  filters: Record<string, unknown>
}

export interface LogQueryResult<T> {
  rows: T[]
  total: number
}
