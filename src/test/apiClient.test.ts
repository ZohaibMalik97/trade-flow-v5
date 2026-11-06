import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, qs, setAccessToken, setSessionExpiredHandler } from '@/services/api/client'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

afterEach(() => {
  vi.unstubAllGlobals()
  setAccessToken(null)
})

describe('api client', () => {
  it('sends the bearer token and the client header', async () => {
    const fetchMock = vi.fn(async () => json(200, { ok: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    setAccessToken('abc')
    await api.get('/x')
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer abc')
    expect(headers['X-TradeFlow-Client']).toBeTruthy()
    expect(init.credentials).toBe('include')
  })

  it('refreshes once on 401 and retries the request with the new token', async () => {
    let calls = 0
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 'new' })
      calls++
      const auth = (init.headers as Record<string, string>).Authorization
      return auth === 'Bearer new' ? json(200, { value: calls }) : json(401, { title: 'Unauthorized' })
    })
    vi.stubGlobal('fetch', fetchMock)
    setAccessToken('old')
    const [a, b] = await Promise.all([api.get<{ value: number }>('/a'), api.get<{ value: number }>('/b')])
    expect(a.value).toBeGreaterThan(0)
    expect(b.value).toBeGreaterThan(0)
    // concurrent 401s share a single refresh call
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/auth/refresh'))).toHaveLength(1)
  })

  it('signals session expiry when refresh fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { title: 'Unauthorized' })))
    const expired = vi.fn()
    setSessionExpiredHandler(expired)
    await expect(api.get('/x')).rejects.toBeInstanceOf(ApiError)
    expect(expired).toHaveBeenCalled()
  })

  it('maps ProblemDetails to ApiError with the first validation message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(400, { title: 'One or more validation errors occurred.', errors: { quantity: ['Quantity must be a multiple of the case pack (6).'] }, traceId: 't-1' })))
    const err = (await api.post('/requests', {}).catch((e) => e)) as ApiError
    expect(err.status).toBe(400)
    expect(err.message).toContain('case pack')
    expect(err.traceId).toBe('t-1')
  })

  it('gives a generic message for 403 without server detail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403 })))
    const err = (await api.get('/admin').catch((e) => e)) as ApiError
    expect(err.status).toBe(403)
    expect(err.message).toMatch(/permission/)
  })

  it('builds query strings without empty values', () => {
    expect(qs({ a: 'x', b: '', c: undefined, d: ['1', '2'] })).toBe('?a=x&d=1&d=2')
  })
})
