// Base fetch wrapper — attaches access token, handles 401 → refresh → retry.

let accessToken: string | null = localStorage.getItem('access_token')

export function setToken(token: string | null) {
  accessToken = token
  if (token) localStorage.setItem('access_token', token)
  else localStorage.removeItem('access_token')
}

export function getToken(): string | null {
  return accessToken
}

let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
      })
      
      if (!res.ok) return null
      
      const body = await res.json() as { accessToken: string }
      setToken(body.accessToken)
      return body.accessToken
    } catch (_err) {
      return null
    }
  })()

  try {
    const result = await refreshPromise
    return result
  } finally {
    refreshPromise = null
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> ?? {}),
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  const fetchOpts: RequestInit = { ...init, headers, credentials: 'include' as const }
  let res = await fetch(path, fetchOpts)

  if (res.status === 401 && accessToken) {
    const newToken = await refreshAccessToken()
    
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`
      const retryOpts: RequestInit = { ...init, headers, credentials: 'include' as const }
      res = await fetch(path, retryOpts)
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new ApiError(res.status, body.error ?? res.statusText)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}
