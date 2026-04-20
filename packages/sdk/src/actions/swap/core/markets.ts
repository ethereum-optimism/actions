import type { Address } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'
import type {
  GetSwapMarketsParams,
  SwapMarket,
  SwapMarketConfig,
} from '@/types/swap/index.js'

/**
 * Sentinel address meaning "send output to msg.sender" in Universal Router commands.
 * The Universal Router maps address(1) to msg.sender and address(2) to the router itself.
 * Only valid in Universal Router calldata encoding — do not use as a general-purpose address.
 * Both Uniswap and Velodrome/Aerodrome Universal Router forks use this convention.
 * @see https://github.com/Uniswap/universal-router/blob/main/contracts/libraries/Constants.sol
 */
export const UNIVERSAL_ROUTER_MSG_SENDER =
  '0x0000000000000000000000000000000000000001' as Address

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
 * @param options.configs - Valid market configs
 * @param options.filters - Optional chainId and asset filters
 * @param options.supportedChainIds - All chain IDs this provider supports
 * @param options.toMarkets - Provider-specific function that expands a config into SwapMarket[]
 */
export function expandMarkets<T extends SwapMarketConfig>(options: {
  configs: T[]
  filters: GetSwapMarketsParams
  supportedChainIds: SupportedChainId[]
  toMarkets: (
    config: T,
    chainId: SupportedChainId,
    asset?: Asset,
  ) => SwapMarket[]
}): SwapMarket[] {
  const { configs, filters, supportedChainIds, toMarkets } = options
  return configs.flatMap((config) => {
    const chainIds = filters.chainId
      ? [filters.chainId]
      : config.chainId
        ? [config.chainId]
        : supportedChainIds

    return chainIds.flatMap((chainId) =>
      toMarkets(config, chainId, filters.asset),
    )
  })
}
