import { encodeAbiParameters, type Hex, keccak256 } from 'viem'

import type { MorphoMarketParams } from '@/types/borrow/index.js'

/**
 * ABI parameter shape for Morpho Blue's `MarketParams` struct.
 * @description Mirrors the struct declared at
 * `packages/demo/contracts/src/interfaces/IMorpho.sol` so the keccak256 of
 * `abi.encode(MarketParams)` produces Morpho's canonical market id.
 */
const MARKET_PARAMS_ABI = [
  { type: 'address' },
  { type: 'address' },
  { type: 'address' },
  { type: 'address' },
  { type: 'uint256' },
] as const

/**
 * Compute the canonical Morpho Blue market id for a set of `MarketParams`.
 * @description Equivalent to `keccak256(abi.encode(MarketParams))` from
 * Morpho Blue's Solidity code. Pure function — safe to call at config time,
 * during tests, or as a sanity check at provider construction.
 * @param params - Morpho Blue market parameters
 * @returns The market id as a `0x`-prefixed 32-byte hex string
 */
export function computeMorphoMarketId(params: MorphoMarketParams): Hex {
  return keccak256(
    encodeAbiParameters(MARKET_PARAMS_ABI, [
      params.loanToken,
      params.collateralToken,
      params.oracle,
      params.irm,
      params.lltv,
    ]),
  )
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
