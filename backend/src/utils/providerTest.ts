import { callLlmProvider, type LlmProviderConfig } from './llmProviderCall'

interface TestResult {
  success: boolean
  latency_ms: number
  response?: string
  error?: string
  request_payload?: object
  response_payload?: object
  status_code?: number
  tokens_in?: number | null
  tokens_out?: number | null
}

export async function runProviderTest(
  provider: { vendor: string; endpoint: string; api_key?: string | null; model?: string | null; max_output_token?: number | null; timeout_ms?: number | null },
  prompt: string,
  timeoutMs = 20000,
): Promise<TestResult> {
  const start = Date.now()

  if (!provider.model) {
    return { success: false, latency_ms: Date.now() - start, error: 'Provider has no model configured' }
  }

  const cfg: LlmProviderConfig = {
    id: provider.vendor ?? 'test',
    name: provider.vendor ?? 'test',
    vendor: provider.vendor,
    endpoint: provider.endpoint,
    api_key: provider.api_key,
    model: provider.model,
    timeout_ms: provider.timeout_ms ?? timeoutMs,
  }

  // Test with a simple user message (no system prompt)
  const result = await callLlmProvider(cfg, '', prompt)

  // Build TestResult from LlmCallResult
  const testResult: TestResult = {
    success: result.success,
    latency_ms: result.duration_ms,
    error: result.error,
    tokens_in: result.tokens_in,
    tokens_out: result.tokens_out,
    status_code: result.status_code ?? undefined,
    request_payload: result.request_payload,
    response_payload: result.response_payload,
  }

  if (result.success) {
    testResult.response = result.content
  }

  return testResult
}
