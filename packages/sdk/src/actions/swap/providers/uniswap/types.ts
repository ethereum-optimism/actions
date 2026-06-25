import type { Asset } from '@/types/asset.js'
import type {
  SwapMarketConfig,
  SwapProviderConfig,
} from '@/types/swap/index.js'

/**
 * One segment of a multi-hop V4 route.
 *
 * Each hop describes the pool whose **output** is `asset`: i.e. for a path
 * `assets[0] → A → assets[1]`, the hops are `[{ asset: A, ... }, { asset: assets[1], ... }]`,
 * where hop 0's pool is `assets[0]/A` and hop 1's pool is `A/assets[1]`.
 */
export interface UniswapPathHop {
  /** Output currency of this hop (an intermediate, or the final output asset). */
  asset: Asset
  /** Fee tier in pips for this hop's pool (e.g. 100 = 0.01%) */
  fee: number
  /** Tick spacing for this hop's pool */
  tickSpacing: number
}

/**
 * Uniswap-specific market config with V4 pool parameters
 */
export interface UniswapMarketConfig extends SwapMarketConfig {
  /** Fee tier in pips (e.g. 100 = 0.01%) */
  fee?: number
  /** Tick spacing for the pool */
  tickSpacing?: number
  /**
   * Explicit multi-hop route from `assets[0]` to `assets[1]`, ordered output-first
   * per hop. When set with 2+ hops, swaps for this pair route through V4's
   * path-based `SWAP_EXACT_IN` / `SWAP_EXACT_OUT` instead of a direct pool.
   * Reverse-direction swaps reuse this same forward path, walked backward.
   */
  path?: UniswapPathHop[]
}

/**
 * Uniswap swap provider configuration.
 * Provider-level values override the shared SwapGlobalConfig.
 */
export interface UniswapSwapProviderConfig extends SwapProviderConfig {
  marketAllowlist?: UniswapMarketConfig[]
  marketBlocklist?: UniswapMarketConfig[]
  /** Permit2 sub-approval expiration override in seconds from now. */
  permit2ExpirationSeconds?: number
}
