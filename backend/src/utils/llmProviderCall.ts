import type { ILogStore } from '../logs/ILogStore'
import type { EndpointInfo } from './validateEndpoint'
import { validateEndpoint, buildPinnedUrl } from './validateEndpoint'

export interface LlmProviderConfig {
  id: string
  name: string
  vendor: string
  endpoint: string
  api_key?: string | null
  model?: string | null
  timeout_ms?: number | null
}

export interface LlmCallResult {
  success: boolean
  content: string
  duration_ms: number
  tokens_in: number | null
  tokens_out: number | null
  status_code: number
  error?: string
  request_payload?: object
  response_payload?: object
}

function extractUsage(vendor: string, data: Record<string, unknown>): { tokens_in: number | null; tokens_out: number | null } {
  if (vendor === 'anthropic') {
    const usage = data['usage'] as Record<string, unknown> | undefined
    if (usage) {
      const tin  = typeof usage['input_tokens']  === 'number' ? usage['input_tokens']  as number : null
      const tout = typeof usage['output_tokens'] === 'number' ? usage['output_tokens'] as number : null
      if (tin !== null || tout !== null) return { tokens_in: tin, tokens_out: tout }
    }
  }
  const usage = data['usage'] as Record<string, unknown> | undefined
  if (usage) {
    const tin  = typeof usage['prompt_tokens']     === 'number' ? usage['prompt_tokens']     as number : null
    const tout = typeof usage['completion_tokens'] === 'number' ? usage['completion_tokens'] as number : null
    if (tin !== null || tout !== null) return { tokens_in: tin, tokens_out: tout }
  }
  if (data['prompt_eval_count'] !== undefined || data['eval_count'] !== undefined) {
    return {
      tokens_in:  typeof data['prompt_eval_count'] === 'number' ? data['prompt_eval_count'] as number : null,
      tokens_out: typeof data['eval_count']        === 'number' ? data['eval_count']        as number : null,
    }
  }
  return { tokens_in: null, tokens_out: null }
}

function openaiRequiresMaxCompletionTokens(model: string): boolean {
  return /^(o1|o3|o4|gpt-5)/.test(model)
}

/**
 * Make a chat completion call to any AI provider with proper auth, endpoint validation,
 * vendor-specific headers, and automatic logging to ai_provider_call_logs.
 */
