import { marketIdMatches } from '@/actions/borrow/core/marketId.js'
import {
  filterMatchingConfigs,
  findMatchingConfig,
} from '@/actions/shared/marketConfigs.js'
import { MarketNotAllowedError } from '@/core/error/errors.js'
import type {
  BorrowMarketConfig,
  BorrowMarketId,
  GetBorrowMarketsParams,
} from '@/types/borrow/index.js'

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
    const hit = findMatchingConfig(allowlist, market, marketsMatch)
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
  const blocked = findMatchingConfig(blocklist, market, marketsMatch)
  if (!blocked) return
  throw new MarketNotAllowedError({
    address: market.marketId,
    chainId: market.chainId,
    reason: 'Market is on the marketBlocklist',
  })
}

export function validateBorrowMarketIdAllowed(
  marketId: BorrowMarketId,
  config: { marketAllowlist?: BorrowMarketConfig[] },
): void {
  const allowlist = config.marketAllowlist
  if (!allowlist || allowlist.length === 0) return
  const hit = findMatchingConfig(allowlist, marketId, marketIdMatches)
  if (hit) return
  throw new MarketNotAllowedError({
    address: marketId.marketId,
    chainId: marketId.chainId,
    reason: 'Market is not in the marketAllowlist',
  })
}

/**
 * Filter the configured allowlist by `getMarkets` query parameters.
 */
export function filterBorrowMarketConfigs(
  config: { marketAllowlist?: BorrowMarketConfig[] },
  params: GetBorrowMarketsParams,
): BorrowMarketConfig[] {
  return filterMatchingConfigs(config.marketAllowlist, [
    params.chainId === undefined
      ? undefined
      : (market) => market.chainId === params.chainId,
    params.collateralAsset === undefined
      ? undefined
      : (market) => market.collateralAsset === params.collateralAsset,
    params.borrowAsset === undefined
      ? undefined
      : (market) => market.borrowAsset === params.borrowAsset,
  ])
}

function marketsMatch(a: BorrowMarketConfig, b: BorrowMarketConfig): boolean {
  return marketIdMatches(a, b)
}
