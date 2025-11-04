import type { Context, Next } from 'hono'

import { getPrivyClient } from '@/config/actions.js'

export interface AuthContext {
  idToken: string
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
    await privy.utils().auth().verifyAuthToken(accessToken)
    const authContext: AuthContext = {
      idToken,
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
