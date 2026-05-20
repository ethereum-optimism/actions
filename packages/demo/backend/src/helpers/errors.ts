import {
  AddressRequiredError,
  AmountRequiredError,
  AssetMetadataRequiredError,
  AssetNotSupportedOnChainError,
  BorrowMarketParamsMismatchError,
  ChainNotSupportedError,
  ConflictingAmountsError,
  InvalidAmountError,
  InvalidParamsError,
  MarketIdRequiredError,
  MarketNotAllowedError,
  MarketNotFoundError,
  NativeAssetAddressError,
  ProviderNotConfiguredError,
  QuoteExpiredError,
  QuoteRecipientMismatchError,
  QuoteRecipientMissingError,
  TransactionConfirmedButRevertedError,
  ZeroAddressError,
} from '@eth-optimism/actions-sdk'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import type { AuthContext } from '@/middleware/auth.js'

/**
 * Thrown by borrow services when an authenticated request resolves to
 * no Privy wallet. Mapped to 404 by `mapSdkError`. Local to the backend
 * because the SDK doesn't model the wallet-lookup layer.
 */
export class WalletNotFoundError extends Error {
  override name = 'WalletNotFoundError' as const
  constructor() {
    super('Wallet not found')
  }
}

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
    if (error instanceof MarketIdRequiredError) {
      return { status: 400, message: 'Market id is required.' }
    }
    if (error instanceof ChainNotSupportedError) {
      return { status: 400, message: 'Chain not supported.' }
    }
    if (error instanceof AmountRequiredError) {
      return { status: 400, message: 'Amount is required.' }
    }
    if (error instanceof InvalidAmountError) {
      return { status: 400, message: 'Invalid amount.' }
    }
    if (error instanceof ConflictingAmountsError) {
      return {
        status: 400,
        message:
          'Conflicting amounts; provide exactly one of amount or amountRaw.',
      }
    }
    if (error instanceof BorrowMarketParamsMismatchError) {
      return {
        status: 422,
        message: 'Borrow market parameters do not match the configured market.',
      }
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
    if (error instanceof ProviderNotConfiguredError) {
      return {
        status: 503,
        message: 'Provider not configured for this market.',
      }
    }
    if (error instanceof WalletNotFoundError) {
      return { status: 404, message: 'Wallet not found.' }
    }
    if (error instanceof AddressRequiredError) {
      return { status: 400, message: 'Address is required.' }
    }
    if (error instanceof ZeroAddressError) {
      return { status: 400, message: 'Address must not be the zero address.' }
    }
    if (error instanceof InvalidParamsError) {
      return { status: 400, message: 'Invalid parameters.' }
    }
    if (error instanceof QuoteRecipientMissingError) {
      return { status: 400, message: 'Quote recipient is required.' }
    }
    if (error instanceof AssetNotSupportedOnChainError) {
      return { status: 400, message: 'Asset is not supported on this chain.' }
    }
    if (error instanceof NativeAssetAddressError) {
      return {
        status: 400,
        message: 'Native asset cannot be referenced by address.',
      }
    }
    if (error instanceof AssetMetadataRequiredError) {
      return { status: 400, message: 'Asset metadata is required.' }
    }
    if (error instanceof TransactionConfirmedButRevertedError) {
      return {
        status: 422,
        message: 'Transaction confirmed but reverted on-chain.',
      }
    }
    return undefined
  } catch {
    return undefined
  }
}
