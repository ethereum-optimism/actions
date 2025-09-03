import { verifyToken } from '@clerk/backend'
import type { Context, Next } from 'hono'

import { env } from '../config/env.js'

export interface AuthContext {
  userId: string
  clerkUserId: string
  privyAuthKey?: string
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid authorization header' }, 401)
  }

  const token = authHeader.substring(7)

  try {
    const verifiedToken = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
      authorizedParties: [env.CLERK_PUBLISHABLE_KEY],
    })

    if (!verifiedToken) {
      return c.json({ error: 'Invalid token' }, 401)
    }

    const userId = verifiedToken.sub

    const authContext: AuthContext = {
      userId,
      clerkUserId: userId,
    }

    try {
      const authKeyResponse = await fetch(
        `https://auth.privy.io/api/v1/siwe/init`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'privy-app-id': env.PRIVY_APP_ID,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            address: userId,
          }),
        },
      )

      if (authKeyResponse.ok) {
        const authKeyData = await authKeyResponse.json()
        authContext.privyAuthKey = authKeyData.authorizationKey
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to get Privy authorization key:', error)
    }

    c.set('auth', authContext)
    await next()
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Token verification failed:', error)
    return c.json({ error: 'Invalid or expired token' }, 401)
  }
}
