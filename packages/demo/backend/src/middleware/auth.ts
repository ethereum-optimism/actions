import { createHash } from 'node:crypto'

import type { Context, Next } from 'hono'

import { getPrivyClient } from '@/config/actions.js'

export interface AuthContext {
  idToken: string
  rateLimitKey: string
}

/**
 * Matches the `Bearer` scheme and captures the token after it.
 * @description Case-insensitive because RFC 9110 defines the auth scheme as
 * case-insensitive. Capturing in the same pattern that guards the header keeps
 * the guard and the extraction from disagreeing on what a valid header is.
 */
const BEARER_SCHEME = /^Bearer\s+(\S+)\s*$/i

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')
  const idToken = c.req.header('privy-id-token')
  const accessToken = authHeader?.match(BEARER_SCHEME)?.[1]

  if (!accessToken) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  if (!idToken) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const privy = getPrivyClient()
    const verifiedAuthToken = await privy
      .utils()
      .auth()
      .verifyAuthToken(accessToken)
    const authContext: AuthContext = {
      idToken,
      rateLimitKey: verifiedUserRateLimitKey(verifiedAuthToken, accessToken),
    }
    c.set('auth', authContext)
  } catch (err) {
    console.error('❌ Auth middleware: Token verification failed:', err)
    return c.json({ error: 'Invalid or expired token' }, 401)
  }

  await next()
}

function verifiedUserRateLimitKey(
  verifiedAuthToken: unknown,
  accessToken: string,
): string {
  if (hasVerifiedUserId(verifiedAuthToken)) {
    return `user:${verifiedAuthToken.user_id}`
  }

  return `user-token:${hashToken(accessToken)}`
}

function hasVerifiedUserId(value: unknown): value is { user_id: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'user_id' in value &&
    typeof value.user_id === 'string'
  )
}

function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export const PRIVY_TOKEN_COOKIE_KEY = 'privy-token'
