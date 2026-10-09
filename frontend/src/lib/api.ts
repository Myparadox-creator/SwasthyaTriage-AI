/**
 * Typed API client with silent refresh-on-401 and shared error shape.
 * The refresh token lives in an HttpOnly cookie (st_refresh) — the browser
 * sends it automatically, so a refresh is a plain POST with no body.
 */

export class ApiError extends Error {
  status: number
  code: string
  details: Record<string, unknown>

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

const ACCESS_KEY = 'st_access'
let refreshPromise: Promise<boolean> | null = null

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_KEY)
  } catch {
    return null
  }
}

export function setAccessToken(token: string | null) {
  try {
    if (token) localStorage.setItem(ACCESS_KEY, token)
    else localStorage.removeItem(ACCESS_KEY)
  } catch {
    /* ignore */
  }
}

function headers(forJson: boolean, hasBody: boolean): Headers {
  const h = new Headers()
  const token = getAccessToken()
  if (token) h.set('Authorization', `Bearer ${token}`)
  if (hasBody && forJson) h.set('Content-Type', 'application/json')
  return h
}

async function parseError(res: Response): Promise<ApiError> {
  let code = 'unknown_error'
  let message = 'Something went wrong. Please try again.'
  let details: Record<string, unknown> = {}
  try {
    const body = await res.json()
    code = body.error?.code ?? code
    message = body.error?.message ?? message
    details = body.error?.details ?? {}
  } catch {
    /* non-json body */
  }
  return new ApiError(res.status, code, message, details)
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
        if (!res.ok) return false
        const body = (await res.json()) as { access_token: string }
        setAccessToken(body.access_token)
        return true
      } catch {
        return false
      } finally {
        refreshPromise = null
      }
    })()
  }
  return refreshPromise
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; params?: Record<string, string | number | boolean | undefined> } = {},
): Promise<T> {
  const { method = 'GET', body, params } = options

  let url = path
  if (params) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
    }
    const s = qs.toString()
    if (s) url += `?${s}`
  }

  const hasBody = body !== undefined
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: headers(!(body instanceof FormData), hasBody),
    body: hasBody ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  })

  if (
    res.status === 401 &&
    !path.startsWith('/api/auth/login') &&
    !path.startsWith('/api/auth/clerk') &&
    !path.startsWith('/api/auth/refresh')
  ) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      const retry = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers: headers(!(body instanceof FormData), hasBody),
        body: hasBody ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
      })
      if (retry.ok) {
        const t = retry.status === 204 ? undefined : await retry.json()
        return t as T
      }
      throw await parseError(retry)
    }
  }

  if (!res.ok) throw await parseError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/** Fetch a binary response (e.g. a stored document) with the same auth + silent refresh. */
export async function fetchBlob(path: string): Promise<Blob> {
  const doFetch = (): Promise<Response> =>
    fetch(path, { method: 'GET', credentials: 'same-origin', headers: headers(false, false) })

  let res = await doFetch()
  if (
    res.status === 401 &&
    !path.startsWith('/api/auth/login') &&
    !path.startsWith('/api/auth/clerk') &&
    !path.startsWith('/api/auth/refresh')
  ) {
    const refreshed = await tryRefresh()
    if (refreshed) res = await doFetch()
  }
  if (!res.ok) throw await parseError(res)
  return res.blob()
}