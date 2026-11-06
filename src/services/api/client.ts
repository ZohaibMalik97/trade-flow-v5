/**
 * Centralised HTTP client for the TradeFlow API.
 *
 *  - Base URL from VITE_API_BASE_URL (default "/api/v1", proxied by Vite in development).
 *  - Access token is kept in memory only (never localStorage); the refresh token is an HttpOnly cookie
 *    the browser sends to /auth/refresh — JavaScript can never read it.
 *  - A 401 triggers one single-flight refresh and a retry; if refresh fails the session-expired handler runs.
 *  - Errors are RFC 7807 problem details → ApiError with a user-safe message.
 */
const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || '/api/v1'
const CLIENT_HEADER = { 'X-TradeFlow-Client': 'web' }

export class ApiError extends Error {
  status: number
  code?: string
  errors?: Record<string, string[]>
  traceId?: string
  constructor(status: number, message: string, code?: string, errors?: Record<string, string[]>, traceId?: string) {
    super(message)
    this.status = status
    this.code = code
    this.errors = errors
    this.traceId = traceId
  }
}

let accessToken: string | null = null
let refreshing: Promise<boolean> | null = null
let onSessionExpired: (() => void) | null = null

export const setAccessToken = (t: string | null) => (accessToken = t)
export const hasAccessToken = () => !!accessToken
export const setSessionExpiredHandler = (fn: () => void) => (onSessionExpired = fn)

async function toError(res: Response): Promise<ApiError> {
  let body: { title?: string; detail?: string; code?: string; errors?: Record<string, string[]>; traceId?: string } = {}
  try {
    body = await res.json()
  } catch {
    /* not JSON */
  }
  const first = body.errors ? Object.values(body.errors).flat()[0] : undefined
  const fallback =
    res.status === 403 ? 'You do not have permission to perform this action.'
      : res.status === 404 ? 'The record was not found or you cannot access it.'
      : res.status === 429 ? 'Too many attempts. Please wait a moment and try again.'
      : res.status >= 500 ? 'The server could not complete the request. Please try again.'
      : 'The request could not be completed.'
  return new ApiError(res.status, body.detail || first || body.title || fallback, body.code, body.errors, body.traceId)
}

/** Rotates the refresh cookie and stores the new access token. Concurrent callers share one request. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include', headers: CLIENT_HEADER })
      if (!res.ok) {
        accessToken = null
        return false
      }
      const body = (await res.json()) as { accessToken: string }
      accessToken = body.accessToken
      return true
    } catch {
      return false
    } finally {
      setTimeout(() => (refreshing = null), 0)
    }
  })()
  return refreshing
}

export interface RequestOptions {
  method?: string
  body?: unknown
  form?: FormData
  headers?: Record<string, string>
  signal?: AbortSignal
  /** Do not try to refresh on 401 (auth endpoints). */
  noRefresh?: boolean
  raw?: boolean
}

export async function request<T>(path: string, o: RequestOptions = {}): Promise<T> {
  const send = () => {
    const headers: Record<string, string> = { Accept: 'application/json', ...CLIENT_HEADER, ...o.headers }
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`
    let body: BodyInit | undefined
    if (o.form) body = o.form
    else if (o.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(o.body)
    }
    return fetch(`${BASE}${path}`, { method: o.method ?? (body ? 'POST' : 'GET'), headers, body, credentials: 'include', signal: o.signal })
  }
  let res = await send()
  if (res.status === 401 && !o.noRefresh) {
    if (await refreshSession()) res = await send()
    if (res.status === 401) {
      onSessionExpired?.()
      throw await toError(res)
    }
  }
  if (!res.ok) throw await toError(res)
  if (o.raw) return res as unknown as T
  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T
  const type = res.headers.get('content-type') ?? ''
  return (type.includes('json') ? await res.json() : await res.text()) as T
}

export const api = {
  get: <T,>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T,>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>(path, { method: 'POST', body: body ?? {}, headers }),
  put: <T,>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>(path, { method: 'PUT', body: body ?? {}, headers }),
  patch: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: body ?? {} }),
  del: <T,>(path: string) => request<T>(path, { method: 'DELETE' }),
  form: <T,>(path: string, form: FormData, method = 'POST') => request<T>(path, { method, form }),
}

/** Query-string helper that skips empty values. */
export function qs(params: Record<string, string | number | boolean | undefined | null | string[]>) {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) v.forEach((x) => u.append(k, x))
    else u.append(k, String(v))
  }
  const s = u.toString()
  return s ? `?${s}` : ''
}

/** Downloads a protected file (documents) with the bearer token and opens / saves it. */
export async function downloadFile(path: string, fileName: string, inline = false) {
  const res = await request<Response>(path + (inline ? (path.includes('?') ? '&' : '?') + 'inline=true' : ''), { raw: true })
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  if (inline) window.open(url, '_blank', 'noopener')
  else {
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export const API_BASE = BASE
