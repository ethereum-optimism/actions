import type { Address } from 'viem'
import { concat, keccak256 } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { assetPairs } from '@/swap/core/markets.js'
import type { Asset } from '@/types/asset.js'
import type { SwapMarket } from '@/types/swap/index.js'

import type { ResolvedPoolConfig, VelodromeMarketConfig } from './types.js'

/**
 * Resolve a VelodromeMarketConfig to a discriminated ResolvedPoolConfig.
 * Exactly one of stable or tickSpacing must be set.
 * @param config - Raw market config
 * @returns Resolved pool config with discriminated type
 * @throws If both or neither of stable/tickSpacing are set
 */
export function resolvePoolConfig(
  config: VelodromeMarketConfig,
): ResolvedPoolConfig {
  const hasStable = config.stable !== undefined
  const hasTick = config.tickSpacing !== undefined
  if (hasStable && hasTick) {
    throw new Error(
      'stable and tickSpacing are mutually exclusive — set one, not both',
    )
  }
  if (!hasStable && !hasTick) {
    throw new Error(
      'Either stable (v2 AMM) or tickSpacing (CL) must be configured',
    )
  }
  if (hasTick) {
    return { type: 'cl', tickSpacing: config.tickSpacing! }
  }
  return { type: 'v2', stable: config.stable! }
}

/**
 * Expand a single VelodromeMarketConfig into SwapMarket objects for a given chain.
 * Used as the `toMarkets` callback for shared findMarket/expandMarkets.
 * @param config - Market config with pool parameters
 * @param chainId - Target chain
 * @param asset - If provided, only return markets containing this asset
 */
export function configToMarkets(
  config: VelodromeMarketConfig,
  chainId: SupportedChainId,
  asset?: Asset,
): SwapMarket[] {
  const poolConfig = resolvePoolConfig(config)
  return assetPairs(config.assets, asset)
    .map(([a, b]) => pairToMarket(a, b, chainId, poolConfig))
    .filter((m): m is SwapMarket => m !== null)
}

/**
 * Build a SwapMarket from two assets and Velodrome pool parameters.
 * For v2: poolId = keccak256(sortedA, sortedB, stable)
 * For CL: poolId = keccak256(sortedA, sortedB, tickSpacing as int24)
 * @returns SwapMarket, or null if either asset lacks an address on this chain
 */
function pairToMarket(
  assetA: Asset,
  assetB: Asset,
  chainId: SupportedChainId,
  poolConfig: ResolvedPoolConfig,
): SwapMarket | null {
  const addrA = assetA.address[chainId]
  const addrB = assetB.address[chainId]
  if (!addrA || addrA === 'native' || !addrB || addrB === 'native') return null

  const [sortedA, sortedB] =
    addrA.toLowerCase() < addrB.toLowerCase() ? [addrA, addrB] : [addrB, addrA]

  let poolId: string
  if (poolConfig.type === 'cl') {
    const tickBytes =
      `0x${(poolConfig.tickSpacing & 0xffffff).toString(16).padStart(6, '0')}` as `0x${string}`
    poolId = keccak256(
      concat([sortedA as Address, sortedB as Address, tickBytes]),
    )
  } else {
    poolId = keccak256(
      concat([
        sortedA as Address,
        sortedB as Address,
        poolConfig.stable ? '0x01' : '0x00',
      ]),
    )
  }

  return {
    marketId: { poolId, chainId },
    assets: [assetA, assetB],
    fee: 0,
    provider: 'velodrome' as SwapMarket['provider'],
  }
}
