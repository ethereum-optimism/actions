import { createHash } from 'node:crypto'

import type { Context, Next } from 'hono'

import { getPrivyClient } from '@/config/actions.js'

export interface AuthContext {
  idToken: string
  rateLimitKey: string
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')
  const idToken = c.req.header('privy-id-token')

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  if (!idToken) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const accessToken = parseAuthorizationHeader(authHeader)

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

const parseAuthorizationHeader = (value: string) => {
  return value.replace('Bearer', '').trim()
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
