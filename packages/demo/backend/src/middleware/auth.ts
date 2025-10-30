import type { Context, Next } from 'hono'

import { getPrivyClient } from '@/config/actions.js'

export interface AuthContext {
  userId: string
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const accessToken = parseAuthorizationHeader(authHeader)

  try {
    const privy = getPrivyClient()
    const verifiedPrivy = await privy.verifyAuthToken(accessToken)
    const userId = verifiedPrivy.userId
    const authContext: AuthContext = {
      userId,
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

export const PRIVY_TOKEN_COOKIE_KEY = 'privy-token'
