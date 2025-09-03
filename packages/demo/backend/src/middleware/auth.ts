import { verifyToken } from '@clerk/backend'
import type { Context, Next } from 'hono'

import { env } from '../config/env.js'

export interface AuthContext {
  userId: string
  clerkUserId: string
  privyAuthKey?: string
}

export async function authMiddleware(c: Context, next: Next) {
  console.log('🔐 Auth middleware: Starting authentication...')
  console.log('🔧 Auth middleware: Environment check:', {
    hasClerkSecretKey: !!env.CLERK_SECRET_KEY,
    hasClerkPublishableKey: !!env.CLERK_PUBLISHABLE_KEY,
    clerkSecretKeyPrefix: env.CLERK_SECRET_KEY?.substring(0, 10) + '...'
  })
  
  const authHeader = c.req.header('Authorization')
  console.log('📋 Auth middleware: Auth header present:', !!authHeader)

  if (!authHeader?.startsWith('Bearer ')) {
    console.log('❌ Auth middleware: Missing or invalid authorization header')
    return c.json({ error: 'Missing or invalid authorization header' }, 401)
  }

  const token = authHeader.substring(7)
  console.log('🎫 Auth middleware: JWT token received, length:', token.length)

  try {
    console.log('🔍 Auth middleware: Verifying Clerk JWT token...')
    const verifiedToken = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
      // Accept both the publishable key and localhost origins for development
      authorizedParties: [env.CLERK_PUBLISHABLE_KEY, 'http://localhost:5173', 'localhost:5173'],
    })

    if (!verifiedToken) {
      console.log('❌ Auth middleware: Token verification failed')
      return c.json({ error: 'Invalid token' }, 401)
    }

    const userId = verifiedToken.sub
    console.log('✅ Auth middleware: Clerk JWT verified successfully, userId:', userId)

    const authContext: AuthContext = {
      userId,
      clerkUserId: userId,
    }

    try {
      console.log('🔑 Auth middleware: Requesting Privy authorization key...')
      
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

      console.log('📡 Auth middleware: Privy auth key response status:', authKeyResponse.status)

      if (authKeyResponse.ok) {
        const authKeyData = await authKeyResponse.json()
        authContext.privyAuthKey = authKeyData.authorizationKey
        console.log('✅ Auth middleware: Privy authorization key obtained successfully')
      } else {
        const errorData = await authKeyResponse.text()
        console.log('❌ Auth middleware: Privy auth key request failed:', errorData)
      }
    } catch (error) {
      console.error('❌ Auth middleware: Exception getting Privy authorization key:', error)
    }

    console.log('🎯 Auth middleware: Setting auth context:', {
      userId: authContext.userId,
      hasPrivyAuthKey: !!authContext.privyAuthKey
    })
    
    c.set('auth', authContext)
    console.log('✅ Auth middleware: Authentication complete, proceeding to next middleware')
    await next()
  } catch (error) {
    console.error('❌ Auth middleware: Token verification failed:', error)
    return c.json({ error: 'Invalid or expired token' }, 401)
  }
}
