import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthContext } from './auth.js'
import { rateLimit } from './rateLimit.js'

function makeApp(max: number, windowMs = 60_000, maxTrackedKeys?: number) {
  const app = new Hono()
  app.use('/x', rateLimit({ windowMs, max, maxTrackedKeys }))
  app.get('/x', (c) => c.text('ok'))
  return app
}

function makeAuthenticatedApp(
  max: number,
  windowMs = 60_000,
  maxTrackedKeys?: number,
) {
  const app = new Hono<{ Variables: { auth: AuthContext } }>()
  app.use('/x', async (c, next) => {
    c.set('auth', {
      idToken: c.req.header('privy-id-token') ?? 'id-token',
      rateLimitKey: `user:${c.req.header('verified-user') ?? 'user-a'}`,
    })
    await next()
  })
  app.use('/x', rateLimit({ windowMs, max, maxTrackedKeys }))
  app.get('/x', (c) => c.text('ok'))
  return app
}

const withUser = (user: string) => ({ headers: { 'verified-user': user } })

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('rateLimit middleware', () => {
  it('allows up to max requests per window, then returns 429', async () => {
    const app = makeAuthenticatedApp(2)

    expect((await app.request('/x', withUser('a'))).status).toBe(200)
    expect((await app.request('/x', withUser('a'))).status).toBe(200)

    const blocked = await app.request('/x', withUser('a'))
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('Retry-After')).toBeTruthy()
    expect(((await blocked.json()) as { error: string }).error).toBe(
      'Too many requests',
    )
  })

  it('tracks each client independently', async () => {
    const app = makeAuthenticatedApp(1)

    expect((await app.request('/x', withUser('a'))).status).toBe(200)
    expect((await app.request('/x', withUser('a'))).status).toBe(429)
    expect((await app.request('/x', withUser('b'))).status).toBe(200)
  })

  it('resets the budget after the window elapses', async () => {
    const app = makeAuthenticatedApp(1, 60_000)

    expect((await app.request('/x', withUser('a'))).status).toBe(200)
    expect((await app.request('/x', withUser('a'))).status).toBe(429)

    vi.advanceTimersByTime(60_000)
    expect((await app.request('/x', withUser('a'))).status).toBe(200)
  })

  it('does not trust rotating privy-id-token headers before auth', async () => {
    const app = makeApp(1)

    expect(
      (await app.request('/x', { headers: { 'privy-id-token': 'attacker-a' } }))
        .status,
    ).toBe(200)
    expect(
      (await app.request('/x', { headers: { 'privy-id-token': 'attacker-b' } }))
        .status,
    ).toBe(429)
  })

  it('does not trust spoofed x-forwarded-for values', async () => {
    const app = makeApp(1)
    const fromForwardedFor = (ip: string) => ({
      headers: { 'x-forwarded-for': ip },
    })

    expect(
      (await app.request('/x', fromForwardedFor('203.0.113.5'))).status,
    ).toBe(200)
    expect(
      (await app.request('/x', fromForwardedFor('203.0.113.6'))).status,
    ).toBe(429)
  })

  it('rejects new clients when active tracked keys hit the cap', async () => {
    const app = makeAuthenticatedApp(2, 60_000, 2)

    expect((await app.request('/x', withUser('a'))).status).toBe(200)
    expect((await app.request('/x', withUser('b'))).status).toBe(200)

    const blocked = await app.request('/x', withUser('c'))
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('Retry-After')).toBe('60')

    expect((await app.request('/x', withUser('a'))).status).toBe(200)
  })
})
