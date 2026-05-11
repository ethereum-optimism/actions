import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import type { AuthContext } from '@/middleware/auth.js'
import {
  BorrowProviderNotConfiguredError,
  ChainNotSupportedError,
  HealthFactorTooLowError,
  InsufficientCollateralError,
  InsufficientLiquidityError,
  MarketNotAllowedError,
  MarketNotFoundError,
  QuoteExpiredError,
  QuoteRecipientMismatchError,
} from '@/types/borrow-sdk-stubs.js'

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
    const name = error instanceof Error ? error.name : undefined
    console.error(`${message}:`, { name, error })
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

export interface MappedSdkError {
  status: ContentfulStatusCode
  message: string
}

/**
 * Translate a thrown SDK error to a structured HTTP response shape.
 * Returns `undefined` when the error isn't recognized; callers fall back
 * to their domain-specific generic message (preserves the lend / swap
 * 500 pattern).
 *
 * Returned `message` strings are static literals per error class, not
 * `error.message` passthrough, to prevent leakage of internal addresses,
 * RPC URLs, or stack fragments to clients.
 *
 * The instanceof chain is wrapped in try/catch so a renamed or missing
 * SDK class never crashes the mapper.
 */
export function mapSdkError(error: unknown): MappedSdkError | undefined {
  try {
    if (error instanceof MarketNotAllowedError) {
      return { status: 403, message: 'Market is not in the allowlist.' }
    }
    if (error instanceof MarketNotFoundError) {
      return { status: 404, message: 'Market not found.' }
    }
    if (error instanceof ChainNotSupportedError) {
      return { status: 400, message: 'Chain not supported.' }
    }
    if (error instanceof InsufficientLiquidityError) {
      return { status: 422, message: 'Insufficient liquidity in the market.' }
    }
    if (error instanceof InsufficientCollateralError) {
      return { status: 422, message: 'Insufficient collateral.' }
    }
    if (error instanceof HealthFactorTooLowError) {
      return { status: 422, message: 'Resulting health factor is too low.' }
    }
    if (error instanceof QuoteExpiredError) {
      return { status: 410, message: 'Quote has expired; please re-quote.' }
    }
    if (error instanceof QuoteRecipientMismatchError) {
      return {
        status: 403,
        message: 'Quote recipient does not match the executing wallet.',
      }
    }
    if (error instanceof BorrowProviderNotConfiguredError) {
      return { status: 503, message: 'Borrow provider not configured.' }
    }
    return undefined
  } catch {
    return undefined
  }
}
