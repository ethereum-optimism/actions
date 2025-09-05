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
      // Accept both the publishable key and localhost origins for development
      authorizedParties: [env.CLERK_PUBLISHABLE_KEY, 'http://localhost:5173', 'localhost:5173'],
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
      // Get Privy authorization key for the authenticated user
      // This enables user-owned wallets via authenticated signers
      const authKeyResponse = await fetch(
        `https://auth.privy.io/api/v1/authorization/init`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'privy-app-id': env.PRIVY_APP_ID,
            Authorization: `Bearer ${token}`,
          },
        },
      )

      if (authKeyResponse.ok) {
        const authKeyData = await authKeyResponse.json()
        authContext.privyAuthKey = authKeyData.authorizationKey
      }
    } catch (error) {
      // Silently continue without Privy auth key if request fails
    }
    
    c.set('auth', authContext)
    await next()
  } catch (error) {
    console.error('❌ Auth middleware: Token verification failed:', error)
    return c.json({ error: 'Invalid or expired token' }, 401)
  }
}
