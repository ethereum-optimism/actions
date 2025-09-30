import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'
import type { LendMarket } from '@/types/lend/index.js'

/**
 * Validates that an asset matches the market's asset
 * @param market - Market information
 * @param asset - Asset to validate
 * @throws Error if asset doesn't match the market's asset
 */
export function validateMarketAsset(market: LendMarket, asset: Asset): void {
  if (!isMarketAsset(market, asset)) {
    const marketAssetAddress =
      market.asset.address[market.marketId.chainId as SupportedChainId]
    const providedAssetAddress =
      asset.address[market.marketId.chainId as SupportedChainId]
    throw new Error(
      `Asset mismatch: provided ${providedAssetAddress} but market ${market.marketId.address} uses ${marketAssetAddress}`,
    )
  }
}

/**
 * Checks if an asset matches the market's asset
 * @param market - Market information
 * @param asset - Asset to check
 * @returns true if asset matches market's asset, false otherwise
 */
export function isMarketAsset(market: LendMarket, asset: Asset): boolean {
  const marketAssetAddress =
    market.asset.address[market.marketId.chainId as SupportedChainId]
  const providedAssetAddress =
    asset.address[market.marketId.chainId as SupportedChainId]
  return marketAssetAddress === providedAssetAddress
}
