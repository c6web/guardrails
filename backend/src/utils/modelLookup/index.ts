import { getAdapter } from './registry'
import type { ModelLookupProvider, ModelEntry } from './types'
import { ModelLookupError } from './types'
import { validateEndpoint, buildPinnedUrl } from '../validateEndpoint'
import type { EndpointInfo } from '../validateEndpoint'
import { extractErrorMessage } from '../embedding/adapters/base'

export { ModelLookupError } from './types'
export type { ModelEntry } from './types'

export async function fetchModels(
  provider: ModelLookupProvider,
  timeoutMs: number,
): Promise<ModelEntry[]> {
  const adapter = getAdapter(provider.vendor ?? '')

  const rawUrl = adapter.getUrl(provider)
  let endpointInfo: EndpointInfo
  try {
    endpointInfo = await validateEndpoint(rawUrl)
  } catch (e: unknown) {
    throw new ModelLookupError(`Invalid endpoint: ${(e as Error).message}`)
  }
  const pinned = buildPinnedUrl(endpointInfo)
  const headers = { ...adapter.buildHeaders(provider), ...pinned.headers }

  let res: Response
  try {
    res = await fetch(pinned.url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err: unknown) {
    const e = err as Error
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      throw new ModelLookupError(`Provider timed out after ${timeoutMs}ms`)
    }
    throw new ModelLookupError(`Network error: ${e.message}`)
  }

  const raw = await res.text()
  if (!res.ok) {
    throw new ModelLookupError(extractErrorMessage(raw))
  }

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new ModelLookupError('Invalid JSON response from provider')
  }

  return adapter.parseResponse(data)
}
