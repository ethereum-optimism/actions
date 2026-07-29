import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type AuthContext, authMiddleware } from '@/middleware/auth.js'

vi.mock('@/config/actions.js', () => ({
  getPrivyClient: vi.fn(),
}))

const ACCESS_TOKEN = 'access-token'
const ID_TOKEN = 'id-token'
const USER = 'did:privy:user-a'

/**
 * Stubs the Privy client the middleware reaches for.
 * @description Both tokens resolve to `subject` unless `identitySubject` is
 * given, which is how a deliberate cross-user pairing is expressed.
 * @param overrides - Subject returned by each token, or a rejection to force a verification failure.
 * @returns void
 */
async function mockPrivy(overrides: {
  subject?: unknown
  identitySubject?: string
  identityRejects?: boolean
  accessRejects?: boolean
}) {
  const { getPrivyClient } = await import('@/config/actions.js')
  const verifyAuthToken = overrides.accessRejects
    ? vi.fn().mockRejectedValue(new Error('invalid access token'))
    : vi.fn().mockResolvedValue({ user_id: overrides.subject })
  const verifyIdentityToken = overrides.identityRejects
    ? vi.fn().mockRejectedValue(new Error('invalid identity token'))
    : vi.fn().mockResolvedValue({
        id: overrides.identitySubject ?? overrides.subject,
      })

  vi.mocked(getPrivyClient).mockReturnValue({
    utils: () => ({ auth: () => ({ verifyAuthToken, verifyIdentityToken }) }),
  } as never)

  return { verifyAuthToken, verifyIdentityToken }
}

/**
 * Drives the middleware over a minimal app so the assertions cover the
 * middleware contract rather than a whole route stack.
 * @param headers - Request headers to send.
 * @returns The response, plus whether the downstream handler ran.
 */
async function request(headers: Record<string, string>) {
  let handlerRan = false
  const app = new Hono<{ Variables: { auth: AuthContext } }>()
  app.use('*', authMiddleware)
  app.get('/protected', (c) => {
    handlerRan = true
    return c.json({ rateLimitKey: c.get('auth').rateLimitKey })
  })

  const res = await app.request('/protected', { headers })
  return { res, handlerRan }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('authMiddleware authorization scheme', () => {
  let privy: Awaited<ReturnType<typeof mockPrivy>>

  beforeEach(async () => {
    privy = await mockPrivy({ subject: USER })
  })

  it('accepts a lowercase scheme', async () => {
    const { res, handlerRan } = await request({
      Authorization: `bearer ${ACCESS_TOKEN}`,
      'privy-id-token': ID_TOKEN,
    })

    expect(res.status).toBe(200)
    expect(handlerRan).toBe(true)
  })

  it('accepts a capitalized scheme', async () => {
    const { res } = await request({
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'privy-id-token': ID_TOKEN,
    })

    expect(res.status).toBe(200)
  })

  it('accepts a mixed-case scheme', async () => {
    const { res } = await request({
      Authorization: `BeArEr ${ACCESS_TOKEN}`,
      'privy-id-token': ID_TOKEN,
    })

    expect(res.status).toBe(200)
  })

  it('strips only the leading scheme, not scheme text inside the token', async () => {
    const { res } = await request({
      Authorization: 'Bearer bearer-Bearer-token',
      'privy-id-token': ID_TOKEN,
    })

    expect(res.status).toBe(200)
    expect(privy.verifyAuthToken).toBeCalledWith('bearer-Bearer-token')
  })

  it('rejects a missing Authorization header', async () => {
    const { res, handlerRan } = await request({ 'privy-id-token': ID_TOKEN })

    expect(res.status).toBe(401)
    expect(handlerRan).toBe(false)
  })

  it('rejects a non-Bearer scheme', async () => {
    const { res } = await request({
      Authorization: `Basic ${ACCESS_TOKEN}`,
      'privy-id-token': ID_TOKEN,
    })

    expect(res.status).toBe(401)
  })

  it('rejects a scheme with no token', async () => {
    const { res } = await request({
      Authorization: 'Bearer',
      'privy-id-token': ID_TOKEN,
    })

    expect(res.status).toBe(401)
  })

  it('rejects a scheme followed only by whitespace', async () => {
    const { res } = await request({
      Authorization: 'Bearer    ',
      'privy-id-token': ID_TOKEN,
    })

    expect(res.status).toBe(401)
  })

  it('rejects a missing identity token header', async () => {
    const { res, handlerRan } = await request({
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    })

    expect(res.status).toBe(401)
    expect(handlerRan).toBe(false)
  })
})
