import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { rateLimit } from './rateLimit.js'

function makeApp(max: number, windowMs = 60_000, maxTrackedKeys?: number) {
  const app = new Hono()
  app.use('/x', rateLimit({ windowMs, max, maxTrackedKeys }))
  app.get('/x', (c) => c.text('ok'))
  return app
}

const withToken = (token: string) => ({ headers: { 'privy-id-token': token } })

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('rateLimit middleware', () => {
  it('allows up to max requests per window, then returns 429', async () => {
    const app = makeApp(2)

    expect((await app.request('/x', withToken('a'))).status).toBe(200)
    expect((await app.request('/x', withToken('a'))).status).toBe(200)

    const blocked = await app.request('/x', withToken('a'))
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('Retry-After')).toBeTruthy()
    expect(((await blocked.json()) as { error: string }).error).toBe(
      'Too many requests',
    )
  })

  it('tracks each client independently', async () => {
    const app = makeApp(1)

    expect((await app.request('/x', withToken('a'))).status).toBe(200)
    expect((await app.request('/x', withToken('a'))).status).toBe(429)
    // A different token has its own untouched budget.
    expect((await app.request('/x', withToken('b'))).status).toBe(200)
  })

  it('resets the budget after the window elapses', async () => {
    const app = makeApp(1, 60_000)

    expect((await app.request('/x', withToken('a'))).status).toBe(200)
    expect((await app.request('/x', withToken('a'))).status).toBe(429)

    vi.advanceTimersByTime(60_000)
    expect((await app.request('/x', withToken('a'))).status).toBe(200)
  })

  it('falls back to the client IP (x-forwarded-for) when unauthenticated', async () => {
    const app = makeApp(1)
    const fromIp = (ip: string) => ({ headers: { 'x-forwarded-for': ip } })

    expect((await app.request('/x', fromIp('203.0.113.5'))).status).toBe(200)
    expect((await app.request('/x', fromIp('203.0.113.5'))).status).toBe(429)
    // A different source IP is bucketed separately.
    expect((await app.request('/x', fromIp('203.0.113.6'))).status).toBe(200)
  })

  it('rejects new clients when active tracked keys hit the cap', async () => {
    const app = makeApp(2, 60_000, 2)

    expect((await app.request('/x', withToken('a'))).status).toBe(200)
    expect((await app.request('/x', withToken('b'))).status).toBe(200)

    const blocked = await app.request('/x', withToken('c'))
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('Retry-After')).toBe('60')

    expect((await app.request('/x', withToken('a'))).status).toBe(200)
  })
})
