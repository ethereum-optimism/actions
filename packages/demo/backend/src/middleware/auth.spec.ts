import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type AuthContext, authMiddleware } from '@/middleware/auth.js'
import {
  buildPrivyClientMock,
  type PrivyMockOptions,
} from '@/utils/testUtils.js'

vi.mock('@/config/actions.js', () => ({
  getPrivyClient: vi.fn(),
}))

const ACCESS_TOKEN = 'access-token'
const ID_TOKEN = 'id-token'
const USER = 'did:privy:user-a'

/**
 * Points the middleware at a stubbed Privy client.
 * @description Defaults the identity subject to the access subject, so a test
 * only names `identitySubject` when it wants a deliberate cross-user pairing.
 * @param options - Subjects each token resolves to, or a value to reject with.
 * @returns Both verification spies, for call assertions.
 */
async function mockPrivy(options: PrivyMockOptions) {
  const { getPrivyClient } = await import('@/config/actions.js')
  const { client, verifyAuthToken, verifyIdentityToken } = buildPrivyClientMock(
    {
      ...options,
      identitySubject:
        'identitySubject' in options
          ? options.identitySubject
          : options.accessSubject,
    },
  )
  vi.mocked(getPrivyClient).mockReturnValue(client)

  return { verifyAuthToken, verifyIdentityToken }
}

/**
 * Drives the middleware over a minimal app so the assertions cover the
 * middleware contract rather than a whole route stack.
 * @param headers - Request headers to send.
 * @returns The response, whether the downstream handler ran, and the auth context it saw.
 */
async function request(headers: Record<string, string>) {
  let seenAuth: AuthContext | undefined
  const app = new Hono<{ Variables: { auth: AuthContext } }>()
  app.use('*', authMiddleware)
  app.get('/protected', (c) => {
    seenAuth = c.get('auth')
    return c.json({ rateLimitKey: c.get('auth').rateLimitKey })
  })

  const res = await app.request('/protected', { headers })
  return { res, handlerRan: seenAuth !== undefined, auth: seenAuth }
}

