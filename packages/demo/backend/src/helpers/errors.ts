import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import type { AuthContext } from '@/middleware/auth.js'

/**
 * Return a consistent JSON error response.
 * Logs to stderr for 500s, keeps client messages opaque.
 */
export function errorResponse(
  c: Context,
  message: string,
  status: ContentfulStatusCode = 500,
  error?: unknown,
) {
  if (status >= 500 && error) {
    console.error(`${message}:`, error)
  }
  return c.json({ error: message }, status)
}

/**
 * Extract the auth context set by authMiddleware.
 * Returns the AuthContext or an error response if missing.
 */
export function requireAuth(
  c: Context,
): { auth: AuthContext } | { error: Response } {
  const auth = c.get('auth') as AuthContext | undefined
  if (!auth?.idToken) {
    return { error: errorResponse(c, 'Unauthorized', 401) }
  }
  return { auth }
}
