import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'
import type {
  GetSwapMarketsParams,
  SwapMarket,
  SwapMarketConfig,
} from '@/types/swap/index.js'

/**
 * Generate unique asset pairs, optionally filtered to pairs containing a required asset.
 * @param assets - Full list of assets from a market config
 * @param requiredAsset - If set, only pairs including this asset are returned
 */
export function assetPairs(
  assets: Asset[],
  requiredAsset?: Asset,
): Array<[Asset, Asset]> {
  return assets
    .flatMap((a, i) => assets.slice(i + 1).map((b): [Asset, Asset] => [a, b]))
    .filter(
      ([a, b]) => !requiredAsset || a === requiredAsset || b === requiredAsset,
    )
}

/**
 * Sort two addresses for deterministic pool ID computation.
 * @returns [lower, higher] addresses
 */
export function sortAddressPair(
  addrA: string,
  addrB: string,
): [string, string] {
  return addrA.toLowerCase() < addrB.toLowerCase()
    ? [addrA, addrB]
    : [addrB, addrA]
}

/**
 * Find a specific market by poolId across a set of configs.
 * @param configs - Valid market configs to search
 * @param chainId - Target chain
 * @param poolId - Pool ID to match
 * @param toMarkets - Provider-specific function that expands a config into SwapMarket[]
 * @returns Matching market
 * @throws If no matching market found
 */
export function findMarket<T extends SwapMarketConfig>(
  configs: T[],
  chainId: SupportedChainId,
  poolId: string,
  toMarkets: (config: T, chainId: SupportedChainId) => SwapMarket[],
): SwapMarket {
  for (const config of configs) {
    if (config.chainId !== undefined && config.chainId !== chainId) continue
    const match = toMarkets(config, chainId).find(
      (m) => m.marketId.poolId === poolId,
    )
    if (match) return match
  }
  throw new Error(`Market with poolId ${poolId} not found on chain ${chainId}`)
}

/**
 * Expand market configs into concrete SwapMarket objects with optional filters.
 * @param configs - Valid market configs
 * @param params - Optional chainId and asset filters
 * @param supportedChainIds - All chain IDs this provider supports
 * @param toMarkets - Provider-specific function that expands a config into SwapMarket[]
 */
export function expandMarkets<T extends SwapMarketConfig>(
  configs: T[],
  params: GetSwapMarketsParams,
  supportedChainIds: SupportedChainId[],
  toMarkets: (
    config: T,
    chainId: SupportedChainId,
    asset?: Asset,
  ) => SwapMarket[],
): SwapMarket[] {
  return configs.flatMap((config) => {
    const chainIds = params.chainId
      ? [params.chainId]
      : config.chainId
        ? [config.chainId]
        : supportedChainIds

    return chainIds.flatMap((chainId) =>
      toMarkets(config, chainId, params.asset),
    )
  })
}
