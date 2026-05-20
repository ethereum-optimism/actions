import { findBorrowMarketInAllowlist } from '@/actions/borrow/core/markets.js'
import {
  computeMorphoMarketId,
  verifyMorphoMarketId,
} from '@/actions/shared/morpho/marketParams.js'
import {
  BorrowMarketParamsMismatchError,
  MarketNotAllowedError,
} from '@/core/error/errors.js'
import type {
  BorrowMarketConfig,
  BorrowMarketId,
} from '@/types/borrow/index.js'

export function verifyMorphoAllowlistMarketIds(
  allowlist: BorrowMarketConfig[] | undefined,
): void {
  if (!allowlist?.length) return
  for (const market of allowlist) {
    if (market.kind !== 'morpho-blue') continue
    if (!verifyMorphoMarketId(market.marketId, market.marketParams)) {
      throw new BorrowMarketParamsMismatchError({
        marketId: market.marketId,
        computedMarketId: computeMorphoMarketId(market.marketParams),
      })
    }
  }
}

export function requireMorphoAllowlistMarket(
  allowlist: BorrowMarketConfig[] | undefined,
  marketId: BorrowMarketId,
): BorrowMarketConfig {
  const match = findBorrowMarketInAllowlist(allowlist, marketId)
  if (!match) {
    throw new MarketNotAllowedError({
      chainId: marketId.chainId,
      address: marketId.marketId,
      reason: 'Market not in MorphoBorrowProvider allowlist',
    })
  }
  return match
}
