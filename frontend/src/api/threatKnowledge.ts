import { apiFetch, getToken } from './client'

export interface ThreatKnowledge {
  id: string
  name: string
  description: string
  threat_context: string | null
  embedding: number[] | null
  embedding_status?: 'no-embedding' | 'valid' | 'corrupted' | 'dimension-mismatch'
  embedding_at: string | null
  created_by: string | null
  updated_by: string | null
  status?: string
  source?: string
  origin_request_id?: string | null
  quality_review_result?: string | null
  quality_review_reason?: string | null
  quality_reviewed_at?: string | null
  quality_reviewed_by?: string | null
  createdAt: string
  updatedAt: string
}

export interface ThreatKnowledgeMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export async function getAllThreatKnowledge({ page, limit, search, sort, order, status, source, framework_id }: { page?: number; limit?: number; search?: string; sort?: string; order?: 'asc' | 'desc'; status?: string; source?: string; framework_id?: string }): Promise<{ data: ThreatKnowledge[]; meta: ThreatKnowledgeMeta }> {
  const params = new URLSearchParams()
  if (page) params.append('page', String(page))
  if (limit) params.append('limit', String(limit))
  if (search) params.append('search', search)
  if (sort) params.append('sort', sort)
  if (order) params.append('order', order)
  if (status) params.append('status', status)
  if (source) params.append('source', source)
  if (framework_id) params.append('framework_id', framework_id)
  const res = await apiFetch<{ data: ThreatKnowledge[]; meta: ThreatKnowledgeMeta }>(
    `/api/threat-knowledge${params.toString() ? '?' + params.toString() : ''}`
  )
  return res
}

export async function approveThreatKnowledge(id: string): Promise<ThreatKnowledge> {
  const res = await apiFetch<{ data: ThreatKnowledge }>(`/api/threat-knowledge/${id}/approve`, {
    method: 'POST',
  })
  return res.data
}

export async function rejectThreatKnowledge(id: string): Promise<ThreatKnowledge> {
  const res = await apiFetch<{ data: ThreatKnowledge }>(`/api/threat-knowledge/${id}/reject`, {
    method: 'POST',
  })
  return res.data
}

export async function getThreatKnowledgeById(id: string): Promise<ThreatKnowledge> {
  const res = await apiFetch<{ data: ThreatKnowledge }>(`/api/threat-knowledge/${id}`)
  return res.data
}

export async function createThreatKnowledge(payload: {
  name: string
  description: string
  threat_context?: string | null
}): Promise<ThreatKnowledge> {
  const res = await apiFetch<{ data: ThreatKnowledge }>('/api/threat-knowledge', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return res.data
}

export async function updateThreatKnowledge(
  id: string,
  payload: Partial<{ name: string; description: string; threat_context: string | null }>
): Promise<ThreatKnowledge> {
  const res = await apiFetch<{ data: ThreatKnowledge }>(`/api/threat-knowledge/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return res.data
}

export async function deleteThreatKnowledge(id: string): Promise<void> {
  await apiFetch(`/api/threat-knowledge/${id}`, { method: 'DELETE' })
}

export async function embedThreatKnowledge(id: string): Promise<ThreatKnowledge> {
  const res = await apiFetch<{ data: ThreatKnowledge }>(`/api/threat-knowledge/${id}/embed`, {
    method: 'POST',
  })
  return res.data
}

export interface ThreatKnowledgeStats {
  total: number
  embedded: number
  noEmbedding: number
  pct: number
  activeDim?: number | null
  mismatch?: number
  pending?: number
  qualityGood?: number
  qualityPoison?: number
  qualityPoor?: number
  qualityReviewed?: number
  qualityNotReviewed?: number
}

export async function getThreatKnowledgeStats(): Promise<ThreatKnowledgeStats> {
  const res = await apiFetch<{ data: ThreatKnowledgeStats }>('/api/threat-knowledge/stats')
  return res.data
}

export interface SemanticSearchResult {
  id: string
  name: string
  description: string
  threat_context: string | null
  embedding_at: string | null
  created_at: string
  updated_at: string
  similarity: number
}

export async function semanticSearchThreatKnowledge(
  input: string,
  threshold: number
): Promise<SemanticSearchResult[]> {
  const res = await apiFetch<{ data: SemanticSearchResult[] }>('/api/threat-knowledge/semantic-search', {
    method: 'POST',
    body: JSON.stringify({ input, threshold }),
  })
  return res.data
}

export interface EmbedProgressEvent {
  current: number
  total: number
  succeeded: number
  failed: number
  entry_name: string
  success: boolean
  error?: string
  skipped?: boolean
}

export interface EmbedCompleteEvent {
  total: number
  succeeded: number
  failed: number
  regenerated: number
  triggered_reload: boolean
}

export function embedNewThreatKnowledgeStream(
  onProgress: (e: EmbedProgressEvent) => void,
  onComplete: (e: EmbedCompleteEvent) => void,
  onError: (err: string) => void,
): { abort: () => void } {
  const controller = new AbortController()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  }

  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  fetch('/api/threat-knowledge/embed-new/stream', {
    method: 'POST',
    headers,
    signal: controller.signal,
  }).then(async resp => {
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      onError(`HTTP ${resp.status}: ${text}`)
      return
    }

    const reader = resp.body?.getReader()
    if (!reader) { onError('Response body not readable'); return }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      let eventType = ''
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim()
        } else if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          try {
            const parsed = JSON.parse(data)
            if (eventType === 'progress') {
              onProgress(parsed as EmbedProgressEvent)
            } else if (eventType === 'complete') {
              onComplete(parsed as EmbedCompleteEvent)
            } else if (eventType === 'error') {
              onError(parsed.error || 'Unknown stream error')
            }
          } catch { /* skip malformed JSON lines */ }
          eventType = ''
        }
      }
    }
  }).catch(err => {
    if (err instanceof DOMException && err.name === 'AbortError') return
    onError((err as Error).message || 'Stream connection failed')
  })

  return { abort: () => controller.abort() }
}

export function embedAllThreatKnowledgeStream(
  force: boolean,
  onProgress: (e: EmbedProgressEvent) => void,
  onComplete: (e: EmbedCompleteEvent) => void,
  onError: (err: string) => void,
): { abort: () => void } {
  const controller = new AbortController()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  }

  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  fetch('/api/threat-knowledge/embed-all/stream', {
    method: 'POST',
    headers,
    body: JSON.stringify({ force }),
    signal: controller.signal,
  }).then(async resp => {
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      onError(`HTTP ${resp.status}: ${text}`)
      return
    }

    const reader = resp.body?.getReader()
    if (!reader) { onError('Response body not readable'); return }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      let eventType = ''
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim()
        } else if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          try {
            const parsed = JSON.parse(data)
            if (eventType === 'progress') {
              onProgress(parsed as EmbedProgressEvent)
            } else if (eventType === 'complete') {
              onComplete(parsed as EmbedCompleteEvent)
            } else if (eventType === 'error') {
              onError(parsed.error || 'Unknown stream error')
            }
          } catch { /* skip malformed JSON lines */ }
          eventType = ''
        }
      }
    }
  }).catch(err => {
    if (err instanceof DOMException && err.name === 'AbortError') return
    onError((err as Error).message || 'Stream connection failed')
  })

  return { abort: () => controller.abort() }
}
