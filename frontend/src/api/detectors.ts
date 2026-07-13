import { apiFetch } from './client'

interface TestDetectorResult {
  detector_id: string
  detector_name: string
  rule_type: string
  matched: boolean
  matched_pattern: string | null
}

export interface BatchTestResult {
  total: number
  hits: number
  results: TestDetectorResult[]
}

export interface UIDetector {
  id: string
  name: string
  description: string
  keywords: string[]
  ruleType: 'keyword' | 'regex'
  frameworkIds: string[]
  owaspCodes?: string[]
  mode: string               // "block" | "flag" | "redact"
  category: string | null    // "CM01"–"CM05" for moderation; null for security detectors
  scanningScope: 'input' | 'output' | 'both'
  redactionPlaceholder?: string | null
  quality_review_result?: string | null
  quality_review_reason?: string | null
  quality_reviewed_at?: string | null
  quality_reviewed_by?: string | null
}

export interface FrameworkSummary {
  id: string
  name: string
  description: string
  framework_code: string
}

interface ApiDetector {
  id: string
  name: string
  description: string
  keywords: string[] | null
  rule_type: string
  threshold: number
  mode: string
  category: string | null
  scanning_scope: string
  redaction_placeholder?: string | null
  quality_review_result?: string | null
  quality_review_reason?: string | null
  quality_reviewed_at?: string | null
  quality_reviewed_by?: string | null
  detectionFrameworks?: Array<{ id: string }>
}

interface ApiFramework {
  id: string
  name: string
  description: string
  framework_code: string
}

function mapDetector(d: ApiDetector): UIDetector {
  return {
    id:                   d.id,
    name:                 d.name,
    description:          d.description,
    keywords:             d.keywords ?? [],
    ruleType:             (d.rule_type === 'regex' ? 'regex' : 'keyword') as 'keyword' | 'regex',
    frameworkIds:         d.detectionFrameworks?.map(fw => fw.id) ?? [],
    owaspCodes:           d.detectionFrameworks?.map(fw => fw.id) ?? [],
    mode:                 d.mode ?? 'block',
    category:             d.category ?? null,
    scanningScope:        (d.scanning_scope as 'input' | 'output' | 'both') ?? 'input',
    redactionPlaceholder: d.redaction_placeholder ?? null,
    quality_review_result: d.quality_review_result ?? null,
    quality_review_reason: d.quality_review_reason ?? null,
    quality_reviewed_at: d.quality_reviewed_at ?? null,
    quality_reviewed_by: d.quality_reviewed_by ?? null,
  }
}

export interface DetectorMeta { page: number; limit: number; total: number; totalPages: number }

export interface QualityStats { qualityGood: number; qualityPoison: number; qualityPoor: number; qualityReviewed: number; qualityNotReviewed: number }

export async function getDetectorQualityStats(): Promise<QualityStats> {
  const res = await apiFetch<{ data: QualityStats }>('/api/detectors/stats')
  return res.data
}

export async function getDetectors(params?: { page?: number; limit?: number; search?: string; sort?: string; order?: 'asc' | 'desc'; framework_id?: string }): Promise<{ data: UIDetector[]; meta: DetectorMeta }> {
  const q = new URLSearchParams()
  if (params?.page)  q.set('page',  String(params.page))
  if (params?.limit) q.set('limit', String(params.limit))
  if (params?.search && params.search.trim()) q.set('search', params.search.trim())
  if (params?.sort) q.set('sort', params.sort)
  if (params?.order) q.set('order', params.order)
  if (params?.framework_id) q.set('framework_id', params.framework_id)
  const url = q.toString() ? `/api/detectors?${q}` : '/api/detectors'
  const res = await apiFetch<{ data: ApiDetector[]; meta: DetectorMeta }>(url)
  return { data: res.data.map(mapDetector), meta: res.meta }
}

export async function createDetector(payload: {
  name: string
  description: string
  keywords?: string[]
  rule_type?: string
  scanning_scope?: string
  framework_ids?: string[]
  mode?: string
  redaction_placeholder?: string
}): Promise<UIDetector> {
  const res = await apiFetch<{ data: ApiDetector }>('/api/detectors', {
    method: 'POST',
    body:   JSON.stringify(payload),
  })
  return mapDetector(res.data)
}

export async function updateDetector(
  id: string,
  payload: {
    name?: string
    description?: string
    keywords?: string[]
    rule_type?: string
    scanning_scope?: string
    framework_ids?: string[]
    mode?: string
    redaction_placeholder?: string
  },
): Promise<UIDetector> {
  const res = await apiFetch<{ data: ApiDetector }>(`/api/detectors/${id}`, {
    method: 'PATCH',
    body:   JSON.stringify(payload),
  })
  return mapDetector(res.data)
}

export async function deleteDetector(id: string): Promise<void> {
  await apiFetch<{ data: { id: string } }>(`/api/detectors/${id}`, {
    method: 'DELETE',
  })
}

export function testDetectorLocal(
  ruleType: 'keyword' | 'regex',
  patterns: string[],
  prompt: string,
): { matched: boolean; matched_pattern: string | null; error?: string } {
  if (patterns.length === 0) return { matched: false, matched_pattern: null }
  if (ruleType === 'regex') {
    for (const p of patterns) {
      try {
        if (new RegExp(p, 'i').test(prompt)) return { matched: true, matched_pattern: p }
      } catch {
        return { matched: false, matched_pattern: null, error: `Invalid regex: ${p}` }
      }
    }
  } else {
    const lower = prompt.toLowerCase()
    for (const kw of patterns) {
      if (lower.includes(kw.toLowerCase())) return { matched: true, matched_pattern: kw }
    }
  }
  return { matched: false, matched_pattern: null }
}

export async function testAllDetectors(prompt: string): Promise<BatchTestResult> {
  return apiFetch<BatchTestResult>('/api/detectors/test-all', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  })
}

export async function getFrameworks(): Promise<FrameworkSummary[]> {
  const res = await apiFetch<{ data: ApiFramework[] }>('/api/detection-frameworks')
  return res.data.map((fw: ApiFramework) => ({
    id: fw.id,
    name: fw.name,
    description: fw.description,
    framework_code: fw.framework_code,
  }))
}

export async function addDetectorFramework(
  detectorId: string,
  frameworkId: string,
): Promise<UIDetector> {
  const res = await apiFetch<{ data: ApiDetector }>(`/api/detectors/${detectorId}/frameworks`, {
    method: 'POST',
    body: JSON.stringify({ framework_id: frameworkId }),
  })
  return mapDetector(res.data)
}

export async function removeDetectorFramework(
  detectorId: string,
  frameworkId: string,
): Promise<UIDetector> {
  const res = await apiFetch<{ data: ApiDetector }>(`/api/detectors/${detectorId}/frameworks/${frameworkId}`, {
    method: 'DELETE',
  })
  return mapDetector(res.data)
}
