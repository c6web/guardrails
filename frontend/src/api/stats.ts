import { apiFetch } from './client'

export interface OverviewStats {
  requests_24h: number
  allowed_24h: number
  flagged_24h: number
  error_24h: number
  blocked_24h: number
  threat_rate: number
  flag_rate: number
  error_rate: number
  avg_latency_ms: number
  tokens_in_24h: number
  tokens_out_24h: number
  volume_bars: { hour: string; total: number; allowed: number; flagged: number; error: number; blocked: number; tokens: number }[]
}

interface FrameworkMeta {
  fw_id: string
  framework_code: string
  fw_name: string
  display_order: number
}

export interface HeatmapStats {
  cells: { fw_id: string; hour_bucket: string; threats: number }[]
  frameworks: FrameworkMeta[]
}

export interface AppStats {
  app_id: string
  app_name: string
  requests_24h: number
  blocked_24h: number
  avg_latency_ms: number
  hourly_bars: number[]
}

export interface FrameworkCount {
  fw_id: string
  framework_code: string
  fw_name: string
  count: number
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const res = await apiFetch<OverviewStats>('/api/stats/overview')
  return res
}

export async function getFrameworkCounts(): Promise<FrameworkCount[]> {
  const res = await apiFetch<{ counts: FrameworkCount[] }>('/api/stats/framework-counts')
  return res.counts
}

export async function getHeatmapStats(): Promise<HeatmapStats> {
  const res = await apiFetch<HeatmapStats>('/api/stats/heatmap')
  return res
}

export async function getAppStats(): Promise<AppStats[]> {
  const res = await apiFetch<AppStats[]>('/api/stats/apps')
  return res
}

export interface T2Stats {
  t2_scanned: number
  t2_flagged: number
  blocked_by_t2: number
  avg_t2_confidence: number | null
  t2_flag_rate: number
  hourly_bars: { hour: string; scanned: number; flagged: number }[]
  by_app: { app_name: string; t2_scanned: number; t2_flagged: number; t2_blocked: number }[]
  top_reasons: { reason: string; count: number }[]
}

export async function getT2Stats(): Promise<T2Stats> {
  return apiFetch<T2Stats>('/api/stats/t2')
}

export interface ContentQualityStats {
  scanned: number
  flagged: number
  blocked: number
  redacted: number
  avg_groundedness: number | null
  avg_relevance: number | null
  flag_rate: number
  by_app: { app_name: string; scanned: number; flagged: number; blocked: number }[]
}

export async function getContentQualityStats(): Promise<ContentQualityStats> {
  return apiFetch<ContentQualityStats>('/api/stats/content-quality')
}
