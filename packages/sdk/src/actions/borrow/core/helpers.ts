import { filterMatchingConfigs } from '@/actions/shared/marketConfigs.js'
import type {
  BorrowMarketConfig,
  GetBorrowMarketsParams,
} from '@/types/borrow/index.js'

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
