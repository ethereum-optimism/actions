import type {
  SwapMarketFilter,
  SwapProviderConfig,
} from '@/types/swap/index.js'

/**
 * Uniswap-specific market filter with V4 pool parameters
 */
export interface UniswapMarketFilter extends SwapMarketFilter {
  /** Fee tier in pips (e.g. 100 = 0.01%) */
  fee?: number
  /** Tick spacing for the pool */
  tickSpacing?: number
}

/**
 * Uniswap swap provider configuration
 */
export interface UniswapSwapProviderConfig extends SwapProviderConfig {
  marketAllowlist?: UniswapMarketFilter[]
  marketBlocklist?: UniswapMarketFilter[]
  /** Permit2 approval expiry in seconds from now. Defaults to 30 days. */
  permit2ExpirySeconds?: number
}
