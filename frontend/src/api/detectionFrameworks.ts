import { apiFetch } from './client'

export interface ThreatKnowledgeSummary {
  id: string
  name: string
  description: string
  threat_context: string | null
  embedding_at: string | null
}

export interface DetectorSummary {
  id: string
  name: string
  description: string
  rule_type: string
  threshold: number
}

export interface DetectionFramework {
  id: string
  framework_code: string
  name: string
  description: string
  display_order: number
  threatKnowledgeEntries: ThreatKnowledgeSummary[]
  detectors: DetectorSummary[]
  created_at: string
  updated_at: string
}

export interface FrameworkMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export async function getAllDetectionFrameworks({ page, limit }: { page?: number; limit?: number } = {}): Promise<{ data: DetectionFramework[]; meta: FrameworkMeta }> {
  const params = new URLSearchParams()
  if (page) params.append('page', String(page))
  if (limit) params.append('limit', String(limit))
  const res = await apiFetch<{ data: DetectionFramework[]; meta: FrameworkMeta }>(
    `/api/detection-frameworks${params.toString() ? '?' + params.toString() : ''}`
  )
  return res
}

export async function createDetectionFramework(payload: {
  id?: string
  framework_code: string
  name: string
  description: string
  display_order?: number
}): Promise<DetectionFramework> {
  const data = await apiFetch<{ data: DetectionFramework }>('/api/detection-frameworks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return data.data
}

export async function updateDetectionFramework(
  id: string,
  updates: Partial<Pick<DetectionFramework, 'name' | 'description' | 'framework_code'>>
): Promise<DetectionFramework> {
  const data = await apiFetch<{ data: DetectionFramework }>(`/api/detection-frameworks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  return data.data
}

export async function deleteDetectionFramework(id: string): Promise<void> {
  await apiFetch(`/api/detection-frameworks/${id}`, { method: 'DELETE' })
}

export async function addThreatKnowledgeMapping(
  frameworkId: string,
  tkId: string
): Promise<DetectionFramework> {
  const data = await apiFetch<{ data: DetectionFramework }>(
    `/api/detection-frameworks/${frameworkId}/threat-knowledge`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threat_knowledge_id: tkId }),
    }
  )
  return data.data
}

export async function removeThreatKnowledgeMapping(
  frameworkId: string,
  tkId: string
): Promise<DetectionFramework> {
  const data = await apiFetch<{ data: DetectionFramework }>(
    `/api/detection-frameworks/${frameworkId}/threat-knowledge/${tkId}`,
    { method: 'DELETE' }
  )
  return data.data
}

export async function addDetectorMapping(
  frameworkId: string,
  detectorId: string
): Promise<DetectionFramework> {
  const data = await apiFetch<{ data: DetectionFramework }>(
    `/api/detection-frameworks/${frameworkId}/detectors`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ detector_id: detectorId }),
    }
  )
  return data.data
}

export async function removeDetectorMapping(
  frameworkId: string,
  detectorId: string
): Promise<DetectionFramework> {
  const data = await apiFetch<{ data: DetectionFramework }>(
    `/api/detection-frameworks/${frameworkId}/detectors/${detectorId}`,
    { method: 'DELETE' }
  )
  return data.data
}

export async function getAllDetectors(search?: string): Promise<DetectorSummary[]> {
  const params = search ? `?search=${encodeURIComponent(search)}` : ''
  const data = await apiFetch<{ data: DetectorSummary[] }>(`/api/detectors${params}`)
  return data.data
}