let errorLog: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.resetAllMocks()
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('authMiddleware authorization scheme', () => {
  let privy: Awaited<ReturnType<typeof mockPrivy>>

  beforeEach(async () => {
    privy = await mockPrivy({ accessSubject: USER })
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

  it('accepts a tab between scheme and token', async () => {
    // The old case-sensitive prefix check required a literal space, so this
    // shape is one of the two that actually distinguishes the new parser.
    const { res } = await request({
      Authorization: `Bearer\t${ACCESS_TOKEN}`,
      'privy-id-token': ID_TOKEN,
    })

    expect(res.status).toBe(200)
    expect(privy.verifyAuthToken).toBeCalledWith(ACCESS_TOKEN)
  })

  it('rejects trailing content after the token without calling Privy', async () => {
    // Pins the capture boundary and the end anchor together: widening the
    // capture or dropping the anchor would forward a malformed header to Privy.
    const { res, handlerRan } = await request({
      Authorization: `Bearer ${ACCESS_TOKEN} extra`,
      'privy-id-token': ID_TOKEN,
    })

    expect(res.status).toBe(401)
    expect(handlerRan).toBe(false)
    expect(privy.verifyAuthToken).not.toBeCalled()
  })

  it('rejects a non-breaking space as the delimiter', async () => {
    // RFC 9110 allows only SP and HTAB. A bare whitespace class also matches U+00A0.
    const { res, handlerRan } = await request({
      Authorization: `Bearer\u00a0${ACCESS_TOKEN}`,
      'privy-id-token': ID_TOKEN,
    })

    expect(res.status).toBe(401)
    expect(handlerRan).toBe(false)
    expect(privy.verifyAuthToken).not.toBeCalled()
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

  it('rejects a missing identity token header before calling Privy', async () => {
    const { res, handlerRan } = await request({
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    })

    expect(res.status).toBe(401)
    expect(handlerRan).toBe(false)
    // Pins the guard ahead of verification. Hoisting the Privy calls above it
    // would turn unauthenticated traffic into JWKS load.
    expect(privy.verifyAuthToken).not.toBeCalled()
    expect(privy.verifyIdentityToken).not.toBeCalled()
  })

  it('rejects the same token presented in both credential slots', async () => {
    // Both verifiers share one JWKS and issuer/audience config, so a single
    // stolen token must never be able to stand in for the pair.
    const { res, handlerRan } = await request({
      Authorization: `Bearer ${ID_TOKEN}`,
      'privy-id-token': ID_TOKEN,
    })

    expect(res.status).toBe(401)
    expect(handlerRan).toBe(false)
    expect(privy.verifyAuthToken).not.toBeCalled()
  })
})

describe('authMiddleware credential binding', () => {
  const headers = {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    'privy-id-token': ID_TOKEN,
  }

  it('rejects an identity token issued to a different user', async () => {
    await mockPrivy({
      accessSubject: USER,
      identitySubject: 'did:privy:user-b',
    })

    const { res, handlerRan } = await request(headers)

    expect(res.status).toBe(401)
    expect(handlerRan).toBe(false)
    const body = (await res.json()) as { error: string }
    expect(body.error).not.toContain('user-a')
    expect(body.error).not.toContain('user-b')
  })

  it('does not distinguish a mismatch from an invalid access token', async () => {
    await mockPrivy({
      accessSubject: USER,
      identitySubject: 'did:privy:user-b',
    })
    const mismatch = await request(headers)

    await mockPrivy({
      accessSubject: USER,
      accessRejects: new Error('invalid access token'),
    })
    const invalid = await request(headers)

    expect(mismatch.res.status).toBe(invalid.res.status)
    expect(await mismatch.res.text()).toBe(await invalid.res.text())
  })

  it('accepts an identity token issued to the same user', async () => {
    await mockPrivy({ accessSubject: USER })

    const { res, handlerRan, auth } = await request(headers)

    expect(res.status).toBe(200)
    expect(handlerRan).toBe(true)
    expect(auth?.idToken).toBe(ID_TOKEN)
  })

  it('rejects a non-string identity subject', async () => {
    // The SDK assigns the identity subject straight from the JWT claim with no
    // string guard, unlike the access-token path, so a non-string is reachable.
    await mockPrivy({ accessSubject: USER, identitySubject: { id: USER } })

    const { res, handlerRan } = await request(headers)

    expect(res.status).toBe(401)
    expect(handlerRan).toBe(false)
  })

  it('rejects when both credentials fail verification', async () => {
    await mockPrivy({
      accessSubject: USER,
      accessRejects: new Error('invalid access token'),
      identityRejects: new Error('invalid identity token'),
    })

    const { res, handlerRan } = await request(headers)

    expect(res.status).toBe(401)
    expect(handlerRan).toBe(false)
  })

  it('rejects when Privy rejects with a non-Error value', async () => {
    await mockPrivy({ accessSubject: USER, accessRejects: 'boom' })

    const { res, handlerRan } = await request(headers)

    expect(res.status).toBe(401)
    expect(handlerRan).toBe(false)
  })

  it('logs neither credential when a mismatch is rejected', async () => {
    await mockPrivy({
      accessSubject: USER,
      identitySubject: 'did:privy:user-b',
    })

    await request(headers)

    const logged = errorLog.mock.calls
      .flat()
      .map((arg) => (arg instanceof Error ? arg.message : String(arg)))
      .join(' ')
    expect(logged).not.toContain(ACCESS_TOKEN)
    expect(logged).not.toContain(ID_TOKEN)
  })

  it('rejects an identity token that fails verification', async () => {
    await mockPrivy({
      accessSubject: USER,
      identityRejects: new Error('invalid identity token'),
    })

    const { res, handlerRan } = await request(headers)

    expect(res.status).toBe(401)
    expect(handlerRan).toBe(false)
  })

  it('rejects an access token that fails verification', async () => {
    await mockPrivy({
      accessSubject: USER,
      accessRejects: new Error('invalid access token'),
    })

    const { res, handlerRan } = await request(headers)

    expect(res.status).toBe(401)
    expect(handlerRan).toBe(false)
  })

  it('rejects a verified access token carrying no user id', async () => {
    await mockPrivy({
      accessSubject: undefined,
      identitySubject: 'did:privy:user-b',
    })

    const { res, handlerRan } = await request(headers)

    expect(res.status).toBe(401)
    expect(handlerRan).toBe(false)
  })

  it('rejects when neither token carries a subject', async () => {
    // A bare equality check would treat two absent subjects as a match, so
    // this is the case that must fail closed on its own.
    await mockPrivy({ accessSubject: undefined })

    const { res, handlerRan } = await request(headers)

    expect(res.status).toBe(401)
    expect(handlerRan).toBe(false)
  })

  it('keys rate limiting on the verified user', async () => {
    await mockPrivy({ accessSubject: USER })

    const { res } = await request(headers)

    const body = (await res.json()) as { rateLimitKey: string }
    expect(body.rateLimitKey).toBe(`user:${USER}`)
  })

  it('verifies the identity token it was given', async () => {
    const privy = await mockPrivy({ accessSubject: USER })

    await request(headers)

    expect(privy.verifyIdentityToken).toBeCalledWith(ID_TOKEN)
  })
})
