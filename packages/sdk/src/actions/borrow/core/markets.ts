import { marketIdMatches } from '@/actions/borrow/core/marketId.js'
import type {
  BorrowMarketConfig,
  BorrowMarketId,
} from '@/types/borrow/index.js'

/**
 * Find a borrow market config in an allowlist by market id.
 * @param allowlist - Optional list of allowed markets
 * @param marketId - Market identifier to look up
 * @returns Matching market config, if any
 */
export function findBorrowMarketInAllowlist(
  allowlist: readonly BorrowMarketConfig[] | undefined,
  marketId: BorrowMarketId,
): BorrowMarketConfig | undefined {
  return allowlist?.find((market) => marketIdMatches(market, marketId))
}
