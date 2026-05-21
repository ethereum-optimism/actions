import { MarketUtils } from '@morpho-org/blue-sdk'
import type { Hex } from 'viem'

import type { MorphoMarketParams } from '@/types/borrow/index.js'

/**
 * Compute the canonical Morpho Blue market id for a set of `MarketParams`.
 * @description Delegates to `@morpho-org/blue-sdk`'s `MarketUtils.getMarketId`,
 * which computes `keccak256(abi.encode(MarketParams))` per Morpho's
 * Solidity. Pure function, safe to call at config time, during tests, or
 * as a sanity check at provider construction.
 * @param params - Morpho Blue market parameters
 * @returns The market id as a `0x`-prefixed 32-byte hex string
 */
export function computeMorphoMarketId(params: MorphoMarketParams): Hex {
  return MarketUtils.getMarketId(params)
}

/**
 * Verify that a market id matches the supplied `MarketParams`.
 * @description Convenience wrapper around `computeMorphoMarketId` for
 * comparison; case-insensitive on the hex digits.
 * @param marketId - The expected market id (typically from `deployments.json`)
 * @param params - The market parameters to check
 * @returns `true` when the computed id matches `marketId`, otherwise `false`
 */
export function verifyMorphoMarketId(
  marketId: Hex,
  params: MorphoMarketParams,
): boolean {
  return computeMorphoMarketId(params).toLowerCase() === marketId.toLowerCase()
}
