import { apiFetch } from './client'

export interface ContentQualityProviderConfig {
  id: number
  vendor: string
  service_url: string | null
  timeout_ms: number
  provider_id: string | null
  provider?: { id: string; name: string; vendor: string; status: string } | null
  has_service_api_key: boolean
}

export interface ContentQualityVendor {
  value: string
  label: string
}

export async function getContentQualityProvider(): Promise<ContentQualityProviderConfig> {
  const res = await apiFetch<{ data: ContentQualityProviderConfig }>('/api/content-quality-provider')
  return res.data
}

export async function getContentQualityVendors(): Promise<ContentQualityVendor[]> {
  const res = await apiFetch<{ data: ContentQualityVendor[] }>('/api/content-quality-provider/vendors')
  return res.data
}

export async function updateContentQualityProvider(payload: {
  vendor?: string
  service_url?: string | null
  service_api_key?: string | null
  timeout_ms?: number
  provider_id?: string | null
}): Promise<ContentQualityProviderConfig> {
  const res = await apiFetch<{ data: ContentQualityProviderConfig }>('/api/content-quality-provider', {
    method: 'PUT', body: JSON.stringify(payload),
  })
  return res.data
}

export async function testContentQualityProviderConnection(): Promise<{ success: boolean; error?: string }> {
  const res = await apiFetch<{ data: { success: boolean; error?: string } }>('/api/content-quality-provider/test', {
    method: 'POST',
  })
  return res.data
}

export interface ContentQualityTestResult {
  groundedness: number | null
  relevance: number | null
  hallucination: number | null
  reason: string | null
  duration_ms: number | null
}

export async function evaluateContentQualityTest(payload: {
  context: string
  response: string
}): Promise<ContentQualityTestResult> {
  const res = await apiFetch<{ data: ContentQualityTestResult }>('/api/content-quality-provider/evaluate-test', {
    method: 'POST', body: JSON.stringify(payload),
  })
  return res.data
}