export async function callLlmProvider(
  provider: LlmProviderConfig,
  systemPrompt: string,
  userMessage: string,
  logStore?: ILogStore,
  source?: string,
  _triggeredBy?: string,
): Promise<LlmCallResult> {
  const start = Date.now()

  if (!provider.model) {
    return { success: false, content: '', duration_ms: Date.now() - start, tokens_in: null, tokens_out: null, status_code: 0, error: 'Provider has no model configured' }
  }

  let endpointInfo: EndpointInfo
  try {
    endpointInfo = await validateEndpoint(provider.endpoint)
  } catch (e) {
    return { success: false, content: '', duration_ms: Date.now() - start, tokens_in: null, tokens_out: null, status_code: 0, error: (e as Error).message }
  }
  const pinned = buildPinnedUrl(endpointInfo)
  const baseUrl = pinned.url.replace(/\/$/, '')
  const extraHeaders = pinned.headers
  const timeout = source === 'quality-review'
    ? Math.max(provider.timeout_ms || 60000, 120000)
    : (provider.timeout_ms || 60000)
  const signal = AbortSignal.timeout(timeout)

  const logData: Partial<{
    call_type: string
    source: string
    provider_id: string
    provider_name: string
    vendor: string
    model: string
    endpoint: string
    request_payload: string
    response_payload: string
    tokens_in: number | null
    tokens_out: number | null
    tokens_total: number | null
    duration_ms: number
    status_code: number
    success: boolean
    error_message: string | null
    triggered_by: string | undefined
  }> | null = logStore ? {
    call_type: 'chat',
    source: source || '',
    provider_id: provider.id,
    provider_name: provider.name,
    vendor: provider.vendor,
    model: provider.model,
    endpoint: provider.endpoint,
  } : null

  const setLog = (patch: Record<string, unknown>) => { if (logData) Object.assign(logData, patch) }

  try {
    if (provider.vendor === 'anthropic') {
      const reqBody = {
        model: provider.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }
      setLog({ request_payload: JSON.stringify(reqBody) })

      const res = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': provider.api_key ?? '',
          'anthropic-version': '2023-06-01',
          ...extraHeaders,
        },
        body: JSON.stringify(reqBody),
        signal,
      })

      const duration_ms = Date.now() - start
      const data = await res.json() as Record<string, unknown>
      const usage = extractUsage('anthropic', data)
      setLog({ response_payload: JSON.stringify(data), status_code: res.status, duration_ms, tokens_in: usage.tokens_in, tokens_out: usage.tokens_out })

      if (res.ok) {
        const content = (data['content'] as Array<{ text?: string }>)?.[0]?.text ?? JSON.stringify(data)
        if (logData) { logData.success = true; await logStore!.insertAiProviderCallLog(logData as any) }
        return { success: true, content, duration_ms, tokens_in: usage.tokens_in, tokens_out: usage.tokens_out, status_code: res.status, request_payload: reqBody, response_payload: data }
      }

      const err = (data['error'] as { message?: string } | undefined)
      const errorMsg = err?.message ?? `HTTP ${res.status}`
      if (logData) { logData.success = false; logData.error_message = errorMsg; await logStore!.insertAiProviderCallLog(logData as any) }
      return { success: false, content: '', duration_ms, tokens_in: usage.tokens_in, tokens_out: usage.tokens_out, status_code: res.status, error: errorMsg, request_payload: reqBody, response_payload: data }
    }

    // OpenAI-compatible
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (provider.api_key) headers['Authorization'] = `Bearer ${provider.api_key}`
    if (provider.vendor === 'openrouter') {
      headers['HTTP-Referer'] = 'https://ai-firewall-gateway.local'
    }

    const body: Record<string, unknown> = {
      model: provider.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0,
    }
    if (provider.vendor === 'openai' && openaiRequiresMaxCompletionTokens(provider.model)) {
      body['max_completion_tokens'] = 4096
    } else {
      body['max_tokens'] = 4096
    }

    setLog({ request_payload: JSON.stringify(body) })

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { ...headers, ...extraHeaders },
      body: JSON.stringify(body),
      signal,
    })

    const duration_ms = Date.now() - start
    const raw = await res.text()
    let parsedData: Record<string, unknown> = {}
    let content = ''

    if (res.ok) {
      try {
        parsedData = JSON.parse(raw) as Record<string, unknown>
        type Msg = { content?: string; reasoning_content?: string }
        const msg = (parsedData['choices'] as Array<{ message?: Msg }> | undefined)?.[0]?.message
        content = msg?.content || msg?.reasoning_content || raw
      } catch {
        content = raw
      }
    }

    setLog({ response_payload: raw, status_code: res.status, duration_ms })

    if (res.ok) {
      const usage = extractUsage(provider.vendor, parsedData)
      setLog({ tokens_in: usage.tokens_in, tokens_out: usage.tokens_out, success: true })
      if (logData) await logStore!.insertAiProviderCallLog(logData as any)
      return { success: true, content, duration_ms, tokens_in: usage.tokens_in, tokens_out: usage.tokens_out, status_code: res.status, request_payload: body, response_payload: parsedData }
    }

    let errorMsg: string
    try {
      parsedData = JSON.parse(raw) as Record<string, unknown>
      errorMsg = (parsedData['error'] as { message?: string } | undefined)?.message ?? raw
    } catch { errorMsg = raw }

    const usage = extractUsage(provider.vendor, parsedData)
    setLog({ tokens_in: usage.tokens_in, tokens_out: usage.tokens_out, success: false, error_message: errorMsg })
    if (logData) await logStore!.insertAiProviderCallLog(logData as any)
    return { success: false, content: '', duration_ms, tokens_in: usage.tokens_in, tokens_out: usage.tokens_out, status_code: res.status, error: errorMsg, request_payload: body, response_payload: parsedData }

  } catch (err: unknown) {
    const duration_ms = Date.now() - start
    const errorMsg = (err as Error).message ?? 'Connection failed'
    if (logData) { logData.success = false; logData.error_message = errorMsg; logData.duration_ms = duration_ms; try { await logStore!.insertAiProviderCallLog(logData as any) } catch {} }
    return { success: false, content: '', duration_ms, tokens_in: null, tokens_out: null, status_code: 0, error: errorMsg }
  }
}
