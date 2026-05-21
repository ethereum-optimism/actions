import {
  findBorrowMarketInAllowlist,
  marketIdMatches,
} from '@/actions/borrow/core/markets.js'
import { findMatchingConfig } from '@/actions/shared/marketConfigs.js'
import {
  AddressRequiredError,
  InvalidParamsError,
  MarketNotAllowedError,
  ProviderNotConfiguredError,
  QuoteExpiredError,
} from '@/core/error/errors.js'
import type { BorrowProviderConfig } from '@/types/actions.js'
import type {
  BorrowMarketConfig,
  BorrowMarketId,
  BorrowQuote,
} from '@/types/borrow/index.js'
import { validateNotZeroAddress } from '@/utils/validation.js'

/**
 * Reject missing or zero-address wallet addresses on borrow write/read calls.
 * @description Folds the two-step check (`AddressRequiredError` for
 * missing, `ZeroAddressError` for the zero literal) into a single call so
 * provider methods don't repeat the pair.
 */
export function validateBorrowWalletAddress(
  walletAddress: `0x${string}` | undefined,
): asserts walletAddress is `0x${string}` {
  if (!walletAddress) {
    throw new AddressRequiredError('walletAddress')
  }
  validateNotZeroAddress(walletAddress, 'walletAddress')
}

/**
 * Reject a pre-built `BorrowQuote` whose `action` doesn't match the wallet
 * dispatch method that received it (e.g. passing an `open` quote to
 * `wallet.borrow.repay`).
 */
export function validateQuoteAction(
  quote: BorrowQuote,
  expectedAction: BorrowQuote['action'],
): void {
  if (quote.action !== expectedAction) {
    throw new InvalidParamsError({
      param: 'quote.action',
      expected: expectedAction,
      received: quote.action,
    })
  }
}

/**
 * Reject a pre-built `BorrowQuote` whose expiration has passed.
 */
export function validateQuoteNotExpired(quote: BorrowQuote): void {
  const now = Math.floor(Date.now() / 1000)
  if (now >= quote.expiresAt) {
    throw new QuoteExpiredError({
      expiresAt: quote.expiresAt,
      currentTime: now,
    })
  }
}

/**
 * Validate that a market is allowed by the provider allowlist and absent
 * from the provider blocklist.
 */
export function validateBorrowMarketAllowed(
  market: BorrowMarketConfig,
  config: {
    marketAllowlist?: BorrowMarketConfig[]
    marketBlocklist?: BorrowMarketConfig[]
  },
): void {
  const allowlist = config.marketAllowlist
  if (allowlist && allowlist.length > 0) {
    const hit = findBorrowMarketInAllowlist(allowlist, market)
    if (!hit) {
      throw new MarketNotAllowedError({
        address: market.marketId,
        chainId: market.chainId,
        reason: 'Market is not in the marketAllowlist',
      })
    }
  }

  const blocklist = config.marketBlocklist
  if (!blocklist?.length) return
  const blocked = findMatchingConfig(blocklist, market, marketIdMatches)
  if (!blocked) return
  throw new MarketNotAllowedError({
    address: market.marketId,
    chainId: market.chainId,
    reason: 'Market is on the marketBlocklist',
  })
}

/**
 * Strict allowlist lookup: returns the matched `BorrowMarketConfig` or
 * throws `MarketNotAllowedError`. Empty/undefined allowlists fail. Used
 * by `BorrowProvider` to resolve marketId → full config once before
 * dispatching to subclass `_*` hooks, so concrete providers don't have
 * to repeat the lookup.
 */
export function requireAllowlistedBorrowMarketConfig(
  marketId: BorrowMarketId,
  allowlist: readonly BorrowMarketConfig[] | undefined,
): BorrowMarketConfig {
  const match = findBorrowMarketInAllowlist(allowlist, marketId)
  if (!match) {
    throw new MarketNotAllowedError({
      address: marketId.marketId,
      chainId: marketId.chainId,
      reason: 'Market not in borrow provider allowlist',
    })
  }
  return match
}

/**
 * Validate that at least one configured borrow provider's allowlist
 * contains the supplied `marketId`. Used to gate dispatch of pre-built
 * quotes that arrive from untrusted (or stale) callers.
 */
export function validateBorrowMarketIdInAnyAllowlist(
  marketId: BorrowMarketId,
  providers: ReadonlyArray<{ config: BorrowProviderConfig }>,
): void {
  const hit = providers.some(
    (provider) =>
      !!findBorrowMarketInAllowlist(provider.config.marketAllowlist, marketId),
  )
  if (hit) return
  throw new ProviderNotConfiguredError({
    provider: marketId.marketId,
    details: `No borrow provider configured for market on chain ${marketId.chainId}`,
  })
}
