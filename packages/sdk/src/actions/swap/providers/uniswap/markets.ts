import { type Address, encodeAbiParameters, keccak256 } from 'viem'

import { assetPairs } from '@/actions/swap/core/markets.js'
import { POOL_KEY_ABI_TYPE } from '@/actions/swap/providers/uniswap/abis.js'
import { UNISWAP } from '@/constants/providers.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'
import type { SwapMarket } from '@/types/swap/index.js'

import type { UniswapMarketConfig } from './types.js'

/** Validated Uniswap market config with required fee and tickSpacing */
export type ValidUniswapConfig = UniswapMarketConfig & {
  fee: number
  tickSpacing: number
}

/**
 * Filter market allowlist to configs with required fee and tickSpacing.
 */
export function getValidMarketConfigs(
  allowlist?: UniswapMarketConfig[],
): ValidUniswapConfig[] {
  return (allowlist ?? []).filter(
    (f): f is ValidUniswapConfig =>
      f.fee !== undefined && f.tickSpacing !== undefined,
  )
}

/**
 * Expand a single UniswapMarketConfig into SwapMarket objects for a given chain.
 * Used as the `toMarkets` callback for shared findMarket/expandMarkets.
 */
export function configToMarkets(
  config: ValidUniswapConfig,
  chainId: SupportedChainId,
  asset?: Asset,
): SwapMarket[] {
  return assetPairs(config.assets, asset)
    .map(([a, b]) =>
      pairToMarket(a, b, chainId, config.fee, config.tickSpacing),
    )
    .filter((m): m is SwapMarket => m !== null)
}

/**
 * Build a SwapMarket from two assets and V4 pool parameters.
 * Computes a deterministic poolId from the sorted pool key.
 * @returns SwapMarket, or null if either asset lacks an address on this chain
 */
function pairToMarket(
  assetA: Asset,
  assetB: Asset,
  chainId: SupportedChainId,
  fee: number,
  tickSpacing: number,
): SwapMarket | null {
  const addrA = assetA.address[chainId]
  const addrB = assetB.address[chainId]
  if (!addrA || addrA === 'native' || !addrB || addrB === 'native') return null

  const [currency0, currency1] =
    addrA.toLowerCase() < addrB.toLowerCase() ? [addrA, addrB] : [addrB, addrA]

  // V4 requires currency0 < currency1 for deterministic pool keys
  // PoolId = keccak256(abi.encode(PoolKey)) per V4's PoolIdLibrary
  // @see https://github.com/Uniswap/v4-core/blob/main/src/types/PoolId.sol
  const poolId = keccak256(
    encodeAbiParameters(POOL_KEY_ABI_TYPE, [
      currency0 as Address,
      currency1 as Address,
      fee,
      tickSpacing,
      '0x0000000000000000000000000000000000000000' as Address,
    ]),
  )

  return {
    marketId: { poolId, chainId },
    assets: [assetA, assetB],
    fee,
    provider: UNISWAP,
  }
}
