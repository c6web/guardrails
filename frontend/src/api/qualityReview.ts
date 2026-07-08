import { apiFetch, getToken } from './client'

export interface ReviewResult {
  quality: 'good' | 'poison' | 'poor_quality'
  reason: string
}

export interface ReviewProgressEvent {
  current: number
  total: number
  succeeded: number
  failed: number
  target_name: string
  quality: string
  reason?: string
}

export interface ReviewCompleteEvent {
  total: number
  succeeded: number
  failed: number
}

export interface ReviewLogEntry {
  id: string
  target_type: string
  target_id: string
  target_name: string
  previous_result: string | null
  new_result: string
  reason: string
  reviewed_by: string
  reviewed_by_email: string
  review_provider_name?: string | null
  review_model?: string | null
  createdAt: string
}

// Single record review
export async function reviewRecord(resourceType: string, id: string): Promise<ReviewResult> {
  const res = await apiFetch<{ data: ReviewResult }>(`/api/review/${resourceType}/${id}`, {
    method: 'POST',
  })
  return res.data
}

// SSE bulk review stream
export function reviewAllStream(
  resourceType: string,
  onProgress: (e: ReviewProgressEvent) => void,
  onComplete: (e: ReviewCompleteEvent) => void,
  onError: (err: string) => void,
  newOnly?: boolean,
  onCount?: (total: number, firstTargetName: string, names: string[]) => void,
): { abort: () => void } {
  const controller = new AbortController()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  }

  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  fetch(`/api/review/${resourceType}/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ new_only: newOnly ?? false }),
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
              onProgress(parsed as ReviewProgressEvent)
            } else if (eventType === 'complete') {
              onComplete(parsed as ReviewCompleteEvent)
            } else if (eventType === 'error') {
              onError(parsed.error || 'Unknown stream error')
            } else if (eventType === 'count') {
              onCount?.(parsed.total, parsed.first_target_name || '', parsed.names || [])
            }
          } catch { /* skip malformed JSON */ }
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

// Get all review logs (with optional type filter)
export async function getAllReviewLogs(
  resourceType?: string,
  page = 1,
  limit = 30,
): Promise<{ data: ReviewLogEntry[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
  const q = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (resourceType) q.append('type', resourceType)
  return apiFetch(`/api/review/logs?${q}`)
}
