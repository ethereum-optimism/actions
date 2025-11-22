import { formatUnits } from 'viem'
import type { LendMarket } from '@eth-optimism/actions-sdk'

/**
 * Format a LendMarket response with human-readable values
 */
export function formatMarketResponse(market: LendMarket) {
  return {
    marketId: market.marketId,
    name: market.name,
    asset: market.asset,
    supply: {
      totalAssets: formatUnits(
        market.supply.totalAssets,
        market.asset.metadata.decimals,
      ),
      totalShares: formatUnits(market.supply.totalShares, 18),
    },
    apy: market.apy,
    metadata: market.metadata,
  }
}
