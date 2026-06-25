import {
  AddressRequiredError,
  AmountRequiredError,
  AssetMetadataRequiredError,
  AssetNotSupportedOnChainError,
  BorrowMarketParamsMismatchError,
  ChainNotSupportedError,
  ConflictingAmountsError,
  EmptyPositionError,
  ExactOutputNotSupportedError,
  InvalidAmountError,
  InvalidParamsError,
  MarketIdRequiredError,
  MarketNotAllowedError,
  MarketNotFoundError,
  NativeAssetAddressError,
  ProtocolContractsNotConfiguredError,
  ProviderNotConfiguredError,
  QuoteExpiredError,
  QuoteRecipientMismatchError,
  QuoteRecipientMissingError,
  SameAssetError,
  SlippageOutOfRangeError,
  TransactionConfirmedButRevertedError,
  ZeroAddressError,
} from '@eth-optimism/actions-sdk'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import type { AuthContext } from '@/middleware/auth.js'

/**
 * Thrown by borrow, lend, and swap services when an authenticated request
 * resolves to no Privy wallet. Mapped to 404 by `mapSdkError`. Local to the
 * backend because the SDK doesn't model the wallet-lookup layer.
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

type ErrorCtor = new (...args: never[]) => Error

/**
 * Static mapping table from SDK / backend error class to HTTP response.
 * Each `message` is a literal (no `error.message` passthrough) so internal
 * addresses, RPC URLs, and stack fragments cannot leak to clients.
 *
 * Order is insignificant: classes never overlap so the first `instanceof`
 * match wins regardless of position. Newest mappings are appended at the
 * bottom; the exhaustive-coverage test in `errors.spec.ts` will fail when
 * a future SDK error class isn't either listed here or allowlisted.
 */
const SDK_ERROR_MAPPINGS: ReadonlyArray<readonly [ErrorCtor, MappedSdkError]> =
  [
    [
      MarketNotAllowedError,
      { status: 403, message: 'Market is not in the allowlist.' },
    ],
    [MarketNotFoundError, { status: 404, message: 'Market not found.' }],
    [MarketIdRequiredError, { status: 400, message: 'Market id is required.' }],
    [ChainNotSupportedError, { status: 400, message: 'Chain not supported.' }],
    [AmountRequiredError, { status: 400, message: 'Amount is required.' }],
    [InvalidAmountError, { status: 400, message: 'Invalid amount.' }],
    [
      ConflictingAmountsError,
      {
        status: 400,
        message:
          'Conflicting amounts; provide exactly one of amount or amountRaw.',
      },
    ],
    [
      BorrowMarketParamsMismatchError,
      {
        status: 422,
        message: 'Borrow market parameters do not match the configured market.',
      },
    ],
    [
      QuoteExpiredError,
      { status: 410, message: 'Quote has expired; please re-quote.' },
    ],
    [
      QuoteRecipientMismatchError,
      {
        status: 403,
        message: 'Quote recipient does not match the executing wallet.',
      },
    ],
    [
      ProviderNotConfiguredError,
      { status: 500, message: 'Provider not configured for this market.' },
    ],
    [WalletNotFoundError, { status: 404, message: 'Wallet not found.' }],
    [AddressRequiredError, { status: 400, message: 'Address is required.' }],
    [
      ZeroAddressError,
      { status: 400, message: 'Address must not be the zero address.' },
    ],
    [InvalidParamsError, { status: 400, message: 'Invalid parameters.' }],
    [
      QuoteRecipientMissingError,
      { status: 400, message: 'Quote recipient is required.' },
    ],
    [
      AssetNotSupportedOnChainError,
      { status: 400, message: 'Asset is not supported on this chain.' },
    ],
    [
      NativeAssetAddressError,
      { status: 400, message: 'Native asset cannot be referenced by address.' },
    ],
    [
      AssetMetadataRequiredError,
      { status: 400, message: 'Asset metadata is required.' },
    ],
    [
      TransactionConfirmedButRevertedError,
      { status: 422, message: 'Transaction confirmed but reverted on-chain.' },
    ],
    [
      EmptyPositionError,
      { status: 422, message: 'No position to operate on.' },
    ],
    [
      ProtocolContractsNotConfiguredError,
      {
        status: 503,
        message: 'Protocol contracts are not configured for this chain.',
      },
    ],
    [
      SameAssetError,
      { status: 400, message: 'Cannot swap an asset for itself.' },
    ],
    [
      ExactOutputNotSupportedError,
      {
        status: 400,
        message: 'Exact-output swaps are not supported by this provider.',
      },
    ],
    [
      SlippageOutOfRangeError,
      { status: 400, message: 'Slippage is out of the allowed range.' },
    ],
  ]

/**
 * Translate a thrown SDK error to a structured HTTP response shape.
 * Returns `undefined` when the error isn't recognized; callers fall back
 * to their domain-specific generic message (preserves the lend / swap
 * 500 pattern).
 *
 * Wrapped in try/catch so a renamed or missing SDK class never crashes
 * the mapper.
 */
export function mapSdkError(error: unknown): MappedSdkError | undefined {
  try {
    for (const [Ctor, mapped] of SDK_ERROR_MAPPINGS) {
      if (error instanceof Ctor) return mapped
    }
    return undefined
  } catch {
    return undefined
  }
}
