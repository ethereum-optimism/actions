import type { Context, Next } from 'hono'

import { getPrivyClient } from '@/config/verbs.js'

export interface AuthContext {
  userId?: string
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    // TODO (https://github.com/ethereum-optimism/verbs/issues/124): enforce auth
    // Fail silently
    await next()
    return
  }

  const accessToken = parseAuthorizationHeader(authHeader)
  const authContext: AuthContext = {}

  try {
    const privy = getPrivyClient()
    const verifiedPrivy = await privy
      .verifyAuthToken(accessToken)
      .catch((err) => {
        console.error('❌ Auth middleware: Token verification failed:', err)
        throw c.json({ error: 'Invalid or expired token' }, 401)
      })
    const userId = verifiedPrivy.userId
    authContext.userId = userId
  } catch {
    // TODO (https://github.com/ethereum-optimism/verbs/issues/124): enforce auth
    // Silently continue without Privy auth key if request fails
  }

  c.set('auth', authContext)
  await next()
}

const parseAuthorizationHeader = (value: string) => {
  return value.replace('Bearer', '').trim()
}

export const PRIVY_TOKEN_COOKIE_KEY = 'privy-token'
