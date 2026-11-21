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
 * The delimiter is SP and HTAB rather than `\s`, which would also admit vertical
 * tab, form feed, and non-breaking space that RFC 9110 does not allow.
 */
const BEARER_SCHEME = /^Bearer[ \t]+(\S+)[ \t]*$/i

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

/**
 * Reports whether both verified credentials describe the same Privy user.
 * @description Both arguments are the `sub` claim of their respective Privy JWT,
 * so a direct comparison is correct. The explicit access-subject check is load
 * bearing: comparison alone would treat two absent subjects as equal, and the
 * SDK assigns the identity subject without a string guard, so a non-string can
 * reach here.
 * @param accessSubject - Subject of the verified access token.
 * @param identitySubject - Subject of the verified identity token.
 * @returns True when both are present and identical.
 */
function subjectsMatch(accessSubject: string, identitySubject: string) {
  return Boolean(accessSubject) && accessSubject === identitySubject
}

/**
 * Authenticates a request from its Privy access token and identity token.
 * @description Requires an `Authorization: Bearer` access token and a
 * `privy-id-token` identity token, verifies both, and requires that they were
 * issued to the same Privy user. Binding them matters because the identity token
 * is what resolves the acting wallet downstream, so an unbound pair would let a
 * caller act on another user's wallet. Populates the `auth` context on success.
 * @param c - Hono request context.
 * @param next - Downstream handler, invoked only when both credentials agree.
 * @returns A 401 JSON response, or nothing when authentication succeeds.
 */
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

  // One token cannot satisfy both slots. Access-token verification demands a
  // `sid` claim that identity tokens are not documented to carry, so a replay
  // would most likely fail anyway, but rejecting it outright keeps a single
  // stolen credential from ever standing in for the pair.
  if (idToken === accessToken) {
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

    if (!subjectsMatch(verifiedAuthToken.user_id, identityUser.id)) {
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
