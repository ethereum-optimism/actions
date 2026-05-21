import {
  computeMorphoMarketId,
  verifyMorphoMarketId,
} from '@/actions/shared/morpho/marketParams.js'
import { BorrowMarketParamsMismatchError } from '@/core/error/errors.js'
import type { BorrowMarketConfig } from '@/types/borrow/index.js'

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
