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

/**
 * Thrown when the identity token resolves to a different user than the access
 * token was issued to.
 * @description Module-local because it is thrown and handled inside
 * `authMiddleware`, which routes it through the same rejection an invalid
 * token gets so a mismatch is not distinguishable to the caller.
 */
class CredentialSubjectMismatchError extends Error {
  override name = 'CredentialSubjectMismatchError' as const
  constructor() {
    super('identity token subject does not match access token subject')
  }
}

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
    const privyAuth = getPrivyClient().utils().auth()
    // Both credentials are verified here so the identity that resolves the
    // wallet downstream is the one this access token was issued to.
    const [verifiedAuthToken, identityUser] = await Promise.all([
      privyAuth.verifyAuthToken(accessToken),
      privyAuth.verifyIdentityToken(idToken),
    ])

    if (
      !verifiedAuthToken.user_id ||
      identityUser.id !== verifiedAuthToken.user_id
    ) {
      throw new CredentialSubjectMismatchError()
    }

    const authContext: AuthContext = {
      idToken,
      rateLimitKey: `user:${verifiedAuthToken.user_id}`,
    }
    c.set('auth', authContext)
  } catch (err) {
    // Logged without either token, since both are credentials.
    console.error('❌ Auth middleware: authentication failed:', err)
    return c.json({ error: 'Invalid or expired token' }, 401)
  }

  await next()
}

export const PRIVY_TOKEN_COOKIE_KEY = 'privy-token'
